/**
 * 혜택 수집 결과 스키마.
 *
 * `benefit-collector`가 공공 API 응답을 소스와 무관한 이 형태로 정규화해서
 * `output/<timestamp>-adopted.json`으로 쓰고, `content-generator`가 이 파일을 입력으로 받는다.
 *
 * 카드에 바로 쓰는 사실 필드(title, source_url 등)와 별개로 `raw`에 원문을 그대로 남긴다.
 * LLM이 쓴 요약(benefit, target)과 카피는 fact-check 단계에서 이 원문과 대조한다.
 * (_docs/topic-pivot-benefits-plan.md §5, §6.3)
 */

/** 데이터 소스. 온통청년(youthcenter)은 마감 임박 시리즈용으로 추가 예정. */
export type BenefitSource = 'gov24' | 'youthcenter';

/**
 * always   = 몰랐던 상시 혜택 N선 (카테고리별, 전국 + 서울특별시)
 * district = OO구 혜택 모음 (서울 자치구 1곳의 혜택만)
 * deadline = 마감 임박 (온통청년 승인 후)
 */
export type SeriesType = 'always' | 'district' | 'deadline';

export interface BenefitRaw {
  /** 지원내용 원문 */
  support_content: string;
  /** 지원대상 원문 */
  target: string;
  /** 선정기준 원문 (없으면 null) */
  selection_criteria: string | null;
  /** 신청방법 원문 */
  apply_method: string | null;
  /** 전화문의 원문 */
  contact: string | null;
}

export interface BenefitRecord {
  /** `<source>:<API의 ID>` — 소스마다 ID 체계가 달라서 접두어로 구분한다. 예: "gov24:B55400900001" */
  source_id: string;
  source: BenefitSource;
  /** 정책·서비스명 */
  title: string;
  /** 서비스분야 (보조금24 기준 10종: 생활안정, 고용·창업, 주거·자립 …) */
  category: string;
  /** 한 줄 목적 요약 원문 (보조금24 서비스목적요약, 50자 이내) */
  summary: string;
  /** 주관 기관명 */
  org_name: string;
  /**
   * 혜택이 적용되는 지역. 전국이면 null, 서울시 전체면 "서울특별시", 자치구면 "서울특별시 동작구".
   * 구 산하 공단(예: 서울특별시관악구시설관리공단)도 해당 구로 잡는다.
   */
  region: string | null;
  /** 원문 링크 */
  source_url: string;
  /** 신청기한 원문 */
  period_text: string;
  /** 신청 마감일 `YYYY-MM-DD`. 상시이거나 파싱 못 하면 null */
  period_end: string | null;
  /** 대상 나이 하한/상한. 조건이 없으면 null */
  age_min: number | null;
  age_max: number | null;
  /** 대상 구분 (개인, 가구, 소상공인, 법인/시설/단체) */
  user_types: string[];
  /** 원문 수정일시 (ISO 8601). 발행 직전 재조회 때 바뀌었는지 비교한다 */
  updated_at: string;
  raw: BenefitRaw;
}

export interface CollectedBenefits {
  /** 수집 시각 (ISO 8601) */
  collected_at: string;
  series_type: SeriesType;
  /** 이번 회차 카테고리. district 시리즈는 카테고리를 섞으므로 null */
  category: string | null;
  /** district 시리즈의 자치구 (예: "서울특별시 동작구"). 나머지 시리즈는 null */
  region: string | null;
  /** 카드·캡션에 넣을 출처 표시 문구 */
  data_source: string;
  items: BenefitRecord[];
}
