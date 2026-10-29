// 구조화 JSON 응답을 받는 LLM 호출. Gemini(1순위, 무료) → 429/500/503 재시도 실패 또는 시간 초과면 Claude Haiku(폴백).
// content-generator/src/generate.js와 같은 방식이다 (배경: _docs/llm-provider-fallback-plan.md).
// 앱마다 의존성이 따로라 공용 폴더(shared/)로 못 빼고 여기 따로 둔다 — 재시도·폴백 규칙을 바꾸면 같이 바꿀 것.

import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

// 잠깐 기다리면 풀릴 만한 상태 코드 — 같은 프로바이더로 지수 백오프 재시도
const GEMINI_RETRYABLE_STATUS = new Set([429, 500, 503]);
const ANTHROPIC_RETRYABLE_STATUS = new Set([429, 500, 529]);

// Gemini SDK는 기본 타임아웃이 없다(Node fetch의 5분 제한도 꺼 둠). 과부하 때는 응답이 수 분씩
// 늦어지므로(2026-10-30 실측: 30건 묶음 381초) 시도마다 상한을 건다. SDK는 이 값을
// X-Server-Timeout 헤더로 서버에도 보내서, 보통 서버가 먼저 504 DEADLINE_EXCEEDED로 끊는다.
// 서버는 10초 미만 deadline을 400으로 거절한다 ("Minimum allowed deadline is 10s")
export const GEMINI_TIMEOUT_MS = Math.max(10_000, Number(process.env.GEMINI_TIMEOUT_MS) || 120_000);

// 시간 초과 — 서버의 504 또는 클라이언트 abort(상태 코드 없음). 느린 상태는 다시 보내도 또 느려서
// 재시도하면 시간만 쓴다(최악 4×120초). 재시도 없이 바로 Haiku로 넘긴다
export const isDeadlineError = (err) =>
  err?.status === 504 || err?.name === 'AbortError' || err?.name === 'TimeoutError';

/** Gemini 실패 중 Haiku로 넘길 것: 재시도까지 실패한 일시적 오류 또는 시간 초과. 그 외(인증·스키마 등)는 그대로 실패 */
export const shouldFallBackFromGemini = (err) => GEMINI_RETRYABLE_STATUS.has(err?.status) || isDeadlineError(err);

export async function withRetry(fn, retryableStatus, { attempts = 4, baseDelayMs = 3000 } = {}) {
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

async function generateWithGemini({ system, user, jsonSchema }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY가 없습니다. apps/benefit-collector/.env에 GEMINI_API_KEY=발급받은키 를 추가하세요 (.env.example 참고).',
    );
  }
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: GEMINI_TIMEOUT_MS } });
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

let geminiUnavailable = false;

/**
 * @param {{ system: string, user: string, jsonSchema: object, zodSchema: import('zod').ZodType }} request
 *   jsonSchema(Gemini)와 zodSchema(Claude)는 같은 구조여야 한다
 * @returns {Promise<{ json: any, provider: 'gemini'|'haiku', model: string }>}
 */
export async function generateJson(request) {
  let provider = 'gemini';
  let result;
  if (geminiUnavailable) {
    provider = 'haiku';
    result = await generateWithHaiku(request);
  } else {
    try {
      result = await generateWithGemini(request);
    } catch (err) {
      if (!shouldFallBackFromGemini(err)) throw err;
      const why = isDeadlineError(err) ? `${GEMINI_TIMEOUT_MS / 1000}초 안에 응답 없음` : err.status;
      console.warn(`  ⚠ Gemini 사용 불가(${why}), 이번 실행은 Claude Haiku로 전환합니다`);
      // 관련성 점수는 배치를 여러 번 부른다. 배치마다 Gemini 재시도를 다시 겪으면
      // 워크플로 30분 제한을 넘길 수 있어서, 한 번 실패하면 남은 호출은 바로 Haiku로 보낸다
      geminiUnavailable = true;
      provider = 'haiku';
      result = await generateWithHaiku(request);
    }
  }
  try {
    return { json: JSON.parse(result.text), provider, model: result.model };
  } catch (err) {
    throw new Error(`${provider} 응답이 JSON으로 파싱되지 않습니다: ${err.message}\n응답 원문:\n${result.text}`);
  }
}
