import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCaption, buildHashtags, CAPTION_LIMIT, CAPTION_NOTICE } from '../src/caption.js';

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
  assert.ok(caption.includes(`${CAPTION_NOTICE}\n출처: ${cardNews.data_source}\n\n#`));
  assert.ok(caption.endsWith(buildHashtags(cardNews)));
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

test('buildHashtags: 공통 태그 + 카테고리 태그, 기호는 빼고 중복 없이', () => {
  const tags = buildHashtags({ category: '고용·창업', region: null }).split(' ');
  assert.ok(tags.includes('#정부지원금'));
  assert.ok(tags.includes('#고용창업'));
  assert.ok(tags.includes('#고용창업지원'));
  assert.equal(new Set(tags).size, tags.length);
  assert.ok(tags.every((t) => /^#[\p{L}\p{N}_]+$/u.test(t)));
  assert.ok(tags.length <= 30);
});

test('buildHashtags: 자치구 시리즈는 구 이름 태그', () => {
  const tags = buildHashtags({ category: null, region: '서울특별시 동작구' }).split(' ');
  assert.ok(tags.includes('#동작구'));
});
