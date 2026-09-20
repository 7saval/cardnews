// 카카오 로컬 API 키가 정상 동작하는지 확인하는 스모크 테스트.
//
// 사용법:
//   npm run test:kakao -- --query "강남 야장"

import 'dotenv/config';

function parseArgs(argv) {
  const args = { query: '강남 야장' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--query') args.query = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.KAKAO_REST_API_KEY) {
    throw new Error(
      'KAKAO_REST_API_KEY가 없습니다. apps/research-collector/.env를 확인하세요 (.env.example 참고).',
    );
  }

  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.searchParams.set('query', args.query);

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`카카오 로컬 API 호출 실패 (${res.status}): ${JSON.stringify(body)}`);
  }

  console.log(`✔ "${args.query}" 검색 결과 ${body.documents.length}건`);
  for (const doc of body.documents.slice(0, 5)) {
    console.log(`  - ${doc.place_name} | ${doc.category_name} | ${doc.road_address_name || doc.address_name}`);
  }
}

main().catch((err) => {
  console.error(`\n✘ 테스트 실패: ${err.message}`);
  process.exit(1);
});
