// 보조금24 API 실제 응답을 전수 집계하는 Phase 0 조사 스크립트.
// (_docs/topic-pivot-benefits-plan.md §3 "조사 스크립트로 확인할 항목")
//
// 확인하는 것:
//   1. 필수 필드 채움 비율 — 서비스명, 지원내용, 신청기한, 지원대상, 상세조회URL, 소관기관명
//   2. 신청기한 형식 — 연도까지 날짜로 파싱되는 비율, 상시·예산소진·자유 텍스트 비율
//   3. 지원내용·지원대상 길이 — 카드 한 장에 들어가는지
//   4. 마감 3~14일 이내 건수 — 전체 / 청년 대상 / 전국+서울
//   5. 서비스분야·소관기관유형 분포 — 카테고리 매핑, 지역 필터 설계용
//
// 사용법:
//   npm run test:gov24                       # 24시간 안에 받은 원본이 있으면 재사용
//   npm run test:gov24 -- --refresh         # API에서 다시 받기
//   npm run test:gov24 -- --today 2026-10-20

import 'dotenv/config';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAll } from './lib/gov24.js';
import { classifyPeriod } from './lib/period.js';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(appRoot, 'output', 'raw');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const REQUIRED_FIELDS = ['서비스명', '지원내용', '신청기한', '지원대상', '상세조회URL', '소관기관명'];
// 청년: 대상 나이 범위가 19~34세와 겹치고, 상한이 39세 이하인 서비스 (전 연령 대상은 제외)
const YOUTH = { min: 19, max: 34, upperLimit: 39 };
const WINDOW = { from: 3, to: 14 };

function parseArgs(argv) {
  const args = { refresh: false, today: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--refresh') args.refresh = true;
    if (argv[i] === '--today') args.today = argv[++i];
  }
  return args;
}

function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadOperation(operation, refresh) {
  const file = join(rawDir, `gov24-${operation}.json`);
  if (!refresh) {
    const info = await stat(file).catch(() => null);
    if (info && Date.now() - info.mtimeMs < CACHE_TTL_MS) {
      console.log(`  ${operation}: 캐시 사용 (${file})`);
      return JSON.parse(await readFile(file, 'utf8'));
    }
  }
  const rows = await fetchAll(operation, {
    onPage: ({ page, fetched, total }) =>
      process.stdout.write(`\r  ${operation}: ${page}페이지, ${fetched}/${total}건`),
  });
  process.stdout.write('\n');
  await mkdir(rawDir, { recursive: true });
  await writeFile(file, JSON.stringify(rows));
  return rows;
}

const isFilled = (v) => v != null && String(v).trim() !== '';
const pct = (n, total) => `${((n / total) * 100).toFixed(1)}%`;

function percentiles(values, ps = [50, 75, 90]) {
  const sorted = [...values].sort((a, b) => a - b);
  return Object.fromEntries(
    ps.map((p) => [`p${p}`, sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]]),
  );
}

