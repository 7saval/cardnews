import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildScoreMessage, parseScores, scoreRelevance, cacheKey, BATCH_SIZE } from '../src/lib/relevance.js';

const collected = JSON.parse(
  readFileSync(new URL('../../../shared/schemas/collected-benefits.example.json', import.meta.url), 'utf8'),
);
const records = collected.items;
const quiet = () => {};
const sentIds = (user) => [...user.matchAll(/source_id: (\S+)/g)].map((m) => m[1]);
const tempCache = async () => join(await mkdtemp(join(tmpdir(), 'relevance-')), 'cache.json');

/** generate 대역: 받은 메시지의 source_id마다 점수를 돌려준다. drop(id, callIndex)가 true면 빠뜨린다 */
function fakeGenerate(drop = () => false) {
  const calls = [];
  const generate = async ({ user }) => {
    const sent = sentIds(user);
    const index = calls.length;
    calls.push(sent);
    return {
      model: 'fake',
      json: {
        scores: sent
          .filter((id) => !drop(id, index))
          .map((id) => ({ source_id: id, relevance: 5, obscurity: 3, reason: `이유 ${id}` })),
      },
    };
  };
  return { generate, calls };
}

test('buildScoreMessage: 항목마다 source_id와 원문 발췌, 긴 원문은 자른다', () => {
  const long = structuredClone(records);
  long[4].raw.support_content = '가'.repeat(1000);
  const message = buildScoreMessage(long);
  for (const r of records) assert.ok(message.includes(`source_id: ${r.source_id}`));
  assert.match(message, /가{300}…/);
  assert.match(message, /혜택 5건/);
});

test('parseScores: 지어낸 ID, 범위 밖·소수 점수, 중복은 버린다', () => {
  const [a, b, c] = records;
  const scores = parseScores(
    {
      scores: [
        { source_id: a.source_id, relevance: 5, obscurity: 2, reason: 'ok' },
        { source_id: a.source_id, relevance: 1, obscurity: 1, reason: '중복' },
        { source_id: b.source_id, relevance: 6, obscurity: 2, reason: '범위 밖' },
        { source_id: 'gov24:FAKE', relevance: 5, obscurity: 5, reason: '지어냄' },
        { source_id: c.source_id, relevance: 4.5, obscurity: 2, reason: '소수' },
      ],
    },
    records,
  );
  assert.deepEqual([...scores.keys()], [a.source_id]);
  assert.equal(scores.get(a.source_id).reason, 'ok');
});

test('scoreRelevance: 빠뜨린 항목은 한 번 더 묻고, 결과를 캐시해 다음엔 부르지 않는다', async (t) => {
  t.mock.method(console, 'log', quiet);
  const cacheFile = await tempCache();
  const missing = records[1].source_id;
  const { generate, calls } = fakeGenerate((id, i) => i === 0 && id === missing);

  const scores = await scoreRelevance(records, { cacheFile, generate });
  assert.equal(scores.size, records.length);
  assert.deepEqual(calls[1], [missing]); // 두 번째 호출은 빠진 것만

  const cache = JSON.parse(await readFile(cacheFile, 'utf8'));
  assert.equal(cache[cacheKey(records[0])].relevance, 5);

  const again = fakeGenerate();
  await scoreRelevance(records, { cacheFile, generate: again.generate });
  assert.equal(again.calls.length, 0);
});

test('scoreRelevance: 원문이 바뀌면(updated_at) 다시 매긴다', async (t) => {
  t.mock.method(console, 'log', quiet);
  const cacheFile = await tempCache();
  await scoreRelevance(records, { cacheFile, generate: fakeGenerate().generate });

  const changed = structuredClone(records);
  changed[0].updated_at = '2026-10-20T00:00:00+09:00';
  const { generate, calls } = fakeGenerate();
  await scoreRelevance(changed, { cacheFile, generate });
  assert.deepEqual(calls, [[changed[0].source_id]]);
});

test('scoreRelevance: BATCH_SIZE씩 나눠 묻고, 두 번 다 빠진 항목은 결과에서 빠진다', async (t) => {
  t.mock.method(console, 'log', quiet);
  t.mock.method(console, 'warn', quiet);
  const cacheFile = await tempCache();
  const many = Array.from({ length: BATCH_SIZE + 3 }, (_, i) => ({ ...records[0], source_id: `gov24:M${i}` }));
  const never = 'gov24:M0';
  const { generate, calls } = fakeGenerate((id) => id === never);

  const scores = await scoreRelevance(many, { cacheFile, generate });
  assert.deepEqual(
    calls.map((c) => c.length),
    [BATCH_SIZE, 3, 1],
  );
  assert.equal(scores.has(never), false);
  assert.equal(scores.size, many.length - 1);
});
