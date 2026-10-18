// shared/schemas/card-news.ts 스키마에 대한 런타임 검증.
// Node 스크립트(예: card-renderer/scripts/render.js, content-generator/src/generate.js)에서
// 파일/외부 API로 받은 JSON이 실제로 스키마를 만족하는지 확인할 때 사용한다.

const SERIES_TYPES = ['always', 'district', 'deadline'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_ID_RE = /^[a-z0-9]+:.+$/;

const ITEM_STRING_FIELDS = [
  'source_id',
  'title',
  'subtitle',
  'caption',
  'benefit',
  'target',
  'category',
  'period_text',
  'source_name',
  'source_url',
];

export function assertValidCardNewsData(data, source) {
  const errors = [];
  if (!SERIES_TYPES.includes(data.series_type)) {
    errors.push(`series_type은 ${SERIES_TYPES.join(' | ')} 중 하나여야 합니다`);
  }
  for (const f of ['series_title', 'hook_line', 'source_handle', 'data_source']) {
    if (typeof data[f] !== 'string') errors.push(`${f}(string)이 없습니다`);
  }
  if (data.series_type === 'district') {
    if (typeof data.region !== 'string') errors.push('series_type이 district이면 region(string)이 있어야 합니다');
    if (data.category !== null) errors.push('series_type이 district이면 category는 null이어야 합니다');
  } else {
    if (typeof data.category !== 'string') errors.push('category(string)가 없습니다');
    if (data.region !== null) errors.push(`series_type이 ${data.series_type}이면 region은 null이어야 합니다`);
  }
  if (typeof data.generated_at !== 'string' || !DATE_RE.test(data.generated_at)) {
    errors.push('generated_at(YYYY-MM-DD)이 없습니다');
  }
  if (!Array.isArray(data.cards) || data.cards.length === 0) {
    errors.push('cards(비어있지 않은 배열)가 없습니다');
  } else {
    data.cards.forEach((c, i) => {
      for (const f of ITEM_STRING_FIELDS) {
        if (typeof c[f] !== 'string') errors.push(`cards[${i}].${f}(string)이 없습니다`);
      }
      if (typeof c.source_id === 'string' && !SOURCE_ID_RE.test(c.source_id)) {
        errors.push(`cards[${i}].source_id는 "<소스>:<ID>" 형식이어야 합니다 (예: gov24:B55400900001)`);
      }
      if (c.period_end !== null && !(typeof c.period_end === 'string' && DATE_RE.test(c.period_end))) {
        errors.push(`cards[${i}].period_end는 YYYY-MM-DD 또는 null이어야 합니다`);
      }
    });
    if (data.series_type === 'deadline' && data.cards.some((c) => c.period_end === null)) {
      errors.push('series_type이 deadline이면 모든 카드에 period_end가 있어야 합니다');
    }
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
