// NAVER API HUB 검색어 트렌드 API 키가 정상 동작하는지 확인하는 스모크 테스트.
// 엔드포인트/헤더는 https://api.ncloud-docs.com/docs/naver-api-hub-search-trend-examples 기준.
//
// 사용법:
//   npm run test:naver-trend

import 'dotenv/config';

async function main() {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    throw new Error(
      'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 없습니다. apps/research-collector/.env를 확인하세요 (.env.example 참고).',
    );
  }

  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(today.getMonth() - 3);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const requestBody = {
    startDate: fmt(threeMonthsAgo),
    endDate: fmt(today),
    timeUnit: 'week',
    keywordGroups: [
      { groupName: '야장', keywords: ['야장', '루프탑'] },
      { groupName: '오마카세', keywords: ['오마카세'] },
    ],
    device: '',
    ages: [],
    gender: '',
  };

  const res = await fetch('https://naverapihub.apigw.ntruss.com/search-trend/v1/search', {
    method: 'POST',
    headers: {
      'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
      'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`네이버 검색어 트렌드 API 호출 실패 (${res.status}): ${JSON.stringify(body)}`);
  }

  console.log(`✔ 검색어 트렌드 조회 성공 (${requestBody.startDate} ~ ${requestBody.endDate}, ${requestBody.timeUnit} 단위)`);
  for (const result of body.results) {
    const points = result.data;
    const latest = points[points.length - 1];
    console.log(`  - ${result.title} (${result.keywords.join(', ')}): 최근 구간 지수 ${latest?.ratio}`);
  }
}

main().catch((err) => {
  console.error(`\n✘ 테스트 실패: ${err.message}`);
  process.exit(1);
});
