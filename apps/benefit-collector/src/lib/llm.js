// 구조화 JSON 응답을 받는 LLM 호출. Gemini(1순위, 무료) → 429/503이면 Claude Haiku(폴백).
// content-generator/src/generate.js와 같은 방식이다 (배경: _docs/llm-provider-fallback-plan.md).
// 앱마다 의존성이 따로라 공용 폴더(shared/)로 못 빼고 여기 따로 둔다 — 재시도·폴백 규칙을 바꾸면 같이 바꿀 것.

import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const GEMINI_RETRYABLE_STATUS = new Set([429, 503]);
const ANTHROPIC_RETRYABLE_STATUS = new Set([429, 500, 529]);

async function withRetry(fn, retryableStatus, { attempts = 4, baseDelayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!retryableStatus.has(err.status) || attempt === attempts) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.log(`  → ${err.status} 응답(일시적 과부하로 추정), ${delay / 1000}초 후 재시도 (${attempt}/${attempts - 1})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function generateWithGemini({ system, user, jsonSchema }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY가 없습니다. apps/benefit-collector/.env에 GEMINI_API_KEY=발급받은키 를 추가하세요 (.env.example 참고).',
    );
  }
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model,
        contents: user,
        config: { systemInstruction: system, responseMimeType: 'application/json', responseSchema: jsonSchema },
      }),
    GEMINI_RETRYABLE_STATUS,
  );
  if (!response.text) throw new Error('Gemini 응답에서 텍스트를 찾지 못했습니다.');
  return { text: response.text, model };
}

async function generateWithHaiku({ system, user, zodSchema }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY가 없습니다. apps/benefit-collector/.env에 ANTHROPIC_API_KEY=발급받은키 를 추가하세요 — Gemini 폴백에 필요합니다.',
    );
  }
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await withRetry(
    () =>
      client.messages.parse({
        model,
        max_tokens: 16000,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { format: zodOutputFormat(zodSchema) },
      }),
    ANTHROPIC_RETRYABLE_STATUS,
  );
  if (!response.parsed_output) throw new Error('Claude 응답의 구조화 출력 파싱에 실패했습니다.');
  return { text: JSON.stringify(response.parsed_output), model };
}

/**
 * @param {{ system: string, user: string, jsonSchema: object, zodSchema: import('zod').ZodType }} request
 *   jsonSchema(Gemini)와 zodSchema(Claude)는 같은 구조여야 한다
 * @returns {Promise<{ json: any, provider: 'gemini'|'haiku', model: string }>}
 */
export async function generateJson(request) {
  let provider = 'gemini';
  let result;
  try {
    result = await generateWithGemini(request);
  } catch (err) {
    if (!GEMINI_RETRYABLE_STATUS.has(err.status)) throw err;
    console.warn(`  ⚠ Gemini 사용 불가(${err.status}), Claude Haiku로 전환합니다`);
    provider = 'haiku';
    result = await generateWithHaiku(request);
  }
  try {
    return { json: JSON.parse(result.text), provider, model: result.model };
  } catch (err) {
    throw new Error(`${provider} 응답이 JSON으로 파싱되지 않습니다: ${err.message}\n응답 원문:\n${result.text}`);
  }
}
