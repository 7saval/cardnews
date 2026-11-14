// 카드뉴스 JSON → 인스타그램 게시물 캡션 텍스트.
//
// 카드에는 링크를 못 넣으니(이미지 속 링크는 못 누른다) 카드마다 "원문 링크는 캡션에"라고 적고,
// 원문 링크와 신청 전 확인 안내는 여기서 고정 문구로 넣는다 (_docs/topic-pivot-benefits-plan.md §8).
// LLM을 거치지 않고 카드뉴스 JSON의 사실 필드만으로 만든다.

/** 인스타그램 캡션 최대 길이 */
export const CAPTION_LIMIT = 2200;

export const CAPTION_NOTICE =
  '※ 비공식 큐레이션 계정이에요. 지원 조건·금액은 바뀔 수 있으니 신청 전 원문 공고를 꼭 확인하세요.';

// 매 회차 공통 해시태그. 인스타그램은 게시물당 30개까지라 공통 + 회차별을 합쳐 15개 안쪽으로 둔다.
export const BASE_HASHTAGS = [
  '정부지원금',
  '정부혜택',
  '청년정책',
  '청년지원',
  '청년혜택',
  '지원금',
  '복지혜택',
  '생활꿀팁',
  '핫수집',
];

/** 해시태그에 쓸 수 없는 문자(공백·가운뎃점 등)를 뺀다: "고용·창업" → "고용창업" */
const toTag = (text) => text.replace(/[^\p{L}\p{N}_]/gu, '');

/**
 * 회차 해시태그: 공통 태그 + 카테고리("#생활안정") 또는 자치구("서울특별시 동작구" → "#동작구").
 * 중복은 뺀다.
 */
export function buildHashtags(data) {
  const extra = [];
  if (data.category) extra.push(data.category, `${data.category}지원`);
  if (data.region) extra.push(data.region.split(/\s+/).at(-1));
  const tags = [...BASE_HASHTAGS, ...extra].map(toTag).filter(Boolean);
  return [...new Set(tags)].map((t) => `#${t}`).join(' ');
}

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
      `· 신청: ${c.period_end ? `${c.period_end}까지` : c.period_text}${c.apply_method ? ` (${c.apply_method})` : ''}`,
      c.contact && `· 문의: ${c.contact}`,
      `· 원문: ${c.source_url}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  const caption = [
    data.series_title,
    data.hook_line.split('\n').join(' '),
    ...cards,
    `${CAPTION_NOTICE}\n출처: ${data.data_source}`,
    buildHashtags(data),
  ].join('\n\n');

  if (caption.length > CAPTION_LIMIT) {
    throw new Error(`캡션이 인스타그램 한도(${CAPTION_LIMIT}자)를 넘습니다: ${caption.length}자`);
  }
  return caption;
}
