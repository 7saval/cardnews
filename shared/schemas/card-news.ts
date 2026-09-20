/**
 * 카드뉴스 콘텐츠 JSON 스키마.
 *
 * `research-collector` + `content-generator`(LLM)가 이 형태의 JSON을 만들고,
 * `card-renderer`가 이 JSON을 읽어 카드 이미지(PNG)를 렌더링한다.
 *
 * 계획서(insta-cardnews-automation-plan.md) 2번 섹션의 원안 스키마 대비 추가된 필드:
 * - CardNewsItem.address, image_url
 * - CardNewsCTA.hook_lines
 * - CardNewsData.source_handle, cover_image_url
 * 카드 디자인(design-reference/spec.md)을 구현하면서 실제로 필요해져 추가함.
 */

export interface CardNewsItem {
  order: number;
  place_name: string;
  subtitle: string;
  caption: string;
  image_keyword: string;
  /** 장소 주소. 콘텐츠 카드 하단 오버레이에 표시. */
  address?: string;
  /** 매칭된 배경 이미지 URL. 없으면 렌더러가 placeholder를 보여줌. */
  image_url?: string;
}

export interface CardNewsCTA {
  handle: string;
  cta_text: string;
  /** CTA 카드 상단 후킹 카피 2줄 [서브, 메인]. */
  hook_lines?: [string, string];
  image_url?: string;
}

export interface CardNewsData {
  series_title: string;
  hook_line: string;
  /** 좌상단 워터마크에 표시할 출처 계정. */
  source_handle: string;
  cover_image_url?: string;
  cards: CardNewsItem[];
  cta_card: CardNewsCTA;
}
