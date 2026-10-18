import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendHistory } from '../src/lib/history.js';

const collected = JSON.parse(
  readFileSync(new URL('../../../shared/schemas/collected-benefits.example.json', import.meta.url), 'utf8'),
);

test('appendHistory: 회차 카테고리·시리즈와 발행일로 기록하고, 이미 있는 source_id는 건너뛴다', () => {
  const first = appendHistory([], collected, '2026-10-19');
  assert.equal(first.added.length, collected.items.length);
  assert.deepEqual(first.added[0], {
    source_id: collected.items[0].source_id,
    title: collected.items[0].title,
    category: '고용·창업',
    series_type: 'always',
    region: null,
    published_at: '2026-10-19',
  });

  const second = appendHistory(first.history, collected, '2026-10-26');
  assert.equal(second.added.length, 0);
  assert.equal(second.history.length, collected.items.length);
});
