import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { GoogleGenAI } from '@google/genai';
import { withRetry, isRetryableError } from '../src/lib/llm.js';

const GEMINI = new Set([429, 503]);

test('응답이 없는 Gemini 요청은 타임아웃 에러로 끊기고, 재시도 대상으로 분류된다', async () => {
  // 연결은 받지만 응답을 영영 안 보내는 서버 — 과부하 때 Gemini가 보이는 증상
  const server = createServer(() => {});
  await new Promise((r) => server.listen(0, r));
  try {
    const ai = new GoogleGenAI({
      apiKey: 'test',
      httpOptions: { timeout: 200, baseUrl: `http://127.0.0.1:${server.address().port}` },
    });
    const err = await ai.models.generateContent({ model: 'm', contents: 'hi' }).catch((e) => e);
    assert.ok(err instanceof Error, `에러가 나야 한다: ${err}`);
    assert.equal(isRetryableError(err, GEMINI), true, `재시도 대상이어야 한다: ${err.name} ${err.message}`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('withRetry는 타임아웃·503은 다시 시도하고, 그 외 에러는 바로 던진다', async () => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  let calls = 0;
  const ok = await withRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw abort;
      if (calls === 2) throw Object.assign(new Error('busy'), { status: 503 });
      return 'done';
    },
    GEMINI,
    { baseDelayMs: 0 },
  );
  assert.equal(ok, 'done');
  assert.equal(calls, 3);

  calls = 0;
  const auth = Object.assign(new Error('bad key'), { status: 401 });
  await assert.rejects(withRetry(async () => { calls += 1; throw auth; }, GEMINI, { baseDelayMs: 0 }), auth);
  assert.equal(calls, 1);
});
