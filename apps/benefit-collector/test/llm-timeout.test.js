import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { GoogleGenAI } from '@google/genai';
import { withRetry, isDeadlineError, shouldFallBackFromGemini } from '../src/lib/llm.js';

const err = (status, name = 'ApiError') => Object.assign(new Error(`status ${status}`), { status, name });

test('응답이 없는 Gemini 요청은 타임아웃으로 끊기고, 시간 초과로 분류돼 Haiku 폴백 대상이 된다', async () => {
  // 연결은 받지만 응답을 영영 안 보내는 서버 — 과부하 때 Gemini가 보이는 증상
  let serverTimeoutHeader;
  const server = createServer((req) => {
    serverTimeoutHeader = req.headers['x-server-timeout'];
  });
  await new Promise((r) => server.listen(0, r));
  try {
    const ai = new GoogleGenAI({
      apiKey: 'test',
      httpOptions: { timeout: 200, baseUrl: `http://127.0.0.1:${server.address().port}` },
    });
    const e = await ai.models.generateContent({ model: 'm', contents: 'hi' }).catch((x) => x);
    assert.ok(e instanceof Error, `에러가 나야 한다: ${e}`);
    assert.equal(isDeadlineError(e), true, `시간 초과로 분류돼야 한다: ${e.name} ${e.message}`);
    assert.equal(shouldFallBackFromGemini(e), true);
    // SDK가 타임아웃을 서버에도 알린다 — 그래서 실제 Gemini는 보통 504 DEADLINE_EXCEEDED로 먼저 끊는다
    assert.equal(serverTimeoutHeader, '1');
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('Gemini 폴백 판정: 일시적 오류·시간 초과는 폴백, 인증·요청 오류는 그대로 실패', () => {
  for (const s of [429, 500, 503, 504]) assert.equal(shouldFallBackFromGemini(err(s)), true, `${s}`);
  assert.equal(shouldFallBackFromGemini(err(undefined, 'AbortError')), true);
  for (const s of [400, 401, 403, 404]) assert.equal(shouldFallBackFromGemini(err(s)), false, `${s}`);
  assert.equal(isDeadlineError(err(504)), true);
  assert.equal(isDeadlineError(err(503)), false);
});

test('withRetry는 재시도 대상 상태만 다시 시도하고, 시간 초과(504)는 바로 던진다', async () => {
  const GEMINI = new Set([429, 500, 503]);
  let calls = 0;
  const ok = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw err(503);
      return 'done';
    },
    GEMINI,
    { baseDelayMs: 0 },
  );
  assert.equal(ok, 'done');
  assert.equal(calls, 3);

  for (const e of [err(504), err(401)]) {
    calls = 0;
    await assert.rejects(withRetry(async () => { calls += 1; throw e; }, GEMINI, { baseDelayMs: 0 }), e);
    assert.equal(calls, 1, `${e.status}는 한 번만 시도해야 한다`);
  }
});
