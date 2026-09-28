// 리서치 원본 텍스트를 LLM에 넣어 shared/schemas/card-news.ts 스키마에 맞는
// 카드뉴스 JSON을 뽑아내는 CLI.
//
// Gemini(1순위, 무료)가 429(할당량 소진)/503(과부하)으로 재시도까지 실패하면
// Claude Haiku(폴백)로 자동 전환한다. 그 외 에러(스키마 검증 실패, 인증 오류 등)는
// 폴백하지 않고 즉시 실패시킨다 — 우리 쪽 버그를 폴백이 가리면 안 되기 때문.
// 배경: _docs/llm-provider-fallback-plan.md
//
// 사용법:
//   npm run generate -- --handle zinoo_travel
//   npm run generate -- --input sample-input.txt --handle zinoo_travel --out output/test.json

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { SYSTEM_PROMPT, CARD_NEWS_RESPONSE_SCHEMA, CARD_NEWS_ZOD_SCHEMA } from './prompt.js';
import { assertValidCardNewsData } from '../../../shared/schemas/validate-card-news.js';

function parseArgs(argv) {
  const args = { input: 'sample-input.txt', handle: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--handle') args.handle = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

// 프로바이더별 "재시도해볼 만한" 상태 코드. Gemini 429/503과 Anthropic
// 429/500/529(overloaded)는 서로 다른 값이라 각자 따로 둔다.
// (참고: Anthropic 5xx는 429와 함께 재시도 대상, 4xx 중 429만 예외)
const GEMINI_RETRYABLE_STATUS = new Set([429, 503]);
const ANTHROPIC_RETRYABLE_STATUS = new Set([429, 500, 529]);

// 일시적 과부하/할당량 재시도는 지수 백오프로 최대 4회(최초 1회 + 재시도 3회) 시도.
async function withRetry(fn, retryableStatus, { attempts = 4, baseDelayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const retryable = retryableStatus.has(err.status);
      if (!retryable || attempt === attempts) throw err;
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
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.handle) {
    throw new Error('--handle <계정 핸들>이 필요합니다. 예: npm run generate -- --handle zinoo_travel');
  }

  const inputPath = resolve(process.cwd(), args.input);
  const rawMaterial = readFileSync(inputPath, 'utf-8');

  let provider = 'gemini';
  let fellBack = false;
  let result;
  try {
    result = await generateWithGemini(rawMaterial);
  } catch (err) {
    if (!GEMINI_RETRYABLE_STATUS.has(err.status)) throw err;
    console.warn(`\n⚠ Gemini 사용 불가(${err.status}), Claude Haiku로 전환합니다...`);
    console.warn(`  Gemini 에러 원문: ${err.message}`);
    provider = 'haiku';
    fellBack = true;
    result = await generateWithHaiku(rawMaterial);
  }

  let data;
  try {
    data = JSON.parse(result.text);
  } catch (err) {
    throw new Error(`${provider} 응답이 JSON으로 파싱되지 않습니다: ${err.message}\n응답 원문:\n${result.text}`);
  }

  // source_handle / cta_card.handle은 LLM이 만드는 값이 아니라 우리 계정 정보라 여기서 주입한다.
  data.source_handle = args.handle;
  data.cta_card.handle = args.handle;

  assertValidCardNewsData(data, `${provider} 응답`);

  const outPath = resolve(
    process.cwd(),
    args.out ?? `output/${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');

  // 어느 프로바이더가 실제로 생성했는지는 card-news.ts 스키마를 건드리지 않고
  // 결과 파일 옆 사이드카 메타로만 남긴다 (card-renderer는 이 파일을 몰라도 됨).
  const metaPath = outPath.replace(/\.json$/, '.meta.json');
  writeFileSync(
    metaPath,
    JSON.stringify({ provider, model: result.model, fellBack, generatedAt: new Date().toISOString() }, null, 2),
    'utf-8',
  );

  console.log(`\n✔ 카드 ${data.cards.length}개짜리 카드뉴스 JSON을 생성했습니다: ${outPath}`);
  console.log(`  provider: ${provider}${fellBack ? ' (Gemini 폴백)' : ''} / model: ${result.model}`);
  console.log(`  series_title: ${data.series_title}`);
}

main().catch((err) => {
  console.error(`\n✘ 생성 실패: ${err.message}`);
  if (err.cause) console.error('원인(cause):', err.cause);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
