import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseKoreanAmount,
  extractNumberClaims,
  unsupportedClaims,
  checkFacts,
  checkFreshness,
} from '../src/fact-check.js';

// 실제 보조금24 데이터로 만든 샘플 (shared/schemas/*.example.json)
const loadExample = (name) =>
  JSON.parse(readFileSync(new URL(`../../../shared/schemas/${name}`, import.meta.url), 'utf8'));
const collected = loadExample('collected-benefits.example.json');
const cardNews = loadExample('card-news.example.json');
const TODAY = '2026-10-18';

/** 예시 카드뉴스를 복사해서 order번 카드만 바꾼다 */
function withCard(order, patch) {
  const data = structuredClone(cardNews);
  Object.assign(data.cards[order - 1], patch);
  return data;
}

const claims = (text) => extractNumberClaims(text).map((c) => [c.value, c.unit]);

// ── 숫자 정규화 ────────────────────────────────────────────

test('parseKoreanAmount: 한국어 자릿수를 숫자로', () => {
  assert.equal(parseKoreanAmount('20만'), 200_000);
  assert.equal(parseKoreanAmount('200,000'), 200_000);
  assert.equal(parseKoreanAmount('1,152만'), 11_520_000);
  assert.equal(parseKoreanAmount('3백만'), 3_000_000);
  assert.equal(parseKoreanAmount('2억4천만'), 240_000_000);
  assert.equal(parseKoreanAmount('2억 4천만'), 240_000_000);
  assert.equal(parseKoreanAmount('1억'), 100_000_000);
  assert.equal(parseKoreanAmount('16,560'), 16_560);
});

test('extractNumberClaims: 금액은 표기가 달라도 같은 값', () => {
  assert.deepEqual(claims('월 20만원'), [[200_000, '원']]);
  assert.deepEqual(claims('월 20만 원'), [[200_000, '원']]);
  assert.deepEqual(claims('월 200,000원'), [[200_000, '원']]);
  assert.deepEqual(claims('재산 2억4천만 원 미만'), [[240_000_000, '원']]);
});

test('extractNumberClaims: 나이·기간·횟수·비율 단위', () => {
  assert.deepEqual(claims('만 34세 이하'), [[34, '세']]);
  assert.deepEqual(claims('만34세이하'), [[34, '세']]);
  assert.deepEqual(claims('39살까지'), [[39, '세']]);
  assert.deepEqual(claims('최대 36개월'), [[36, '개월']]);
  assert.deepEqual(claims('1회 3박 4일, 연 10회까지'), [
    [1, '회'],
    [3, '박'],
    [4, '일'],
    [10, '회'],
  ]);
  assert.deepEqual(claims('보험료 80% 지원'), [[80, '%']]);
  assert.deepEqual(claims('10명 미만 사업장'), [[10, '명']]);
});

test('extractNumberClaims: 띄어 쓴 단어를 단위로 읽지 않는다 (원만 예외)', () => {
  // 실제 보조금24 요약: "미지급일수의 1/2 일시지급"
  assert.deepEqual(claims('1/2 일시지급'), [
    [1, null],
    [2, null],
  ]);
  assert.deepEqual(claims('270만 원'), [[2_700_000, '원']]);
});

test('extractNumberClaims: 범위의 앞 숫자는 뒤 단위를 이어받는다', () => {
  assert.deepEqual(claims('만 19~34세'), [
    [19, '세'],
    [34, '세'],
  ]);
  assert.deepEqual(claims('10~20만원'), [
    [100_000, '원'],
    [200_000, '원'],
  ]);
});

test('unsupportedClaims: 표현이 달라도 같은 사실이면 통과', () => {
  assert.deepEqual(unsupportedClaims('만 19~34세', '19세 이상 34세 이하'), []);
  assert.deepEqual(unsupportedClaims('월 20만원', '월 200,000원 지급'), []);
  assert.deepEqual(unsupportedClaims('270만원 미만', '월 평균 보수가 270만 원 미만'), []);
});

test('unsupportedClaims: 원문에 없는 숫자만 돌려준다', () => {
  assert.deepEqual(
    unsupportedClaims('월 30만원, 최대 12개월', '월 30만원, 최대 6개월').map((c) => c.text),
    ['12개월'],
  );
  // 값은 같아도 단위가 다르면 다른 사실
  assert.deepEqual(unsupportedClaims('34개월', '34세 이하').map((c) => c.text), ['34개월']);
});

// ── 카드뉴스 전체 검증 (실제 샘플) ──────────────────────────

