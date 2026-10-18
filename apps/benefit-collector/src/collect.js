// 보조금24에서 이번 회차에 쓸 혜택 N건을 골라 content-generator 입력(CollectedBenefits)으로 저장하는 CLI.
//
// 흐름: 원본 로드(24시간 캐시) → 정규화 → 공통 조건 필터(상시·개인·청년·지역) → 발행 이력 제외
//   → 카테고리 순환(가장 오래 안 다룬 것부터) → LLM 관련성 점수 → 상위 N건
// 규칙의 배경: _docs/topic-pivot-benefits-plan.md §6.1
//
// 사용법:
//   npm run collect                                   # 카테고리 시리즈, 순환 순서대로 5건
//   npm run collect -- --category 주거·자립 --count 4
//   npm run collect -- --series district --region 동작구
//   npm run collect -- --dry-run                      # LLM 없이 카테고리별 후보 수만 확인
//   npm run collect -- --refresh                      # 원본을 API에서 다시 받기
//
// 산출물:
//   output/<YYYYMMDD-HHmmss>-<series>-adopted.json   content-generator --input으로 넘길 파일
//   output/<같은 이름>.scores.json                     후보 전체의 점수·이유 (사람 검수용)

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOperation } from './lib/gov24.js';
import { normalizeGov24, GOV24_DATA_SOURCE } from './lib/normalize-gov24.js';
import { filterCandidates, categoryOrder, pickTop, ROTATION_CATEGORIES } from './lib/select.js';
import { scoreRelevance } from './lib/relevance.js';
import { generateJson } from './lib/llm.js';
import { HISTORY_FILE, loadHistory } from './lib/history.js';
import { assertValidCollectedBenefits } from '../../../shared/schemas/validate-benefits.js';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(appRoot, 'output');
const rawDir = join(outputDir, 'raw');
const scoreCacheFile = join(outputDir, 'relevance-cache.json');

function parseArgs(argv) {
  const args = { series: 'always', category: null, region: null, count: 5, refresh: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--series') args.series = argv[++i];
    else if (argv[i] === '--category') args.category = argv[++i];
    else if (argv[i] === '--region') args.region = argv[++i];
    else if (argv[i] === '--count') args.count = Number(argv[++i]);
    else if (argv[i] === '--refresh') args.refresh = true;
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  if (!['always', 'district'].includes(args.series)) {
    throw new Error(`--series는 always 또는 district입니다 (받은 값: ${args.series})`);
  }
  if (args.series === 'district' && !args.region) {
    throw new Error('district 시리즈는 --region이 필요합니다. 예: --region 동작구');
  }
  if (args.category && !ROTATION_CATEGORIES.includes(args.category)) {
    throw new Error(`--category는 다음 중 하나입니다: ${ROTATION_CATEGORIES.join(', ')}`);
  }
  if (!Number.isInteger(args.count) || args.count < 1) throw new Error('--count는 1 이상의 정수입니다');
  // "동작구" → "서울특별시 동작구" (normalize-gov24.js regionOf와 같은 형식)
  if (args.region && !args.region.startsWith('서울특별시')) args.region = `서울특별시 ${args.region}`;
  return args;
}

/** KST 기준 "20261018-153000" */
function stampKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
}

async function loadRecords(refresh) {
  console.log('보조금24 원본 데이터 로드');
  const list = await loadOperation('serviceList', { rawDir, refresh });
  const conditions = await loadOperation('supportConditions', { rawDir, refresh });
  const condById = new Map(conditions.map((c) => [c.서비스ID, c]));
  return list.map((row) => normalizeGov24(row, condById.get(row.서비스ID)));
}

/** 이번 회차 후보 묶음들. 카테고리 시리즈는 순환 순서대로 여러 개, 자치구 시리즈는 하나 */
function candidateGroups(records, args, history) {
  const excludeIds = new Set(history.map((h) => h.source_id));
  if (args.series === 'district') {
    return [{ category: null, region: args.region, candidates: filterCandidates(records, { seriesType: 'district', region: args.region, excludeIds }) }];
  }
  const order = args.category ? [args.category] : categoryOrder(history);
  return order.map((category) => ({
    category,
    region: null,
    candidates: filterCandidates(records, { seriesType: 'always', category, excludeIds }),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const records = await loadRecords(args.refresh);
  const history = await loadHistory(HISTORY_FILE);
  console.log(`\n전체 ${records.length}건 · 발행 이력 ${history.length}건`);

  const groups = candidateGroups(records, args, history);
  if (args.dryRun) {
    console.log('\n■ 후보 수 (순환 순서, LLM 점수 전)');
    for (const g of groups) console.log(`  ${(g.category ?? g.region).padEnd(10)} ${g.candidates.length}`);
    return;
  }

  for (const g of groups) {
    const label = g.category ?? g.region;
    if (g.candidates.length < args.count) {
      console.log(`\n- ${label}: 후보 ${g.candidates.length}건, ${args.count}건 미만이라 건너뜀`);
      continue;
    }
    console.log(`\n- ${label}: 후보 ${g.candidates.length}건`);
    const scores = await scoreRelevance(g.candidates, { cacheFile: scoreCacheFile, generate: generateJson });
    const picked = pickTop(g.candidates, scores, args.count);
    if (picked.length < args.count) {
      console.log(`  관련성 기준을 넘은 후보가 ${picked.length}건이라 건너뜀`);
      continue;
    }

    const collected = {
      collected_at: new Date().toISOString(),
      series_type: args.series,
      category: g.category,
      region: g.region,
      data_source: GOV24_DATA_SOURCE,
      items: picked,
    };
    assertValidCollectedBenefits(collected, '수집 결과');

    await mkdir(outputDir, { recursive: true });
    const outFile = join(outputDir, `${stampKst()}-${args.series}-adopted.json`);
    await writeFile(outFile, JSON.stringify(collected, null, 2));
    const pickedIds = new Set(picked.map((r) => r.source_id));
    const ranked = g.candidates
      .map((r) => ({ source_id: r.source_id, title: r.title, picked: pickedIds.has(r.source_id), ...scores.get(r.source_id) }))
      .sort((a, b) => (b.relevance ?? 0) + (b.obscurity ?? 0) - ((a.relevance ?? 0) + (a.obscurity ?? 0)));
    await writeFile(outFile.replace(/\.json$/, '.scores.json'), JSON.stringify(ranked, null, 2));

    console.log(`\n✔ ${label} ${picked.length}건을 골랐습니다: ${outFile}`);
    for (const r of picked) {
      const s = scores.get(r.source_id);
      console.log(`  - [관련 ${s.relevance} · 몰랐을 ${s.obscurity}] ${r.title} — ${s.reason}`);
    }
    console.log('\n발행(또는 렌더) 뒤 이력에 기록하세요: npm run mark-published -- --input <위 파일>');
    return;
  }

  throw new Error(`${args.count}건을 채울 수 있는 ${args.series === 'district' ? '자치구' : '카테고리'}가 없습니다.`);
}

main().catch((err) => {
  console.error(`\n✘ 수집 실패: ${err.message}`);
  process.exit(1);
});
