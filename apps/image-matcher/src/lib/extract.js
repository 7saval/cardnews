// 검색 결과·HTML에서 가게 채널 단서를 뽑는 순수 함수 모음 (네트워크 없음 → 단위 테스트 대상).

/** 검색 API 결과의 <b> 태그와 흔한 HTML 엔티티 제거. */
export function stripTags(text = '') {
  return text
    .replace(/<\/?b>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * 도로명 주소의 비교용 키: "서울특별시 강남구 압구정로 214 현대종합상가빌딩 1층" → "강남구 압구정로 214".
 * 시/도 표기 차이와 건물명·층수를 흡수한다. 도로명 주소가 아니면 null.
 */
export function addressKey(address) {
  if (typeof address !== 'string') return null;
  const m = address.match(/([가-힣]+구)\s+([가-힣0-9]+(?:로|길))\s*(\d+(?:-\d+)?)/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : null;
}

/** 주소에서 "강남구" 같은 구 이름. 검색 쿼리에 붙여 동명 가게를 줄이는 용도. */
export function districtOf(address) {
  if (typeof address !== 'string') return '';
  return address.match(/[가-힣]+구/)?.[0] ?? '';
}

// 계정이 아닌 인스타그램 경로
const IG_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct', 'about', 'developer', 'legal']);
const IG_HANDLE = /^[a-z0-9._]{1,30}$/;

export function normalizeHandle(raw) {
  const handle = raw.toLowerCase().replace(/\.+$/, '');
  if (!IG_HANDLE.test(handle) || IG_RESERVED.has(handle)) return null;
  return handle;
}

/** URL이 인스타 계정 페이지면 계정명, 아니면 null. */
export function instagramHandleFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
  const first = parsed.pathname.split('/').filter(Boolean)[0];
  return first ? normalizeHandle(first) : null;
}

/**
 * 텍스트에서 인스타 계정 후보 추출: instagram.com/<계정> 링크 + "@계정" 멘션.
 * "@"는 앞이 공백/문장 시작/괄호·콜론일 때만 인정해서 이메일 주소(abc@gmail.com)를 거른다.
 */
export function extractInstagramHandles(text = '') {
  const found = new Set();
  for (const m of text.matchAll(/instagram\.com\/([A-Za-z0-9._]{1,30})/gi)) {
    const h = normalizeHandle(m[1]);
    if (h) found.add(h);
  }
  for (const m of text.matchAll(/(?:^|[\s(\[:：])@([A-Za-z0-9._]{2,30})/g)) {
    const h = normalizeHandle(m[1]);
    if (h) found.add(h);
  }
  return [...found];
}

/** HTML의 <a href="...">에서 인스타 계정 링크만 추출. */
export function extractInstagramFromHtml(html = '') {
  const found = new Set();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const h = instagramHandleFromUrl(m[1].trim());
    if (h) found.add(h);
  }
  return [...found];
}

// 가게 자체 홈페이지가 아닌 플랫폼·집계 사이트 (접미사 매칭)
const PLATFORM_DOMAINS = [
  'naver.com', 'naver.me', 'kakao.com', 'daum.net', 'instagram.com', 'facebook.com', 'youtube.com',
  'siksinhot.com', 'polle.com', 'visitseoul.net', 'diningcode.com', 'mangoplate.com', 'tistory.com',
];

export function isPlatformHost(hostname) {
  const host = hostname.toLowerCase();
  return PLATFORM_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * 지역검색 link 분류.
 * @returns {{ type: 'instagram', value: string } | { type: 'homepage', value: string } | { type: 'platform' | 'empty' | 'invalid' }}
 */
export function classifyLink(link) {
  if (!link) return { type: 'empty' };
  const handle = instagramHandleFromUrl(link);
  if (handle) return { type: 'instagram', value: handle };
  let parsed;
  try {
    parsed = new URL(link);
  } catch {
    return { type: 'invalid' };
  }
  if (!/^https?:$/.test(parsed.protocol)) return { type: 'invalid' };
  if (isPlatformHost(parsed.hostname)) return { type: 'platform' };
  return { type: 'homepage', value: parsed.href };
}