test('checkFacts: 샘플 카드뉴스는 통과', () => {
  const result = checkFacts(cardNews, collected, { today: TODAY });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('checkFacts: 금액을 틀리면 해당 카드만 실패', () => {
  // 원문: 훈련수당(주당 10만원)
  const result = checkFacts(withCard(1, { benefit: '직무교육 + 협력사 취업연계, 훈련수당 주당 20만원' }), collected, {
    today: TODAY,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failedSourceIds, ['gov24:B55400900001']);
  assert.equal(result.errors[0].field, 'benefit');
  assert.match(result.errors[0].message, /20만원/);
});

test('checkFacts: 비율·나이·기간을 틀려도 실패', () => {
  const cases = [
    [2, { benefit: '국가기술자격시험 응시료 70% 지원 (1인당 총 3회)' }, '70%'], // 원문 50%
    [2, { target: '만 39세 이하 청년' }, '39세'], // 원문 만 34세
    [5, { benefit: '고용보험·국민연금 보험료 80% 지원 (최대 48개월)' }, '48개월'], // 원문 36개월
    [3, { caption: '연 12회까지 무료로 빌려요' }, '12회'], // 원문 연 10회
  ];
  for (const [order, patch, wrong] of cases) {
    const result = checkFacts(withCard(order, patch), collected, { today: TODAY });
    assert.equal(result.ok, false, `${wrong}을 잡아야 합니다`);
    assert.equal(result.failedSourceIds.length, 1);
    assert.ok(result.errors.some((e) => e.message.includes(wrong)), `${wrong} 에러 메시지가 없습니다`);
  }
});

test('checkFacts: 다른 카드의 원문에 있는 숫자도 실패 (카드별로 대조)', () => {
  // 80%는 두루누리(5번) 원문에는 있지만 응시료 지원(2번) 원문에는 없다
  const result = checkFacts(withCard(2, { caption: '응시료 80% 할인' }), collected, { today: TODAY });
  assert.deepEqual(result.failedSourceIds, ['gov24:149200005023']);
});

test('checkFacts: 코드 주입 필드가 원문과 다르면 실패', () => {
  const result = checkFacts(withCard(1, { title: '대기업 상생일자리', source_url: 'https://example.com' }), collected, {
    today: TODAY,
  });
  assert.deepEqual(
    result.errors.map((e) => e.field),
    ['title', 'source_url'],
  );
});

test('checkFacts: 수집 결과에 없는 source_id는 실패', () => {
  const result = checkFacts(withCard(1, { source_id: 'gov24:NOPE' }), collected, { today: TODAY });
  assert.deepEqual(result.failedSourceIds, ['gov24:NOPE']);
});

test('checkFacts: 마감일이 지난 카드는 실패', () => {
  const data = withCard(1, { period_end: '2026-10-17' });
  const items = structuredClone(collected.items);
  items[0].period_end = '2026-10-17';
  const result = checkFacts(data, { ...collected, items }, { today: TODAY });
  assert.deepEqual(
    result.errors.map((e) => e.field),
    ['period_end'],
  );
});

test('checkFacts: 회차 제목의 N선은 카드 수와 같아야 한다', () => {
  assert.equal(checkFacts({ ...cardNews, series_title: '몰랐던 일자리 혜택 5가지' }, collected, { today: TODAY }).ok, true);

  const result = checkFacts({ ...cardNews, series_title: '몰랐던 일자리 혜택 7선' }, collected, { today: TODAY });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].source_id, null); // 회차 단위 에러 → 카피 전체 재생성
  assert.equal(result.errors[0].field, 'series_title');
  assert.deepEqual(result.failedSourceIds, []);
});

test('checkFacts: 후킹 문구의 숫자도 원문에 있어야 한다', () => {
  assert.equal(checkFacts({ ...cardNews, hook_line: '보험료\n80% 아끼는 법' }, collected, { today: TODAY }).ok, true);
  assert.equal(checkFacts({ ...cardNews, hook_line: '연 500만원\n아끼는 법' }, collected, { today: TODAY }).ok, false);
});

// ── 발행 직전 최신성 확인 ──────────────────────────────────

test('checkFreshness: 그대로면 통과', () => {
  assert.equal(checkFreshness(collected.items, collected.items).ok, true);
});

test('checkFreshness: 삭제·신청기한 변경·수정일시 변경은 실패', () => {
  const [a, b, c, ...rest] = structuredClone(collected.items);
  b.period_text = '2026.11.30.까지';
  c.updated_at = '2026-10-20T10:00:00+09:00';
  const result = checkFreshness(collected.items, [b, c, ...rest]); // a는 삭제됨
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((e) => [e.source_id, e.field]),
    [
      [a.source_id, 'source_id'],
      [b.source_id, 'period_text'],
      [c.source_id, 'updated_at'],
    ],
  );
});
