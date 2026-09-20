// 리서치 원본 텍스트를 Gemini에 넣어 shared/schemas/card-news.ts 스키마에 맞는
// 카드뉴스 JSON을 뽑아내는 CLI.
//
// 사용법:
//   npm run generate -- --handle zinoo_travel
//   npm run generate -- --input sample-input.txt --handle zinoo_travel --out output/test.json

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { SYSTEM_PROMPT, CARD_NEWS_RESPONSE_SCHEMA } from './prompt.js';
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY가 없습니다. apps/content-generator/.env 파일을 만들고 GEMINI_API_KEY=발급받은키 를 추가하세요 (.env.example 참고).',
    );
  }
  if (!args.handle) {
    throw new Error('--handle <계정 핸들>이 필요합니다. 예: npm run generate -- --handle zinoo_travel');
  }

  const inputPath = resolve(process.cwd(), args.input);
  const rawMaterial = readFileSync(inputPath, 'utf-8');

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  // retryOptions.attempts: 1 → 재시도 없이 1회만 시도. 기본값(5회 재시도)일 때
  // 요청 본문 스트림 재사용 버그로 보이는 "TypeError: unusable"이 나서, 실제 원인이
  // 드러나도록 재시도를 꺼둔다.
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { retryOptions: { attempts: 1 } },
  });

  console.log(`Gemini(${model}) 호출 중...`);
  const interaction = await ai.interactions.create({
    model,
    input: rawMaterial,
    system_instruction: SYSTEM_PROMPT,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: CARD_NEWS_RESPONSE_SCHEMA,
    },
  });

  const outputText = interaction.output_text ?? interaction.text;
  if (!outputText) {
    throw new Error('Gemini 응답에서 텍스트를 찾지 못했습니다. SDK/API 응답 형식이 바뀌었을 수 있습니다.');
  }

  let data;
  try {
    data = JSON.parse(outputText);
  } catch (err) {
    throw new Error(`Gemini 응답이 JSON으로 파싱되지 않습니다: ${err.message}\n응답 원문:\n${outputText}`);
  }

  // source_handle / cta_card.handle은 LLM이 만드는 값이 아니라 우리 계정 정보라 여기서 주입한다.
  data.source_handle = args.handle;
  data.cta_card.handle = args.handle;

  assertValidCardNewsData(data, 'Gemini 응답');

  const outPath = resolve(
    process.cwd(),
    args.out ?? `output/${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');

  console.log(`\n✔ 카드 ${data.cards.length}개짜리 카드뉴스 JSON을 생성했습니다: ${outPath}`);
  console.log(`  series_title: ${data.series_title}`);
}

main().catch((err) => {
  console.error(`\n✘ 생성 실패: ${err.message}`);
  if (err.cause) console.error('원인(cause):', err.cause);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
