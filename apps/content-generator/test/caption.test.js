import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCaption, CAPTION_LIMIT, CAPTION_NOTICE } from '../src/caption.js';

const cardNews = JSON.parse(
  readFileSync(new URL('../../../shared/schemas/card-news.example.json', import.meta.url), 'utf8'),
);

test('buildCaption: 카드마다 정책명·혜택·대상·신청기한·원문 링크, 끝에 확인 안내와 출처', () => {
  const caption = buildCaption(cardNews);
  assert.ok(caption.startsWith(`${cardNews.series_title}\n\n`));
  for (const c of cardNews.cards) {
    assert.ok(caption.includes(`${c.order}. ${c.title}\n· ${c.benefit}\n· 대상: ${c.target}`), c.title);
    assert.ok(caption.includes(`· 원문: ${c.source_url}`), c.title);
  }
  assert.ok(caption.includes('· 신청: 상시신청'));
  assert.ok(caption.endsWith(`${CAPTION_NOTICE}\n출처: ${cardNews.data_source}`));
});

test('buildCaption: 마감일이 있으면 "YYYY-MM-DD까지"', () => {
  const data = structuredClone(cardNews);
  data.cards[0].period_end = '2026-11-07';
  assert.ok(buildCaption(data).includes('· 신청: 2026-11-07까지'));
});

test('buildCaption: 인스타그램 한도를 넘으면 실패', () => {
  const data = structuredClone(cardNews);
  data.cards[0].target = '가'.repeat(CAPTION_LIMIT);
  assert.throws(() => buildCaption(data), /한도/);
});
