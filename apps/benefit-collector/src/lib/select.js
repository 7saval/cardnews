// 정규화된 혜택(BenefitRecord) 중에서 이번 회차 후보를 거르고, 카테고리를 고르고, 최종 N건을 뽑는다.
// API·LLM을 부르지 않는 순수 함수만 둔다 — 테스트(test/select.test.js)로 규칙을 고정한다.
// 규칙의 배경: _docs/topic-pivot-benefits-plan.md §6.1

import { classifyPeriod } from './period.js';

/**
 * 카테고리 시리즈에서 순환하는 서비스분야. 보조금24 10종 중 농림축산어업은 청년 독자와 거리가 멀어
 * 뺐다 (2026-10-18 결정). 순서는 가장 오래 안 다룬 카테고리가 같을 때의 우선순위다.
 */
export const ROTATION_CATEGORIES = [
  '생활안정',
  '고용·창업',
  '주거·자립',
  '보육·교육',
  '보건·의료',
  '문화·환경',
  '임신·출산',
  '보호·돌봄',
  '행정·안전',
];

/** 청년 나이 구간. 대상 나이 범위가 이 구간과 겹치면 "청년도 받을 수 있는 혜택"으로 본다 */
export const YOUTH_AGE = { min: 19, max: 34 };

/** 카드 렌더러가 최소 글자 크기로 3줄에 담을 수 있는 정책명 길이 (card-renderer samples/stress.json 52자 통과) */
export const MAX_TITLE_LENGTH = 50;

/** 나이 조건이 없으면(null) 나이 제한 없음으로 본다 */
export function isYouthEligible(record) {
  const min = record.age_min ?? 0;
  const max = record.age_max ?? Infinity;
  return min <= YOUTH_AGE.max && max >= YOUTH_AGE.min;
}

/** 정책명 비교용: 공백·괄호·구두점을 지운다. 소스가 달라도 같은 정책을 한 번만 쓰기 위해서다 */
export const normalizeTitle = (title) => title.replace(/[\s()[\]{}<>·‧.,'"“”‘’\-–—_/]/g, '').toLowerCase();

/**
 * 시리즈 공통 조건을 통과한 후보를 돌려준다. 카테고리 시리즈는 category, 자치구 시리즈는 region으로 거른다.
 * @param {import('../../../../shared/schemas/benefit').BenefitRecord[]} records
 * @param {{ seriesType: 'always'|'district', category?: string, region?: string, excludeIds?: Set<string> }} options
 */
export function filterCandidates(records, { seriesType, category, region, excludeIds = new Set() }) {
  const seenTitles = new Set();
  const result = [];
  for (const r of records) {
    if (excludeIds.has(r.source_id)) continue;
    if (classifyPeriod(r.period_text).kind !== 'always') continue;
    if (!r.user_types.includes('개인')) continue; // 사업주·법인 대상 제외
    if (!isYouthEligible(r)) continue;
    if (r.title.length > MAX_TITLE_LENGTH) continue;
    if (!r.raw.support_content || !r.raw.target) continue;

    if (seriesType === 'always') {
      // 전국 + 서울특별시(산하 포함). 자치구 혜택은 district 시리즈로 따로 낸다
      if (r.region !== null && r.region !== '서울특별시') continue;
      if (r.category !== category) continue;
    } else if (seriesType === 'district') {
      if (r.region !== region) continue;
    } else {
      throw new Error(`지원하지 않는 시리즈입니다: ${seriesType}`);
    }

    const key = normalizeTitle(r.title);
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    result.push(r);
  }
  return result;
}

/**
 * 가장 오래 안 다룬 카테고리부터 순서대로 돌려준다. 한 번도 안 다룬 카테고리가 가장 앞이다.
 * 후보가 모자라는 카테고리를 건너뛸 수 있게 하나가 아니라 순서 전체를 준다.
 * @param {{ category: string|null, series_type: string, published_at: string }[]} history
 */
export function categoryOrder(history, categories = ROTATION_CATEGORIES) {
  const last = new Map();
  for (const h of history) {
    if (h.series_type !== 'always' || !h.category) continue;
    if ((last.get(h.category) ?? '') < h.published_at) last.set(h.category, h.published_at);
  }
  return categories
    .map((c, i) => ({ c, i, at: last.get(c) ?? '' }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.i - b.i)
    .map((x) => x.c);
}

/** 관련성 점수가 이 값 이상이어야 뽑는다 (1~5, relevance.js 기준표) */
export const MIN_RELEVANCE = 4;

/**
 * 점수가 매겨진 후보에서 count건을 뽑는다. 청년 관련성이 MIN_RELEVANCE 이상인 것 중
 * "몰랐을 법함 + 관련성" 합이 높은 순. 같으면 관련성, 그다음 source_id 순으로 고정한다.
 * @param {import('../../../../shared/schemas/benefit').BenefitRecord[]} candidates
 * @param {Map<string, { relevance: number, obscurity: number }>} scores  source_id → 점수
 * @returns {import('../../../../shared/schemas/benefit').BenefitRecord[]} count보다 적을 수 있다
 */
export function pickTop(candidates, scores, count) {
  return candidates
    .filter((r) => (scores.get(r.source_id)?.relevance ?? 0) >= MIN_RELEVANCE)
    .map((r) => ({ r, s: scores.get(r.source_id) }))
    .sort(
      (a, b) =>
        b.s.relevance + b.s.obscurity - (a.s.relevance + a.s.obscurity) ||
        b.s.relevance - a.s.relevance ||
        a.r.source_id.localeCompare(b.r.source_id),
    )
    .slice(0, count)
    .map((x) => x.r);
}
