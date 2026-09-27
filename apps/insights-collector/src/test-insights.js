// Instagram 비즈니스 계정 인사이트 API가 정상 동작하는지 확인하는 스모크 테스트.
//
// 사용법:
//   npm run test:insights
//
// 확인하는 것:
//   1. 계정 자체 필드(팔로워 수 등 스냅샷) — /insights 메트릭이 아니라 계정 필드로 조회해야 함
//   2. 일별 인사이트 메트릭 (reach, accounts_engaged, total_interactions)
//
// 참고: 계획서 작성 당시 가정했던 impressions/profile_views 메트릭은 현재 API에서
// 폐기/제거됨. 상세: _docs/insta-cardnews-automation-plan.md Phase 2 섹션 갱신 필요.

import 'dotenv/config';

const API_VERSION = 'v26.0';

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`${missing.join(', ')}가 없습니다. apps/insights-collector/.env를 확인하세요 (.env.example 참고).`);
  }
}

async function callGraphApi(path) {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${path}`);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Graph API 호출 실패 (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  requireEnv(['META_ACCESS_TOKEN', 'IG_BUSINESS_ACCOUNT_ID']);

  const igId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const token = process.env.META_ACCESS_TOKEN;

  console.log('1. 계정 필드(팔로워 수 스냅샷) 조회 중...');
  const profile = await callGraphApi(
    `${igId}?fields=username,followers_count,media_count&access_token=${token}`,
  );
  console.log(`✔ @${profile.username} | 팔로워 ${profile.followers_count}명 | 게시물 ${profile.media_count}개`);

  console.log('\n2. 일별 인사이트 메트릭 조회 중... (reach, accounts_engaged, total_interactions)');
  const insights = await callGraphApi(
    `${igId}/insights?metric=reach,accounts_engaged,total_interactions&period=day&metric_type=total_value&access_token=${token}`,
  );
  for (const item of insights.data) {
    const value = item.total_value?.value ?? '(값 없음)';
    console.log(`  - ${item.name}: ${value}`);
  }

  console.log('\n✔ 인사이트 API 정상 동작 확인');
}

main().catch((err) => {
  console.error(`\n✘ 테스트 실패: ${err.message}`);
  process.exit(1);
});
