// shared/schemas/card-news.ts 스키마에 대한 런타임 검증.
// Node 스크립트(예: card-renderer/scripts/render.js, content-generator/src/generate.js)에서
// 파일/외부 API로 받은 JSON이 실제로 스키마를 만족하는지 확인할 때 사용한다.

export function assertValidCardNewsData(data, source) {
  const errors = [];
  if (typeof data.hook_line !== 'string') errors.push('hook_line(string)이 없습니다');
  if (typeof data.source_handle !== 'string') errors.push('source_handle(string)이 없습니다');
  if (!Array.isArray(data.cards) || data.cards.length === 0) {
    errors.push('cards(비어있지 않은 배열)가 없습니다');
  } else {
    data.cards.forEach((c, i) => {
      if (typeof c.place_name !== 'string') errors.push(`cards[${i}].place_name(string)이 없습니다`);
      if (typeof c.caption !== 'string') errors.push(`cards[${i}].caption(string)이 없습니다`);
    });
  }
  if (!data.cta_card || typeof data.cta_card !== 'object') {
    errors.push('cta_card(object)가 없습니다');
  } else {
    if (typeof data.cta_card.handle !== 'string') errors.push('cta_card.handle(string)이 없습니다');
    if (typeof data.cta_card.cta_text !== 'string') errors.push('cta_card.cta_text(string)이 없습니다');
  }

  if (errors.length > 0) {
    throw new Error(
      `${source}가 카드뉴스 스키마(shared/schemas/card-news.ts)와 맞지 않습니다:\n` +
        errors.map((e) => `  - ${e}`).join('\n'),
    );
  }
}
