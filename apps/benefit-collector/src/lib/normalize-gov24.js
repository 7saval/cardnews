// 보조금24 serviceList + supportConditions 행을 shared/schemas/benefit.ts의 BenefitRecord로 바꾼다.

import { classifyPeriod } from './period.js';

export const GOV24_DATA_SOURCE = '행정안전부 대한민국 공공서비스(혜택) 정보 (공공데이터포털)';

// 전국 단위로 보는 소관기관유형. 이 외(광역시도, 시군구, 지방공기업 등)는 기관명으로 지역을 잡는다.
const NATIONAL_ORG_TYPES = new Set(['중앙행정기관', '공공기관']);
// "서울특별시 동작구", "서울특별시관악구시설관리공단" → 구 이름. 자치구 이름은 모두 1~3글자 + "구"
const SEOUL_DISTRICT_RE = /^서울특별시\s*([가-힣]{1,3}구)/;

/** 전국이면 null, 서울 자치구면 "서울특별시 OO구", 서울시 산하면 "서울특별시", 그 외 지역은 기관명 */
export function regionOf(row) {
  if (NATIONAL_ORG_TYPES.has(row.소관기관유형)) return null;
  const name = row.소관기관명 ?? '';
  const district = SEOUL_DISTRICT_RE.exec(name);
  if (district) return `서울특별시 ${district[1]}`;
  if (name.startsWith('서울')) return '서울특별시';
  return name;
}

const nullIfBlank =(v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

/** "20260616173347" → "2026-06-16T17:33:47+09:00" */
function toIsoKst(compact) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(compact ?? '');
  if (!m) return compact ?? '';
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`;
}

/**
 * @param {object} row  serviceList 한 행
 * @param {object} [cond]  같은 서비스ID의 supportConditions 행
 */
export function normalizeGov24(row, cond) {
  return {
    source_id: `gov24:${row.서비스ID}`,
    source: 'gov24',
    title: row.서비스명.trim(),
    category: row.서비스분야,
    summary: (row.서비스목적요약 ?? '').trim(),
    org_name: row.소관기관명,
    region: regionOf(row),
    source_url: row.상세조회URL,
    period_text: (row.신청기한 ?? '').trim(),
    period_end: classifyPeriod(row.신청기한).end,
    age_min: cond?.JA0110 ?? null,
    age_max: cond?.JA0111 ?? null,
    user_types: (row.사용자구분 ?? '').split('||').filter(Boolean),
    updated_at: toIsoKst(row.수정일시),
    raw: {
      support_content: (row.지원내용 ?? '').trim(),
      target: (row.지원대상 ?? '').trim(),
      selection_criteria: nullIfBlank(row.선정기준),
      apply_method: nullIfBlank(row.신청방법),
      contact: nullIfBlank(row.전화문의),
    },
  };
}
