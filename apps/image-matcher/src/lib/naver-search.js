// NAVER API HUB 검색 API(지역/웹문서/블로그) 호출. research-collector의 트렌드 API 호출과 같은 인증 방식.

const BASE = 'https://naverapihub.apigw.ntruss.com/search/v1';

export async function naverSearch(endpoint, query, display) {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('query', query);
  url.searchParams.set('display', String(display));

  const res = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
      'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`네이버 ${endpoint} 검색 API 호출 실패 (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.items ?? [];
}
