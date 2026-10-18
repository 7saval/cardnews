// 공공데이터포털 "행정안전부_대한민국 공공서비스(혜택) 정보" (보조금24) API 클라이언트.
// https://www.data.go.kr/data/15113968/openapi.do
//
// 오퍼레이션:
//   serviceList       — 서비스 목록 (서비스명, 지원내용, 신청기한, 소관기관 등)
//   serviceDetail     — 서비스 상세 (구비서류, 온라인신청사이트URL 등)
//   supportConditions — 지원조건 코드 (JA0110/JA0111 = 대상 나이 하한/상한 등)

const BASE_URL = 'https://api.odcloud.kr/api/gov24/v3';

/**
 * .env의 키를 serviceKey 파라미터로 쓸 수 있는 형태로 돌려준다.
 * 포털에서 Encoding 키를 복사해 넣으면 URLSearchParams가 한 번 더 인코딩해서
 * "등록되지 않은 인증키"(401)가 나므로, `%`가 있으면 디코딩해서 쓴다.
 */
export function getServiceKey() {
  const raw = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!raw) {
    throw new Error(
      'DATA_GO_KR_SERVICE_KEY가 없습니다. apps/benefit-collector/.env를 확인하세요 (.env.example 참고).',
    );
  }
  return raw.includes('%') ? decodeURIComponent(raw) : raw;
}

export async function fetchPage(operation, { page = 1, perPage = 100 } = {}) {
  const url = new URL(`${BASE_URL}/${operation}`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(perPage));
  url.searchParams.set('serviceKey', getServiceKey());

  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    throw new Error(`gov24 ${operation} 호출 실패 (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

/** 전체 페이지를 순서대로 받아 data 배열을 합쳐 돌려준다. */
export async function fetchAll(operation, { perPage = 1000, onPage } = {}) {
  const rows = [];
  let page = 1;
  let total = Infinity;
  while (rows.length < total) {
    const body = await fetchPage(operation, { page, perPage });
    total = body.totalCount;
    rows.push(...body.data);
    onPage?.({ page, fetched: rows.length, total });
    if (body.data.length === 0) break;
    page += 1;
  }
  return rows;
}
