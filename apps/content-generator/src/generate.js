// 혜택 수집 결과(shared/schemas/benefit.ts)를 LLM에 넣어 카피를 만들고, 수집 원문의 사실 필드와
// 합쳐 shared/schemas/card-news.ts 스키마의 카드뉴스 JSON을 만드는 CLI.
//
// 흐름: LLM 카피 생성 → assemble(사실 필드 주입) → 스키마 검증 → fact-check(원문 대조)
//   fact-check에 실패하면 문제 목록을 넣어 1회 재생성하고, 그래도 실패하면 <out>.failed.json을
//   남기고 실패한다 — 틀린 정보를 내보내는 것보다 낫다. (_docs/topic-pivot-benefits-plan.md §6.3)
//
// Gemini(1순위, 무료)가 429(할당량 소진)·500·503(과부하)으로 재시도까지 실패하거나 시간 초과(504·타임아웃)면
// Claude Haiku(폴백)로 자동 전환한다. 그 외 에러(스키마 검증 실패, 인증 오류 등)는
// 폴백하지 않고 즉시 실패시킨다 — 우리 쪽 버그를 폴백이 가리면 안 되기 때문.
// 배경: _docs/llm-provider-fallback-plan.md
//
// 사용법:
//   npm run generate -- --handle hotsoozip
//   npm run generate -- --input ../benefit-collector/output/xxx-adopted.json --handle hotsoozip --out output/test.json

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import {
  SYSTEM_PROMPT,
  CARD_NEWS_RESPONSE_SCHEMA,
  CARD_NEWS_ZOD_SCHEMA,
  buildUserMessage,
  buildRetryMessage,
} from './prompt.js';
import { assembleCardNews } from './assemble.js';
import { checkFacts } from './fact-check.js';
import { buildCaption } from './caption.js';
import { assertValidCardNewsData } from '../../../shared/schemas/validate-card-news.js';
import { assertValidCollectedBenefits } from '../../../shared/schemas/validate-benefits.js';

// 입력을 생략하면 실제 보조금24 데이터로 만든 샘플을 쓴다
const DEFAULT_INPUT = '../../shared/schemas/collected-benefits.example.json';

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, handle: null, out: null, today: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--handle') args.handle = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--today') args.today = argv[++i];
  }
  return args;
}

function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 프로바이더별 "잠깐 기다리면 풀릴 만한" 상태 코드 — 같은 프로바이더로 지수 백오프 재시도.
// Gemini와 Anthropic(529 = overloaded)은 값이 달라 각자 따로 둔다.
const GEMINI_RETRYABLE_STATUS = new Set([429, 500, 503]);
const ANTHROPIC_RETRYABLE_STATUS = new Set([429, 500, 529]);

// Gemini SDK는 기본 타임아웃이 없다(Node fetch의 5분 제한도 꺼 둠). 과부하 때는 응답이 수 분씩
// 늦어지므로 시도마다 상한을 건다. SDK는 이 값을 X-Server-Timeout 헤더로 서버에도 보내서,
// 보통 서버가 먼저 504 DEADLINE_EXCEEDED로 끊는다. benefit-collector/src/lib/llm.js와 같은 규칙.
// 서버는 10초 미만 deadline을 400으로 거절한다 ("Minimum allowed deadline is 10s")
const GEMINI_TIMEOUT_MS = Math.max(10_000, Number(process.env.GEMINI_TIMEOUT_MS) || 120_000);

// 시간 초과 — 서버의 504 또는 클라이언트 abort(상태 코드 없음). 느린 상태는 다시 보내도 또 느려서
// 재시도 없이 바로 Haiku로 넘긴다
const isDeadlineError = (err) => err?.status === 504 || err?.name === 'AbortError' || err?.name === 'TimeoutError';
const shouldFallBackFromGemini = (err) => GEMINI_RETRYABLE_STATUS.has(err?.status) || isDeadlineError(err);

