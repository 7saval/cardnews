// 보조금24 `신청기한` 자유 텍스트를 분류하고 마감일을 뽑는다.
//
// 실제 값 예시:
//   "2026.10.1.(수) ~ 10.31.(금)"     → 연도 있음 (끝 날짜는 앞 연도를 이어받음)
//   "○ 정기신청 : 5.1.~5.31."          → 연도 없음 (매년 반복)
//   "상시신청", "예산 소진 시까지"       → 날짜 없음
//   "주택도시기금 ... 규정에 따름"       → 날짜 없음

// [연도.]월.일 — 연도는 4자리(2026) 또는 '26 형태만 인정한다. "1.5배" 같은 소수가
// 날짜로 잡히지 않게 일 뒤에는 . / 일 / ( / 공백 / ~ / 끝 중 하나가 와야 한다.
const DATE_RE =
  /(?:(20\d{2}|'\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*(?=[.일(\s~∼\-]|$)/g;

const ALWAYS_RE = /상시|연중|수시/;
const BUDGET_RE = /예산|소진|선착순/;
const REFERENCE_RE = /따름|따라|별도|공고|공지|문의|확인|협의|정해|상이|참고/;
const NO_APPLICATION_RE = /신청\s*불필요|신청\s*불요|신청\s*절차\s*없음|해당\s*없음|^\s*(없음|-)\s*$/;

function toIso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 텍스트에서 날짜 후보를 순서대로 뽑는다. 연도 없는 날짜는 앞 날짜의 연도를 이어받는다. */
export function extractDates(text) {
  const dates = [];
  let lastYear = null;
  let lastMonth = null;
  for (const m of text.matchAll(DATE_RE)) {
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    let year = null;
    if (m[1]) {
      year = m[1].startsWith("'") ? 2000 + Number(m[1].slice(1)) : Number(m[1]);
    } else if (lastYear) {
      // "2026.12.1 ~ 1.15"처럼 해를 넘기는 범위
      year = lastMonth && month < lastMonth ? lastYear + 1 : lastYear;
    }
    dates.push({ year, month, day, iso: year ? toIso(year, month, day) : null });
    if (year) {
      lastYear = year;
      lastMonth = month;
    }
  }
  return dates;
}

/**
 * @returns {{ kind: 'dated'|'yearless'|'no_application'|'always'|'budget'|'reference'|'empty'|'other',
 *             end: string|null, mixed: boolean }}
 *   end — 연도까지 확정된 가장 늦은 날짜 (dated일 때만)
 *   mixed — 날짜와 "상시/예산 소진" 같은 문구가 같이 있음 (해석 주의)
 */
export function classifyPeriod(text) {
  if (!text || !text.trim()) return { kind: 'empty', end: null, mixed: false };

  const dates = extractDates(text);
  const hasOpenEnded = ALWAYS_RE.test(text) || BUDGET_RE.test(text);
  const dated = dates.filter((d) => d.iso);

  if (dated.length > 0) {
    const end = dated.map((d) => d.iso).sort().at(-1);
    return { kind: 'dated', end, mixed: hasOpenEnded };
  }
  if (dates.length > 0) return { kind: 'yearless', end: null, mixed: hasOpenEnded };
  if (NO_APPLICATION_RE.test(text)) return { kind: 'no_application', end: null, mixed: false };
  if (ALWAYS_RE.test(text)) return { kind: 'always', end: null, mixed: false };
  if (BUDGET_RE.test(text)) return { kind: 'budget', end: null, mixed: false };
  if (REFERENCE_RE.test(text)) return { kind: 'reference', end: null, mixed: false };
  return { kind: 'other', end: null, mixed: false };
}
