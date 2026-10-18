import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPeriod, extractDates } from '../src/lib/period.js';

// 실제 보조금24 신청기한 값에서 가져온 사례들 (_docs/topic-pivot-benefits-plan.md §3.1)

test('상시·연중·수시는 always', () => {
  for (const text of ['상시신청', '연중 상시', '수시 접수']) {
    assert.deepEqual(classifyPeriod(text), { kind: 'always', end: null, mixed: false }, text);
  }
});

test('연도가 있는 범위는 dated, 끝 날짜가 앞 연도를 이어받는다', () => {
  assert.deepEqual(classifyPeriod('2026.10.1.(수) ~ 10.31.(금)'), { kind: 'dated', end: '2026-10-31', mixed: false });
  assert.equal(classifyPeriod("'26.3.2 ~ '26.3.20").end, '2026-03-20');
  assert.equal(classifyPeriod('2026년 5월 1일 ~ 5월 31일').end, '2026-05-31');
});

test('해를 넘기는 범위는 다음 해로 넘어간다', () => {
  assert.equal(classifyPeriod('2026.12.1 ~ 1.15').end, '2027-01-15');
});

test('연도 없는 날짜는 yearless, 마감일을 만들지 않는다', () => {
  assert.deepEqual(classifyPeriod('○ 정기신청 : 5.1.~5.31.'), { kind: 'yearless', end: null, mixed: false });
});

test('날짜와 상시·예산 문구가 섞이면 mixed', () => {
  const r = classifyPeriod('2026.1.2 ~ 12.31 (예산 소진 시 조기 마감)');
  assert.equal(r.kind, 'dated');
  assert.equal(r.mixed, true);
});

test('예산 소진·공고 참조·신청 불필요·빈 값', () => {
  assert.equal(classifyPeriod('예산 소진 시까지').kind, 'budget');
  assert.equal(classifyPeriod('주택도시기금 운용 규정에 따름').kind, 'reference');
  assert.equal(classifyPeriod('접수기관 별 상이').kind, 'reference');
  assert.equal(classifyPeriod('신청 불필요').kind, 'no_application');
  assert.equal(classifyPeriod('-').kind, 'no_application');
  assert.equal(classifyPeriod('   ').kind, 'empty');
  assert.equal(classifyPeriod(null).kind, 'empty');
});

test('소수·배수는 날짜로 잡지 않는다', () => {
  assert.deepEqual(extractDates('기준중위소득 1.5배 이하'), []);
});

test('있을 수 없는 월·일은 버린다', () => {
  assert.deepEqual(extractDates('13.40'), []);
});
