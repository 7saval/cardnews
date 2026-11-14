// LLM 카피 + 수집 원문 → shared/schemas/card-news.ts의 CardNewsData.
//
// 사실 필드(정책명, 기관, 링크, 신청기한, 카테고리)는 여기서 수집 원문을 그대로 복사한다.
// 카드 순서와 개수도 LLM 응답이 아니라 수집 결과를 따른다 — LLM이 카드를 빠뜨리거나, 없는
// source_id를 지어내거나, 같은 항목을 두 번 쓰면 에러로 돌려서 재생성하게 한다.

// 보조금24 신청방법 값 → 카드 표시 문구. "직접입력"은 입력 방식 이름일 뿐 정보가 없어서 뺀다.
const APPLY_METHOD_LABELS = { '기타 온라인신청': '온라인 신청', 직접입력: null };

// 원문 필드에 값이 여러 개면 "||"로 이어져 온다 (예: "방문신청||직접입력")
const splitValues = (text) => (text ?? '').split('||').map((v) => v.trim()).filter(Boolean);

/** 수집 원문의 신청방법을 카드 표시용으로 ("방문 신청, 온라인 신청"). 없거나 의미 없는 값뿐이면 null */
export function applyMethodOf(record) {
  const labels = splitValues(record.raw?.apply_method)
    .map((v) => (v in APPLY_METHOD_LABELS ? APPLY_METHOD_LABELS[v] : v.replace(/(\S)신청$/, '$1 신청')))
    .filter(Boolean);
  return labels.length ? [...new Set(labels)].join(', ') : null;
}

/**
 * 수집 원문의 문의처 "기관/전화"를 카드 표시용으로 ("서민금융콜센터 1397").
 * 여러 개면 첫 번째만 쓴다 — 카드 칸이 좁고, 나머지는 원문 링크에 있다.
 */
export function contactOf(record) {
  const first = splitValues(record.raw?.contact)[0];
  return first ? first.replace(/\s*\/\s*/g, ' ') : null;
}

// 카드 한 장에 들어가는 세부 항목 최대 개수 (레이아웃 기준)
const MAX_DETAILS = 3;

/**
 * @param {object} copy  LLM 응답 (prompt.js의 응답 스키마)
 * @param {import('../../../shared/schemas/benefit').CollectedBenefits} collected
 * @param {{ handle: string, today: string }} options
 * @returns {{ data: import('../../../shared/schemas/card-news').CardNewsData,
 *             errors: { source_id: null, field: string, message: string }[] }}
 *   errors는 모두 회차 단위(source_id: null) — 카피 전체를 다시 만들어야 한다
 */
export function assembleCardNews(copy, collected, { handle, today }) {
  const errors = [];
  const err = (message) => errors.push({ source_id: null, field: 'cards', message });

  const known = new Set(collected.items.map((r) => r.source_id));
  const copyById = new Map();
  for (const c of copy.cards ?? []) {
    if (!known.has(c.source_id)) err(`입력에 없는 source_id입니다: ${c.source_id}`);
    else if (copyById.has(c.source_id)) err(`같은 source_id의 카드가 두 번 나왔습니다: ${c.source_id}`);
    else copyById.set(c.source_id, c);
  }

  const cards = [];
  for (const record of collected.items) {
    const c = copyById.get(record.source_id);
    if (!c) {
      err(`카드가 빠졌습니다: ${record.source_id} (${record.title})`);
      continue;
    }
    cards.push({
      order: cards.length + 1,
      source_id: record.source_id,
      title: record.title,
      subtitle: c.subtitle,
      caption: c.caption,
      benefit: c.benefit,
      target: c.target,
      ...(Array.isArray(c.details)
        ? { details: c.details.map((d) => d.trim()).filter(Boolean).slice(0, MAX_DETAILS) }
        : {}),
      apply_method: applyMethodOf(record),
      contact: contactOf(record),
      category: record.category,
      period_text: record.period_text,
      period_end: record.period_end,
      source_name: record.org_name,
      source_url: record.source_url,
    });
  }

  const hookLines = copy.cta_card?.hook_lines;
  const data = {
    series_type: collected.series_type,
    series_title: copy.series_title,
    hook_line: copy.hook_line,
    category: collected.category,
    region: collected.region,
    // 우리 계정 정보는 LLM이 만드는 값이 아니라 --handle로 받아 주입한다
    source_handle: handle,
    generated_at: today,
    data_source: collected.data_source,
    cards,
    cta_card: {
      handle,
      cta_text: copy.cta_card?.cta_text,
      ...(hookLines?.length >= 2 ? { hook_lines: [hookLines[0], hookLines[1]] } : {}),
    },
  };
  return { data, errors };
}
