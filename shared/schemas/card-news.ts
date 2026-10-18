/**
 * 카드뉴스 콘텐츠 JSON 스키마.
 *
 * `benefit-collector`의 수집 결과(shared/schemas/benefit.ts)를 `content-generator`가 이 형태로 만들고,
 * `card-renderer`가 이 JSON을 읽어 카드 이미지(PNG)를 렌더링한다.
 *
 * 필드마다 채우는 주체가 다르다 (_docs/topic-pivot-benefits-plan.md §5):
 * - 코드: 수집 결과의 사실 필드를 그대로 복사 (title, period_*, source_*, category)
 * - LLM: 카피 (series_title, hook_line, subtitle, caption, cta_card)
 * - LLM 요약 + 원문 대조 검증: benefit, target
 *
 * 2026-10-18 맛집 → 혜택 주제 전환으로 장소 필드(place_name, address, image_*)를 삭제했다.
 */

import type { SeriesType } from './benefit';

export interface CardNewsItem {
  order: number;
  /** 수집 결과의 source_id. 사실 필드 주입과 fact-check에서 원문을 찾는 키 */
  source_id: string;
  /** 정책·서비스명 (코드) */
  title: string;
  /** 한 줄 요약 (LLM) */
  subtitle: string;
  /** 후킹 코멘트 (LLM) */
  caption: string;
  /** 지원 내용 요약. 예: "2년간 최대 200만원 근속장려금" (LLM 요약 + 검증) */
  benefit: string;
  /** 대상 요약. 예: "서울 거주 39세 이하 청년" (LLM 요약 + 검증) */
  target: string;
  /** 서비스분야 (코드) */
  category: string;
  /** 신청기한 원문 (코드) */
  period_text: string;
  /** 신청 마감일 `YYYY-MM-DD`, 상시는 null (코드). 값이 있으면 렌더러가 D-day 배지를 그린다 */
  period_end: string | null;
  /** 주관 기관명 (코드) */
  source_name: string;
  /** 원문 링크 (코드) */
  source_url: string;
}

export interface CardNewsCTA {
  handle: string;
  cta_text: string;
  /** CTA 카드 상단 후킹 카피 2줄 [서브, 메인]. */
  hook_lines?: [string, string];
}

export interface CardNewsData {
  series_type: SeriesType;
  series_title: string;
  hook_line: string;
  /** 이번 회차 카테고리 (커버에 표시). district 시리즈는 null */
  category: string | null;
  /** district 시리즈의 자치구 (예: "서울특별시 동작구", 커버에 표시). 나머지 시리즈는 null */
  region: string | null;
  /** 좌상단 워터마크에 표시할 계정. */
  source_handle: string;
  /** 생성 기준일 `YYYY-MM-DD`. D-day 계산 기준 */
  generated_at: string;
  /** 출처 표시 문구. CTA 카드에 "비공식 큐레이션 · 출처: …"로 표시 */
  data_source: string;
  cards: CardNewsItem[];
  cta_card: CardNewsCTA;
}
