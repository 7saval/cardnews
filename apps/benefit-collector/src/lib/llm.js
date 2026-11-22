// 구조화 JSON 응답을 받는 LLM 호출. 1순위 프로바이더(LLM_PRIMARY, 기본 haiku)가 재시도까지 실패하거나
// 시간 초과면 다른 쪽으로 폴백한다. content-generator/src/generate.js와 같은 방식이다
// (배경: _docs/llm-provider-fallback-plan.md §7 — 2026-11-22 Gemini 상시 지연으로 기본을 Haiku로 교체).
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
// 재시도하면 시간만 쓴다(최악 4×120초). 재시도 없이 바로 다른 프로바이더로 넘긴다
export const isDeadlineError = (err) =>
  err?.status === 504 ||
  err?.name === 'AbortError' ||
  err?.name === 'TimeoutError' ||
  err instanceof Anthropic.APIConnectionTimeoutError;

/** Gemini 실패 중 폴백할 것: 재시도까지 실패한 일시적 오류 또는 시간 초과. 그 외(인증·스키마 등)는 그대로 실패 */
export const shouldFallBackFromGemini = (err) => GEMINI_RETRYABLE_STATUS.has(err?.status) || isDeadlineError(err);

/** Haiku 실패 중 폴백할 것: 같은 기준. 401(키 무효) 같은 우리 쪽 문제는 폴백으로 가리지 않는다 */
export const shouldFallBackFromHaiku = (err) => ANTHROPIC_RETRYABLE_STATUS.has(err?.status) || isDeadlineError(err);

export const PROVIDER_LABEL = { gemini: 'Gemini', haiku: 'Claude Haiku' };

/** LLM_PRIMARY 환경변수로 1순위를 고른다 (haiku | gemini, 기본 haiku). 나머지 하나가 폴백 */
export function providerOrder(env = process.env) {
  const primary = (env.LLM_PRIMARY || 'haiku').trim().toLowerCase();
  if (primary === 'haiku') return ['haiku', 'gemini'];
  if (primary === 'gemini') return ['gemini', 'haiku'];
  throw new Error(`LLM_PRIMARY는 haiku 또는 gemini여야 합니다 (지금 값: "${env.LLM_PRIMARY}")`);
}

export const shouldFallBack = (provider, err) =>
  provider === 'gemini' ? shouldFallBackFromGemini(err) : shouldFallBackFromHaiku(err);

export function describeFailure(provider, err) {
  if (!isDeadlineError(err)) return String(err?.status ?? err?.message);
  return provider === 'gemini' ? `${GEMINI_TIMEOUT_MS / 1000}초 안에 응답 없음` : '응답 시간 초과';
}

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
      'ANTHROPIC_API_KEY가 없습니다. apps/benefit-collector/.env에 ANTHROPIC_API_KEY=발급받은키 를 추가하세요 (.env.example 참고).',
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

const CALL = { gemini: generateWithGemini, haiku: generateWithHaiku };

// 관련성 점수는 배치를 여러 번 부른다. 배치마다 같은 프로바이더의 재시도·타임아웃을 다시 겪으면
// 워크플로 30분 제한을 넘길 수 있어서, 한 번 폴백하면 그 프로바이더는 이번 실행 동안 건너뛴다
const unavailable = new Set();

/**
 * @param {{ system: string, user: string, jsonSchema: object, zodSchema: import('zod').ZodType }} request
 *   jsonSchema(Gemini)와 zodSchema(Claude)는 같은 구조여야 한다
 * @returns {Promise<{ json: any, provider: 'gemini'|'haiku', model: string }>}
 */
export async function generateJson(request, { order = providerOrder(), call = CALL } = {}) {
  const candidates = order.filter((p) => !unavailable.has(p));
  // 둘 다 한 번씩 실패했으면 마지막 것으로 한 번 더 시도한다 (실패하면 그 에러로 끝)
  if (candidates.length === 0) candidates.push(order[order.length - 1]);

  let provider;
  let result;
  for (let i = 0; i < candidates.length; i += 1) {
    provider = candidates[i];
    try {
      result = await call[provider](request);
      break;
    } catch (err) {
      const next = candidates[i + 1];
      if (!next || !shouldFallBack(provider, err)) throw err;
      console.warn(
        `  ⚠ ${PROVIDER_LABEL[provider]} 사용 불가(${describeFailure(provider, err)}), 이번 실행은 ${PROVIDER_LABEL[next]}로 전환합니다`,
      );
      unavailable.add(provider);
    }
  }
  try {
    return { json: JSON.parse(result.text), provider, model: result.model };
  } catch (err) {
    throw new Error(`${provider} 응답이 JSON으로 파싱되지 않습니다: ${err.message}\n응답 원문:\n${result.text}`);
  }
}

/** 테스트용: 실행 간 "사용 불가" 기억을 지운다 */
export function resetUnavailable() {
  unavailable.clear();
}