function countBy(rows, key) {
  const counts = {};
  for (const r of rows) {
    const k = r[key] ?? '(null)';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function isYouth(cond) {
  if (!cond) return false;
  const min = cond.JA0110 ?? 0;
  const max = cond.JA0111 ?? 999;
  return min <= YOUTH.max && max >= YOUTH.min && max <= YOUTH.upperLimit;
}

// 소관기관유형 실제 값: 중앙행정기관, 공공기관, 광역시도, 시군구, 지방출자_출연기관, 지방공기업, 교육청
const NATIONAL_ORG_TYPES = new Set(['중앙행정기관', '공공기관']);

function isNationalOrSeoul(row) {
  if (NATIONAL_ORG_TYPES.has(row.소관기관유형)) return true;
  return row.소관기관명?.startsWith('서울') ?? false;
}

function printTable(title, counts, total) {
  console.log(`\n■ ${title}`);
  for (const [k, n] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(14)} ${String(n).padStart(6)}  ${pct(n, total)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = args.today ?? todayKst();
  const windowFrom = addDays(today, WINDOW.from);
  const windowTo = addDays(today, WINDOW.to);

  console.log('보조금24 원본 데이터 로드');
  const list = await loadOperation('serviceList', args.refresh);
  const conditions = await loadOperation('supportConditions', args.refresh);
  const condById = new Map(conditions.map((c) => [c.서비스ID, c]));
  const total = list.length;
  console.log(`\n기준일 ${today} · 전체 ${total}건 · 지원조건 ${conditions.length}건`);

  // 1. 필수 필드 채움 비율
  const fill = Object.fromEntries(REQUIRED_FIELDS.map((f) => [f, list.filter((r) => isFilled(r[f])).length]));
  printTable('필수 필드 채움 비율', fill, total);

  // 2. 신청기한 형식
  const enriched = list.map((r) => ({
    row: r,
    period: classifyPeriod(r.신청기한),
    youth: isYouth(condById.get(r.서비스ID)),
    region: isNationalOrSeoul(r),
  }));
  const kindCounts = countBy(enriched.map((e) => ({ kind: e.period.kind })), 'kind');
  printTable('신청기한 형식', kindCounts, total);
  const mixed = enriched.filter((e) => e.period.mixed).length;
  console.log(`  (날짜 + 상시/예산소진 문구가 섞인 항목 ${mixed}건)`);

  // 3. 길이
  console.log('\n■ 글자 수 (공백 포함, null 제외)');
  for (const f of ['서비스명', '지원내용', '지원대상', '서비스목적요약']) {
    const lens = list.filter((r) => isFilled(r[f])).map((r) => r[f].length);
    const short = lens.filter((n) => n <= 60).length;
    console.log(`  ${f.padEnd(8)} ${JSON.stringify(percentiles(lens))}  60자 이하 ${pct(short, lens.length)}`);
  }

  // 4. 마감 임박 건수
  const dated = enriched.filter((e) => e.period.kind === 'dated');
  const open = dated.filter((e) => e.period.end >= today);
  const inWindow = open.filter((e) => e.period.end >= windowFrom && e.period.end <= windowTo);
  console.log(`\n■ 마감 임박 (연도까지 파싱된 ${dated.length}건 기준)`);
  console.log(`  마감 안 지남              ${open.length}`);
  console.log(`  마감 ${windowFrom}~${windowTo}  ${inWindow.length}`);
  console.log(`    └ 전국+서울             ${inWindow.filter((e) => e.region).length}`);
  console.log(`    └ 청년 대상             ${inWindow.filter((e) => e.youth).length}`);
  console.log(`    └ 청년 + 전국+서울      ${inWindow.filter((e) => e.youth && e.region).length}`);
  console.log(`  (참고) 청년 대상 전체     ${enriched.filter((e) => e.youth).length}`);
  console.log(`  (참고) 청년 + 마감 안 지남 ${open.filter((e) => e.youth).length}`);
  const to30 = addDays(today, 30);
  const in30 = open.filter((e) => e.period.end <= to30);
  console.log(
    `  (참고) 마감 30일 이내    ${in30.length} (전국+서울 ${in30.filter((e) => e.region).length}, 청년 ${in30.filter((e) => e.youth).length})`,
  );

  // 5. 분포
  printTable('서비스분야', countBy(list, '서비스분야'), total);
  printTable('소관기관유형', countBy(list, '소관기관유형'), total);

  // 파서 개선용 샘플을 파일로 남긴다
  const samples = {};
  for (const e of enriched) {
    const k = e.period.kind;
    samples[k] ??= [];
    if (samples[k].length < 15) samples[k].push({ id: e.row.서비스ID, 신청기한: e.row.신청기한, end: e.period.end });
  }
  const report = {
    generated_at: new Date().toISOString(),
    today,
    total,
    fill,
    period_kinds: kindCounts,
    period_mixed: mixed,
    window: { from: windowFrom, to: windowTo, count: inWindow.length },
    window_items: inWindow
      .sort((a, b) => a.period.end.localeCompare(b.period.end))
      .map((e) => ({
        id: e.row.서비스ID,
        name: e.row.서비스명,
        org: e.row.소관기관명,
        end: e.period.end,
        youth: e.youth,
        region: e.region,
        신청기한: e.row.신청기한,
      })),
    period_samples: samples,
  };
  const outFile = join(appRoot, 'output', `gov24-survey-${today}.json`);
  await writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(`\n✔ 상세 결과: ${outFile}`);
}

main().catch((err) => {
  console.error(`\n✘ 조사 실패: ${err.message}`);
  process.exit(1);
});
