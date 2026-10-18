import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterCandidates,
  categoryOrder,
  pickTop,
  isYouthEligible,
  normalizeTitle,
  ROTATION_CATEGORIES,
  MAX_TITLE_LENGTH,
} from '../src/lib/select.js';

let seq = 0;
/** 모든 공통 조건을 통과하는 기본 후보. 테스트마다 한 필드씩 바꿔 본다 */
function rec(overrides = {}) {
  seq += 1;
  return {
    source_id: `gov24:T${seq}`,
    source: 'gov24',
    title: `테스트 혜택 ${seq}`,
    category: '고용·창업',
    summary: '요약',
    org_name: '고용노동부',
    region: null,
    source_url: 'https://www.gov.kr/',
    period_text: '상시신청',
    period_end: null,
    age_min: null,
    age_max: null,
    user_types: ['개인'],
    updated_at: '2026-10-01T00:00:00+09:00',
    raw: { support_content: '지원 내용', target: '지원 대상', selection_criteria: null, apply_method: null, contact: null },
    ...overrides,
  };
}
const ALWAYS = { seriesType: 'always', category: '고용·창업' };
const ids = (records) => records.map((r) => r.source_id);

test('isYouthEligible: 나이 범위가 19~34세와 겹치면 청년 포함, null은 제한 없음', () => {
  assert.equal(isYouthEligible(rec()), true);
  assert.equal(isYouthEligible(rec({ age_min: 34, age_max: 64 })), true);
  assert.equal(isYouthEligible(rec({ age_min: 0, age_max: 19 })), true);
  assert.equal(isYouthEligible(rec({ age_min: 0, age_max: 18 })), false);
  assert.equal(isYouthEligible(rec({ age_min: 65, age_max: null })), false);
});

test('filterCandidates: 상시가 아니면 뺀다', () => {
  const ok = rec();
  const dated = rec({ period_text: '2026.10.1 ~ 10.31' });
  const budget = rec({ period_text: '예산 소진 시까지' });
  assert.deepEqual(ids(filterCandidates([ok, dated, budget], ALWAYS)), [ok.source_id]);
});

test('filterCandidates: 개인이 아닌 대상(사업주·법인)은 뺀다', () => {
  const both = rec({ user_types: ['개인', '소상공인'] });
  const biz = rec({ user_types: ['법인/시설/단체'] });
  assert.deepEqual(ids(filterCandidates([both, biz], ALWAYS)), [both.source_id]);
});

test('filterCandidates: always는 전국 + 서울특별시, 자치구·타 지역은 뺀다', () => {
  const national = rec();
  const seoul = rec({ region: '서울특별시' });
  const district = rec({ region: '서울특별시 동작구' });
  const busan = rec({ region: '부산광역시' });
  assert.deepEqual(ids(filterCandidates([national, seoul, district, busan], ALWAYS)), [
    national.source_id,
    seoul.source_id,
  ]);
});

test('filterCandidates: district는 그 구만, 카테고리는 섞는다', () => {
  const a = rec({ region: '서울특별시 동작구', category: '생활안정' });
  const b = rec({ region: '서울특별시 동작구', category: '보육·교육' });
  const other = rec({ region: '서울특별시 관악구' });
  const national = rec();
  const got = filterCandidates([a, b, other, national], { seriesType: 'district', region: '서울특별시 동작구' });
  assert.deepEqual(ids(got), [a.source_id, b.source_id]);
});

test('filterCandidates: 다른 카테고리, 청년 제외 나이, 너무 긴 정책명, 발행 이력은 뺀다', () => {
  const ok = rec();
  const otherCat = rec({ category: '생활안정' });
  const senior = rec({ age_min: 65 });
  const longTitle = rec({ title: '가'.repeat(MAX_TITLE_LENGTH + 1) });
  const published = rec();
  const got = filterCandidates([ok, otherCat, senior, longTitle, published], {
    ...ALWAYS,
    excludeIds: new Set([published.source_id]),
  });
  assert.deepEqual(ids(got), [ok.source_id]);
});

test('filterCandidates: 공백·구두점만 다른 같은 정책명은 처음 것만 남긴다', () => {
  const first = rec({ title: '대‧중소기업 상생일자리' });
  const dup = rec({ title: '대·중소기업 상생 일자리' });
  assert.equal(normalizeTitle(first.title), normalizeTitle(dup.title));
  assert.deepEqual(ids(filterCandidates([first, dup], ALWAYS)), [first.source_id]);
});

test('categoryOrder: 이력이 없으면 기본 순서, 농림축산어업은 순환에 없다', () => {
  assert.deepEqual(categoryOrder([]), ROTATION_CATEGORIES);
  assert.equal(ROTATION_CATEGORIES.includes('농림축산어업'), false);
});

test('categoryOrder: 한 번도 안 다룬 것 → 가장 오래전에 다룬 것 순, district 이력은 무시', () => {
  const history = [
    { source_id: 'a', category: '생활안정', series_type: 'always', published_at: '2026-10-05' },
    { source_id: 'b', category: '고용·창업', series_type: 'always', published_at: '2026-10-12' },
    { source_id: 'c', category: '생활안정', series_type: 'always', published_at: '2026-09-28' },
    { source_id: 'd', category: null, series_type: 'district', published_at: '2026-10-13' },
  ];
  const order = categoryOrder(history, ['생활안정', '고용·창업', '주거·자립']);
  assert.deepEqual(order, ['주거·자립', '생활안정', '고용·창업']);
});

test('pickTop: 관련성 4 미만은 빼고, 관련성+몰랐을 합 → 관련성 → source_id 순', () => {
  const [a, b, c, d, e] = [rec(), rec(), rec(), rec(), rec()];
  const scores = new Map([
    [a.source_id, { relevance: 3, obscurity: 5 }], // 관련성 미달
    [b.source_id, { relevance: 4, obscurity: 4 }], // 합 8
    [c.source_id, { relevance: 5, obscurity: 3 }], // 합 8, 관련성 더 높음
    [d.source_id, { relevance: 5, obscurity: 5 }], // 합 10
    // e는 점수 없음 → 빠진다
  ]);
  assert.deepEqual(ids(pickTop([a, b, c, d, e], scores, 5)), [d.source_id, c.source_id, b.source_id]);
  assert.deepEqual(ids(pickTop([a, b, c, d, e], scores, 2)), [d.source_id, c.source_id]);
});
