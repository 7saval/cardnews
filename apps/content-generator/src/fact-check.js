// LLM이 만든 카드뉴스를 수집 원문과 대조하는 검증 단계.
// (_docs/topic-pivot-benefits-plan.md §6.3)
//
// 원칙: 사실 필드(title, source_url 등)는 코드가 주입하고, LLM이 쓴 필드(subtitle, caption,
// benefit, target)에 나온 숫자는 그 카드의 원문에 있어야 한다. 표현 차이(20만원 ↔ 200,000원,
// 만 19~34세 ↔ 19세 이상 34세 이하)는 (값, 단위)로 정규화해서 흡수한다.
//
// 못 잡는 것: 숫자 없는 거짓말("무료", "누구나"), 한글 수사("두 배", "세 번"), 숫자는 맞는데
// 다른 조건에 붙인 경우, 같은 값의 다른 표기("100분의 50" ↔ "50%"). 이런 건 발행 전 사람 검수
// 체크리스트로 넘긴다.

// LLM이 쓰는 카드 필드
const COPY_FIELDS = ['subtitle', 'caption', 'benefit', 'target'];
// 코드가 수집 결과에서 그대로 복사하는 필드 [카드 필드, 수집 결과 필드]
const INJECTED_FIELDS = [
  ['title', 'title'],
  ['category', 'category'],
  ['period_text', 'period_text'],
  ['period_end', 'period_end'],
  ['source_name', 'org_name'],
  ['source_url', 'source_url'],
];

// 숫자 + 한국어 자릿수. 천/백/십은 숫자에 붙어 있을 때만, 만/억은 띄어 써도 인정한다.
// 예: "2억4천만", "2억 4천만", "1,152만", "3백만", "200,000"
const GROUP = String.raw`\d[\d,]*(?:\.\d+)?(?:천|백|십)?`;
const AMOUNT_RE = new RegExp(String.raw`${GROUP}(?:\s*(?:억|만))*(?:\s*${GROUP}\s*(?:억|만))*`, 'g');
// 단위는 숫자에 붙어 있어야 한다. "1/2 일시지급"의 "일"을 단위로 읽지 않게, 띄어쓰기는 "270만 원"처럼
// 원 앞에서만 허용한다.
const UNIT_RE = /^(?:\s*(원)|(세|살|개월|시간|퍼센트|%|종목|가지|월|년|회|명|일|주|박|배|인|선|곳|건|차|개))/;
const RANGE_GAP_RE = /^\s*[~∼-]\s*$/;
const UNIT_ALIASES = { 살: '세', 퍼센트: '%' };

/** "2억4천만" → 240000000, "3백만" → 3000000, "16,560" → 16560 */
export function parseKoreanAmount(text) {
  const tokens = text.match(/\d[\d,]*(?:\.\d+)?|억|만|천|백|십/g) ?? [];
  let total = 0;
  let section = 0;
  let n = null;
  const small = { 천: 1000, 백: 100, 십: 10 };
  for (const t of tokens) {
    if (t in small) {
      section += (n ?? 1) * small[t];
      n = null;
    } else if (t === '만' || t === '억') {
      total += (section + (n ?? 0)) * (t === '만' ? 1e4 : 1e8);
      section = 0;
      n = null;
    } else {
      n = Number(t.replaceAll(',', ''));
    }
  }
  return total + section + (n ?? 0);
}

/**
 * 문장에서 숫자 주장을 뽑는다.
 * @returns {{ value: number, unit: string|null, text: string }[]}
 */
export function extractNumberClaims(text) {
  if (!text) return [];
  const claims = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const amountText = m[0].trimEnd();
    const end = m.index + amountText.length;
    const unitMatch = UNIT_RE.exec(text.slice(end));
    const unitWord = unitMatch?.[1] ?? unitMatch?.[2];
    const unit = unitWord ? (UNIT_ALIASES[unitWord] ?? unitWord) : null;
    const base = Number(/\d[\d,]*(?:\.\d+)?/.exec(amountText)[0].replaceAll(',', ''));
    const value = parseKoreanAmount(amountText);
    claims.push({
      value,
      unit,
      multiplier: base === 0 ? 1 : value / base,
      text: unitMatch ? text.slice(m.index, end + unitMatch[0].length).trim() : amountText,
      start: m.index,
      end: end + (unitMatch?.[0].length ?? 0),
    });
  }

  // "19~34세", "10~20만원" — 앞 숫자에 단위가 없으면 뒤 숫자의 단위·자릿수를 이어받는다
  for (let i = claims.length - 2; i >= 0; i -= 1) {
    const a = claims[i];
    const b = claims[i + 1];
    if (a.unit === null && a.multiplier === 1 && RANGE_GAP_RE.test(text.slice(a.end, b.start))) {
      a.unit = b.unit;
      a.value *= b.multiplier;
    }
  }
  return claims.map(({ value, unit, text: t }) => ({ value, unit, text: t }));
}

/** 카드 1장의 숫자를 대조할 원문 (수집 결과의 텍스트 필드 전체) */
export function sourceTextOf(record) {
  return [
    record.title,
    record.summary,
    record.period_text,
    record.raw?.support_content,
    record.raw?.target,
    record.raw?.selection_criteria,
    record.raw?.apply_method,
  ]
    .filter(Boolean)
    .join('\n');
}

