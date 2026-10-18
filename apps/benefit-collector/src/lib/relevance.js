// "몰랐던" 혜택을 고르기 위한 LLM 점수. 후보마다 두 가지를 1~5로 매긴다.
//   relevance — 19~34세 개인이 실제로 받을 수 있고 쓸모 있는가
//   obscurity — 청년들이 잘 모를 법한가 (누구나 아는 대표 정책이면 낮다)
// 조회수 구간 대신 이 방식을 택했다 (2026-10-18 결정, _docs/topic-pivot-benefits-plan.md §6.1).
//
// 같은 혜택을 매주 다시 매기지 않도록 `source_id@updated_at` 키로 캐시한다. 원문이 바뀌면 다시 매긴다.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

export const SCORE_SYSTEM_PROMPT = `너는 19~34세 청년 독자를 위한 정부·공공 혜택 큐레이터야.
입력된 혜택마다 아래 두 점수를 1~5 정수로 매기고, 이유를 한 문장으로 적어.

[relevance — 청년이 실제로 받을 수 있고 쓸모 있는가]
5: 청년(학생·취준생·사회초년생·1인가구 등) 다수가 직접 신청할 수 있고 생활에 바로 도움이 된다
4: 청년도 신청할 수 있고, 해당되는 청년이 꽤 있다 (예: 저소득 청년, 특정 직군 청년)
3: 청년도 대상이지만 해당되는 경우가 드물다 (특정 질환·장애·재난 피해 등)
2: 형식상 나이 제한은 없지만 실제로는 다른 집단(노인, 영유아 부모, 사업주 등) 위주다
1: 청년과 거의 무관하다

[obscurity — 청년들이 잘 모를 법한가]
5: 거의 알려지지 않았는데 알면 이득이다
3: 아는 사람은 알지만 많이들 놓친다
1: 누구나 아는 대표 정책이다 (예: 국민취업지원제도, 청년도약계좌 수준)

규칙:
- 입력의 원문만 근거로 판단한다. 원문에 없는 조건을 추측해 점수를 올리지 않는다.
- scores에는 입력 항목마다 정확히 1개씩 넣고, source_id는 입력 값을 그대로 복사한다.
- 응답은 주어진 JSON 스키마 형식 하나만 반환한다.`;

export const SCORE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source_id: { type: 'string' },
          relevance: { type: 'integer', description: '1~5' },
          obscurity: { type: 'integer', description: '1~5' },
          reason: { type: 'string', description: '한 문장' },
        },
        required: ['source_id', 'relevance', 'obscurity', 'reason'],
      },
    },
  },
  required: ['scores'],
};

export const SCORE_ZOD_SCHEMA = z.object({
  scores: z.array(
    z.object({
      source_id: z.string(),
      relevance: z.number().int(),
      obscurity: z.number().int(),
      reason: z.string(),
    }),
  ),
});

/** 한 번에 매기는 후보 수. 응답이 길어지면 항목을 빠뜨리기 쉬워서 작게 나눈다 */
export const BATCH_SIZE = 30;
const EXCERPT_LENGTH = 300;

const excerpt = (text) => (text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text);
const ageText = (r) =>
  r.age_min == null && r.age_max == null ? '제한 없음' : `${r.age_min ?? ''}~${r.age_max ?? ''}세`;

export const cacheKey = (r) => `${r.source_id}@${r.updated_at}`;

export function buildScoreMessage(records) {
  const blocks = records.map((r) =>
    [
      `source_id: ${r.source_id}`,
      `정책명: ${r.title}`,
      `분야: ${r.category} / 기관: ${r.org_name} / 대상 나이: ${ageText(r)}`,
      `요약: ${r.summary}`,
      `지원대상: ${excerpt(r.raw.target)}`,
      `지원내용: ${excerpt(r.raw.support_content)}`,
    ].join('\n'),
  );
  return `혜택 ${records.length}건\n\n${blocks.join('\n\n---\n\n')}`;
}

const isScore = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

/**
 * LLM 응답에서 입력에 있는 source_id의 올바른 점수만 남긴다. 지어낸 ID, 범위 밖 점수, 중복은 버린다.
 * @returns {Map<string, { relevance: number, obscurity: number, reason: string }>}
 */
export function parseScores(json, records) {
  const known = new Set(records.map((r) => r.source_id));
  const scores = new Map();
  for (const s of json?.scores ?? []) {
    if (!known.has(s.source_id) || scores.has(s.source_id)) continue;
    if (!isScore(s.relevance) || !isScore(s.obscurity)) continue;
    scores.set(s.source_id, { relevance: s.relevance, obscurity: s.obscurity, reason: String(s.reason ?? '') });
  }
  return scores;
}

export async function loadScoreCache(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * 캐시에 없는 후보만 배치로 매기고, 빠진 항목은 한 번 더 묻는다.
 * @param {import('../../../../shared/schemas/benefit').BenefitRecord[]} records
 * @param {{ cacheFile: string, generate: (req: object) => Promise<{ json: any, model: string }> }} options
 *   generate는 llm.js의 generateJson (테스트에서 바꿔 끼운다)
 * @returns {Promise<Map<string, { relevance: number, obscurity: number, reason: string }>>}
 *   끝내 점수를 못 받은 후보는 들어 있지 않다 (선별에서 빠진다)
 */
export async function scoreRelevance(records, { cacheFile, generate }) {
  const cache = await loadScoreCache(cacheFile);
  const scores = new Map();
  let pending = [];
  for (const r of records) {
    const hit = cache[cacheKey(r)];
    if (hit) scores.set(r.source_id, hit);
    else pending.push(r);
  }
  console.log(`  관련성 점수: 캐시 ${scores.size}건, 새로 매길 것 ${pending.length}건`);

  for (let round = 1; round <= 2 && pending.length > 0; round += 1) {
    const missed = [];
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const { json, model } = await generate({
        system: SCORE_SYSTEM_PROMPT,
        user: buildScoreMessage(batch),
        jsonSchema: SCORE_RESPONSE_SCHEMA,
        zodSchema: SCORE_ZOD_SCHEMA,
      });
      const got = parseScores(json, batch);
      for (const r of batch) {
        const s = got.get(r.source_id);
        if (!s) {
          missed.push(r);
          continue;
        }
        scores.set(r.source_id, s);
        cache[cacheKey(r)] = { ...s, model, scored_at: new Date().toISOString() };
      }
      console.log(`  관련성 점수: ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length} (${model})`);
    }
    pending = missed;
  }
  if (pending.length > 0) {
    console.warn(`  ⚠ 점수를 못 받은 ${pending.length}건은 제외합니다: ${pending.map((r) => r.source_id).join(', ')}`);
  }

  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cache, null, 2));
  return scores;
}
