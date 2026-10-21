// 카드뉴스 JSON → 인스타그램 게시물 캡션 텍스트.
//
// 카드에는 링크를 못 넣으니(이미지 속 링크는 못 누른다) 카드마다 "원문 링크는 캡션에"라고 적고,
// 원문 링크와 신청 전 확인 안내는 여기서 고정 문구로 넣는다 (_docs/topic-pivot-benefits-plan.md §8).
// LLM을 거치지 않고 카드뉴스 JSON의 사실 필드만으로 만든다.

/** 인스타그램 캡션 최대 길이 */
export const CAPTION_LIMIT = 2200;

export const CAPTION_NOTICE =
  '※ 비공식 큐레이션 계정이에요. 지원 조건·금액은 바뀔 수 있으니 신청 전 원문 공고를 꼭 확인하세요.';

/**
 * @param {import('../../../shared/schemas/card-news').CardNewsData} data
 * @returns {string}
 */
export function buildCaption(data) {
  const cards = data.cards.map((c) =>
    [
      `${c.order}. ${c.title}`,
      `· ${c.benefit}`,
      `· 대상: ${c.target}`,
      `· 신청: ${c.period_end ? `${c.period_end}까지` : c.period_text}`,
      `· 원문: ${c.source_url}`,
    ].join('\n'),
  );
  const caption = [
    data.series_title,
    data.hook_line.split('\n').join(' '),
    ...cards,
    `${CAPTION_NOTICE}\n출처: ${data.data_source}`,
  ].join('\n\n');

  if (caption.length > CAPTION_LIMIT) {
    throw new Error(`캡션이 인스타그램 한도(${CAPTION_LIMIT}자)를 넘습니다: ${caption.length}자`);
  }
  return caption;
}