// 일시적 과부하/할당량 재시도는 지수 백오프로 최대 4회(최초 1회 + 재시도 3회) 시도.
async function withRetry(fn, retryableStatus, { attempts = 4, baseDelayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!retryableStatus.has(err?.status) || attempt === attempts) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.log(`  → ${err.status} 응답(일시적 과부하로 추정), ${delay / 1000}초 후 재시도 (${attempt}/${attempts - 1})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function generateWithGemini(rawMaterial) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY가 없습니다. apps/content-generator/.env 파일을 만들고 GEMINI_API_KEY=발급받은키 를 추가하세요 (.env.example 참고).',
    );
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: GEMINI_TIMEOUT_MS } });

  // ai.interactions.create()(신형 "next-gen" 엔드포인트)는 요청 본문을 스트림으로
  // 만들어서, 재시도 시 request.clone()이 "TypeError: unusable"로 실패하는 SDK 버그가
  // 있었다(재시도를 꺼도 재현됨). ai.models.generateContent()는 구형 안정 엔드포인트라
  // 이 문제가 없어서 이쪽으로 전환.
  console.log(`Gemini(${model}) 호출 중...`);
  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model,
        contents: rawMaterial,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: CARD_NEWS_RESPONSE_SCHEMA,
        },
      }),
    GEMINI_RETRYABLE_STATUS,
  );

  const outputText = response.text;
  if (!outputText) {
    throw new Error('Gemini 응답에서 텍스트를 찾지 못했습니다. SDK/API 응답 형식이 바뀌었을 수 있습니다.');
  }
  return { text: outputText, model };
}

async function generateWithHaiku(rawMaterial) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY가 없습니다. apps/content-generator/.env 파일에 ANTHROPIC_API_KEY=발급받은키 를 추가하세요 (.env.example 참고) — Gemini 폴백에 필요합니다.',
    );
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log(`Claude(${model}) 호출 중... (Gemini 폴백)`);
  const response = await withRetry(
    () =>
      client.messages.parse({
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: rawMaterial }],
        output_config: { format: zodOutputFormat(CARD_NEWS_ZOD_SCHEMA) },
      }),
    ANTHROPIC_RETRYABLE_STATUS,
  );

  if (!response.parsed_output) {
    throw new Error('Claude 응답의 구조화 출력 파싱에 실패했습니다. SDK/API 응답 형식이 바뀌었을 수 있습니다.');
  }
  return { text: JSON.stringify(response.parsed_output), model };
}

/** Gemini → (429/500/503 재시도 실패 또는 시간 초과면) Haiku 순서로 카피를 받아 JSON으로 파싱한다 */
async function generateCopy(userMessage) {
  let provider = 'gemini';
  let fellBack = false;
  let result;
  try {
    result = await generateWithGemini(userMessage);
  } catch (err) {
    if (!shouldFallBackFromGemini(err)) throw err;
    const why = isDeadlineError(err) ? `${GEMINI_TIMEOUT_MS / 1000}초 안에 응답 없음` : err.status;
    console.warn(`\n⚠ Gemini 사용 불가(${why}), Claude Haiku로 전환합니다...`);
    console.warn(`  Gemini 에러 원문: ${err.message}`);
    provider = 'haiku';
    fellBack = true;
    result = await generateWithHaiku(userMessage);
  }

  try {
    return { copy: JSON.parse(result.text), provider, model: result.model, fellBack };
  } catch (err) {
    throw new Error(`${provider} 응답이 JSON으로 파싱되지 않습니다: ${err.message}\n응답 원문:\n${result.text}`);
  }
}

/** 카피를 원문과 합치고 검증한다. errors가 비어 있으면 그대로 내보내도 된다 */
function assembleAndCheck(copy, collected, { handle, today, provider }) {
  const { data, errors } = assembleCardNews(copy, collected, { handle, today });
  // 카드가 빠지거나 중복이면 fact-check까지 갈 필요 없이 다시 만들어야 한다
  if (errors.length > 0) return { data, errors };
  assertValidCardNewsData(data, `${provider} 응답`);
  return { data, errors: checkFacts(data, collected, { today }).errors };
}

function printErrors(errors) {
  for (const e of errors) {
    console.warn(`  - ${e.source_id ? `[${e.source_id}] ` : '[회차] '}${e.field}: ${e.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.handle) {
    throw new Error('--handle <계정 핸들>이 필요합니다. 예: npm run generate -- --handle hotsoozip');
  }

  const inputPath = resolve(process.cwd(), args.input);
  const collected = JSON.parse(readFileSync(inputPath, 'utf-8'));
  assertValidCollectedBenefits(collected, inputPath);
  const today = args.today ?? todayKst();
  const options = { handle: args.handle, today };

  const outPath = resolve(
    process.cwd(),
    args.out ?? `output/${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  mkdirSync(dirname(outPath), { recursive: true });

  const attempts = [];
  let gen = await generateCopy(buildUserMessage(collected));
  let { data, errors } = assembleAndCheck(gen.copy, collected, { ...options, provider: gen.provider });
  attempts.push({ provider: gen.provider, model: gen.model, fellBack: gen.fellBack, errors });

  if (errors.length > 0) {
    console.warn(`\n⚠ 검증 실패 ${errors.length}건, 문제 목록을 넣어 1회 재생성합니다:`);
    printErrors(errors);
    gen = await generateCopy(buildRetryMessage(collected, gen.copy, errors));
    ({ data, errors } = assembleAndCheck(gen.copy, collected, { ...options, provider: gen.provider }));
    attempts.push({ provider: gen.provider, model: gen.model, fellBack: gen.fellBack, errors });
  }

  // 어느 프로바이더가 생성했고 검증을 몇 번 거쳤는지는 card-news.ts 스키마를 건드리지 않고
  // 결과 파일 옆 사이드카 메타로만 남긴다 (card-renderer는 이 파일을 몰라도 됨).
  const meta = {
    provider: gen.provider,
    model: gen.model,
    fellBack: gen.fellBack,
    generatedAt: new Date().toISOString(),
    input: inputPath,
    factCheck: { passed: errors.length === 0, attempts },
  };

  if (errors.length > 0) {
    const failedPath = outPath.replace(/\.json$/, '.failed.json');
    writeFileSync(failedPath, JSON.stringify({ errors, data, meta }, null, 2), 'utf-8');
    console.error('\n재생성 후에도 검증에 실패했습니다:');
    printErrors(errors);
    throw new Error(`틀린 정보를 내보내지 않도록 중단합니다. 확인용 결과: ${failedPath}`);
  }

  writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  writeFileSync(outPath.replace(/\.json$/, '.meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
  writeFileSync(outPath.replace(/\.json$/, '.caption.txt'), buildCaption(data), 'utf-8');

  console.log(`\n✔ 카드 ${data.cards.length}개짜리 카드뉴스 JSON을 생성했습니다: ${outPath}`);
  console.log(`  provider: ${gen.provider}${gen.fellBack ? ' (Gemini 폴백)' : ''} / model: ${gen.model}`);
  console.log(`  fact-check: 통과 (${attempts.length}회 생성)`);
  console.log(`  series_title: ${data.series_title}`);
}

main().catch((err) => {
  console.error(`\n✘ 생성 실패: ${err.message}`);
  if (err.cause) console.error('원인(cause):', err.cause);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
