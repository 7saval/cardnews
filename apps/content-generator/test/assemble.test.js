import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assembleCardNews } from '../src/assemble.js';
import { buildUserMessage } from '../src/prompt.js';
import { assertValidCardNewsData } from '../../../shared/schemas/validate-card-news.js';
import { assertValidCollectedBenefits } from '../../../shared/schemas/validate-benefits.js';

const loadExample = (name) =>
  JSON.parse(readFileSync(new URL(`../../../shared/schemas/${name}`, import.meta.url), 'utf8'));
const collected = loadExample('collected-benefits.example.json');
const cardNews = loadExample('card-news.example.json');
const OPTIONS = { handle: 'hotsoozip', today: '2026-10-18' };

/** 예시 카드뉴스에서 LLM이 쓰는 필드만 남긴 응답 (순서를 뒤집어서 LLM 순서를 따르지 않는지도 본다) */
function llmCopy() {
  return {
    series_title: cardNews.series_title,
    hook_line: cardNews.hook_line,
    cards: cardNews.cards
      .map(({ source_id, subtitle, caption, benefit, target }) => ({ source_id, subtitle, caption, benefit, target }))
      .reverse(),
    cta_card: { cta_text: cardNews.cta_card.cta_text, hook_lines: cardNews.cta_card.hook_lines },
  };
}

test('수집 샘플은 수집 결과 스키마를 만족한다', () => {
  assertValidCollectedBenefits(collected, 'collected-benefits.example.json');
});

test('assembleCardNews: 사실 필드를 원문에서 주입하면 예시 카드뉴스와 같아진다', () => {
  const { data, errors } = assembleCardNews(llmCopy(), collected, OPTIONS);
  assert.deepEqual(errors, []);
  assert.deepEqual(data, cardNews);
  assertValidCardNewsData(data, 'assemble 결과');
});

test('assembleCardNews: LLM이 사실 필드를 써 넣어도 원문 값이 이긴다', () => {
  const copy = llmCopy();
  copy.cards[0].title = '지어낸 정책명';
  copy.cards[0].source_url = 'https://example.com';
  const { data } = assembleCardNews(copy, collected, OPTIONS);
  const card = data.cards.find((c) => c.source_id === copy.cards[0].source_id);
  const record = collected.items.find((r) => r.source_id === copy.cards[0].source_id);
  assert.equal(card.title, record.title);
  assert.equal(card.source_url, record.source_url);
});

test('assembleCardNews: 카드 누락·지어낸 ID·중복은 회차 단위 에러', () => {
  const copy = llmCopy();
  const missing = copy.cards.pop(); // 하나 빠뜨림
  copy.cards.push({ ...copy.cards[0] }); // 중복
  copy.cards.push({ ...copy.cards[1], source_id: 'gov24:FAKE' }); // 지어낸 ID
  const { data, errors } = assembleCardNews(copy, collected, OPTIONS);
  assert.equal(data.cards.length, collected.items.length - 1);
  assert.ok(errors.every((e) => e.source_id === null));
  const messages = errors.map((e) => e.message).join('\n');
  assert.match(messages, /두 번/);
  assert.match(messages, /gov24:FAKE/);
  assert.match(messages, new RegExp(`빠졌습니다: ${missing.source_id}`));
});

test('assembleCardNews: hook_lines가 2개보다 적으면 생략, 많으면 앞의 2개', () => {
  const short = llmCopy();
  short.cta_card.hook_lines = ['하나만'];
  assert.equal('hook_lines' in assembleCardNews(short, collected, OPTIONS).data.cta_card, false);

  const long = llmCopy();
  long.cta_card.hook_lines = ['a', 'b', 'c'];
  assert.deepEqual(assembleCardNews(long, collected, OPTIONS).data.cta_card.hook_lines, ['a', 'b']);
});

test('buildUserMessage: 항목마다 source_id와 원문을 넣고, 긴 원문은 자른다', () => {
  const message = buildUserMessage(collected);
  for (const r of collected.items) assert.ok(message.includes(`source_id: ${r.source_id}`));
  assert.match(message, /카테고리: 고용·창업/);
  assert.match(message, /항목 수: 5/);

  const long = structuredClone(collected);
  long.items[0].raw.support_content = '가'.repeat(3000);
  assert.match(buildUserMessage(long), /…\(이하 생략\)/);
});