// 단위가 붙은 주장은 원문에서도 같은 단위여야 한다. 단위 없는 숫자만 값으로 대조한다.
function claimIsSupported(claim, sourceClaims) {
  return sourceClaims.some(
    (s) => Math.abs(s.value - claim.value) < 1e-9 && (claim.unit === null || s.unit === claim.unit),
  );
}

// 회차 카피에서 카드 수를 뜻하는 단위 ("5선", "5가지")
const COUNT_UNITS = new Set(['선', '가지', '개', '곳', '건']);

/** 원문에 없는 숫자 주장만 돌려준다 */
export function unsupportedClaims(text, sourceText) {
  const sourceClaims = extractNumberClaims(sourceText);
  return extractNumberClaims(text).filter((c) => !claimIsSupported(c, sourceClaims));
}

/**
 * @param {import('../../../shared/schemas/card-news').CardNewsData} data
 * @param {import('../../../shared/schemas/benefit').CollectedBenefits} collected
 * @param {{ today: string }} options  today = 실행일 YYYY-MM-DD (마감일 확인용)
 * @returns {{ ok: boolean,
 *             errors: { source_id: string|null, field: string, message: string }[],
 *             failedSourceIds: string[] }}
 *   source_id가 null인 에러는 회차 단위(series_title 등) — 카피 전체를 다시 만들어야 한다
 */
export function checkFacts(data, collected, { today }) {
  const errors = [];
  const records = new Map(collected.items.map((r) => [r.source_id, r]));

  for (const card of data.cards) {
    const record = records.get(card.source_id);
    const err = (field, message) => errors.push({ source_id: card.source_id, field, message });
    if (!record) {
      err('source_id', `수집 결과에 없는 source_id입니다: ${card.source_id}`);
      continue;
    }

    for (const [cardField, recordField] of INJECTED_FIELDS) {
      if (card[cardField] !== record[recordField]) {
        err(cardField, `원문 값과 다릅니다 (카드: ${JSON.stringify(card[cardField])}, 원문: ${JSON.stringify(record[recordField])})`);
      }
    }

    if (card.period_end && card.period_end < today) {
      err('period_end', `마감일(${card.period_end})이 실행일(${today})보다 이릅니다`);
    }

    const sourceText = sourceTextOf(record);
    for (const field of COPY_FIELDS) {
      for (const c of unsupportedClaims(card[field], sourceText)) {
        err(field, `원문에 없는 숫자: "${c.text}"`);
      }
    }
  }

  // 회차 단위 카피: 개수("5선")는 카드 수와 같아야 하고, 나머지 숫자는 어느 카드의 원문에든 있어야 한다
  const allSourceClaims = extractNumberClaims(
    data.cards
      .map((c) => records.get(c.source_id))
      .filter(Boolean)
      .map(sourceTextOf)
      .join('\n'),
  );
  const seriesFields = {
    series_title: data.series_title,
    hook_line: data.hook_line,
    'cta_card.cta_text': data.cta_card?.cta_text,
    'cta_card.hook_lines': data.cta_card?.hook_lines?.join('\n'),
  };
  for (const [field, text] of Object.entries(seriesFields)) {
    for (const c of extractNumberClaims(text)) {
      if (COUNT_UNITS.has(c.unit)) {
        if (c.value !== data.cards.length) {
          errors.push({ source_id: null, field, message: `카드 수(${data.cards.length})와 다릅니다: "${c.text}"` });
        }
      } else if (!claimIsSupported(c, allSourceClaims)) {
        errors.push({ source_id: null, field, message: `원문에 없는 숫자: "${c.text}"` });
      }
    }
  }

  const failedSourceIds = [...new Set(errors.map((e) => e.source_id).filter(Boolean))];
  return { ok: errors.length === 0, errors, failedSourceIds };
}

/**
 * 발행 직전에 다시 받은 수집 결과와 비교한다. 삭제됐거나 신청기한·수정일시가 바뀐 항목은 실패.
 * @param {{ source_id: string, period_text: string, updated_at: string }[]} used  카드에 쓴 수집 레코드
 * @param {{ source_id: string, period_text: string, updated_at: string }[]} latest  지금 다시 받은 레코드
 */
export function checkFreshness(used, latest) {
  const latestById = new Map(latest.map((r) => [r.source_id, r]));
  const errors = [];
  for (const r of used) {
    const now = latestById.get(r.source_id);
    if (!now) {
      errors.push({ source_id: r.source_id, field: 'source_id', message: '원문에서 사라졌습니다' });
      continue;
    }
    if (now.period_text !== r.period_text) {
      errors.push({
        source_id: r.source_id,
        field: 'period_text',
        message: `신청기한이 바뀌었습니다 ("${r.period_text}" → "${now.period_text}")`,
      });
    }
    if (now.updated_at !== r.updated_at) {
      errors.push({
        source_id: r.source_id,
        field: 'updated_at',
        message: `원문이 수정됐습니다 (${r.updated_at} → ${now.updated_at})`,
      });
    }
  }
  return { ok: errors.length === 0, errors, failedSourceIds: [...new Set(errors.map((e) => e.source_id))] };
}
