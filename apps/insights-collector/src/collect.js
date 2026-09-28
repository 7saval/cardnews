// 인스타그램 비즈니스 계정의 "하루치" 성과를 조회해서 Supabase daily_insights 테이블에 upsert하는
// 일일 배치 스크립트. GitHub Actions 크론(.github/workflows/insights-daily.yml)에서 1일 1회 실행.
//
// 절차:
//   1. 집계 대상 날짜(기본: KST 기준 어제)의 [00:00, 24:00) 구간을 unix timestamp로 계산
//   2. 계정 필드 조회 → followers_count (시점 스냅샷이라 실행 시각 기준 값)
//   3. 일별 인사이트 메트릭 조회 (reach, accounts_engaged, total_interactions) — since/until로 구간 고정
//   4. 해당 날짜에 올라간 게시물 수 집계 (/media의 timestamp 기준)
//   5. daily_insights에 date(PK) 기준 upsert — 같은 날짜로 재실행해도 중복 없이 덮어씀
//
// 사용법:
//   npm run collect                        # KST 기준 어제 날짜
//   npm run collect -- --date 2026-09-27   # 특정 날짜 재수집 (인사이트 메트릭만 해당 날짜 기준,
//                                          #  followers_count는 항상 "지금" 값이라는 점 주의)
//   npm run collect -- --dry-run           # DB에 쓰지 않고 조회 결과만 출력

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const API_VERSION = 'v26.0';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function parseArgs(argv) {
  const args = { date: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--date') args.date = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`${missing.join(', ')}가 없습니다. apps/insights-collector/.env를 확인하세요 (.env.example 참고).`);
  }
}

// KST 날짜 문자열(YYYY-MM-DD) → 그 날짜의 KST 00:00 ~ 다음날 00:00 구간 (unix seconds)
function kstDayRange(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`--date 형식이 잘못됐습니다: "${dateStr}" (YYYY-MM-DD)`);
  }
  const startMs = Date.parse(`${dateStr}T00:00:00+09:00`);
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return { since: startMs / 1000, until: endMs / 1000 };
}

function kstYesterday() {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  nowKst.setUTCDate(nowKst.getUTCDate() - 1);
  return nowKst.toISOString().slice(0, 10);
}

async function callGraphApi(path, params) {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN);

  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Graph API 호출 실패 (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function fetchDailyMetrics(igId, { since, until }) {
  const insights = await callGraphApi(`${igId}/insights`, {
    metric: 'reach,accounts_engaged,total_interactions',
    period: 'day',
    metric_type: 'total_value',
    since,
    until,
  });
  const byName = Object.fromEntries(insights.data.map((item) => [item.name, item.total_value?.value ?? 0]));
  return {
    reach: byName.reach ?? 0,
    accounts_engaged: byName.accounts_engaged ?? 0,
    total_interactions: byName.total_interactions ?? 0,
  };
}

// /media는 최신순 정렬이라, 구간 시작보다 오래된 게시물이 나오면 더 볼 필요 없음
async function countPostsInRange(igId, { since, until }) {
  let count = 0;
  let after = null;
  for (let page = 0; page < 10; page += 1) {
    const params = { fields: 'timestamp', limit: 50 };
    if (after) params.after = after;
    const body = await callGraphApi(`${igId}/media`, params);

    for (const media of body.data) {
      const ts = Date.parse(media.timestamp) / 1000;
      if (ts < since) return count;
      if (ts < until) count += 1;
    }
    after = body.paging?.cursors?.after;
    if (!body.paging?.next || !after) break;
  }
  return count;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireEnv(['META_ACCESS_TOKEN', 'IG_BUSINESS_ACCOUNT_ID']);
  if (!args.dryRun) requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);

  const igId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const date = args.date ?? kstYesterday();
  const range = kstDayRange(date);

  console.log(`집계 대상: ${date} (KST)`);

  console.log('1. 계정 필드(팔로워 수 스냅샷) 조회 중...');
  const profile = await callGraphApi(igId, { fields: 'username,followers_count' });

  console.log('2. 일별 인사이트 메트릭 조회 중...');
  const metrics = await fetchDailyMetrics(igId, range);

  console.log('3. 해당 날짜 게시물 수 집계 중...');
  const postsCount = await countPostsInRange(igId, range);

  const row = {
    date,
    followers_count: profile.followers_count,
    ...metrics,
    posts_count_today: postsCount,
    // Phase 4(발행 자동화) 전까지는 전부 수동 발행이라 false 고정
    is_automated: false,
    collected_at: new Date().toISOString(),
  };

  console.log(`\n@${profile.username}`, row);

  if (args.dryRun) {
    console.log('\n(--dry-run: DB에 쓰지 않음)');
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from('daily_insights').upsert(row, { onConflict: 'date' });
  if (error) {
    throw new Error(`Supabase upsert 실패: ${error.message}`);
  }

  console.log(`\n✔ daily_insights 적재 완료 (${date})`);
}

main().catch((err) => {
  console.error(`\n✘ 인사이트 수집 실패: ${err.message}`);
  process.exit(1);
});
