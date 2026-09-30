// 가게 홈페이지 크롤링용 fetch. "허용된 곳에, 천천히, 신분을 밝히고"를 코드로 강제한다.
//   - 차단 도메인(네이버·카카오·인스타그램 등)은 요청 자체를 거부
//   - robots.txt 확인 (호스트별 캐시), 우리 UA 그룹 → 없으면 "*"
//   - 같은 호스트 요청 간격 1초 이상, 타임아웃 10초, 응답 2MB 제한
//   - 리다이렉트는 수동으로 최대 3회, 다음 주소마다 차단 도메인·robots.txt 재확인
//   - 실제로 보낸 모든 요청 URL을 requestLog에 기록

import { parseRobots, rulesFor, isAllowed } from './robots.js';

export const PRODUCT_TOKEN = 'cardnews-channel-finder';
export const USER_AGENT = `${PRODUCT_TOKEN}/0.1 (+https://github.com/7saval/cardnews)`;

const BLOCKED_DOMAINS = ['naver.com', 'naver.me', 'kakao.com', 'daum.net', 'instagram.com', 'facebook.com', 'fb.com'];
const MIN_INTERVAL_MS = 1000;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export class SkipError extends Error {}

export function isBlockedHost(hostname) {
  const host = hostname.toLowerCase();
  return BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

export function createPoliteFetcher() {
  const lastRequestAt = new Map();
  const robotsCache = new Map();
  const requestLog = [];

  async function throttle(host) {
    const wait = (lastRequestAt.get(host) ?? 0) + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt.set(host, Date.now());
  }

  async function rawGet(url) {
    const { hostname } = new URL(url);
    if (isBlockedHost(hostname)) throw new SkipError(`차단 도메인이라 요청하지 않음: ${hostname}`);
    await throttle(hostname);
    requestLog.push(url);
    return fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  async function readLimited(res) {
    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new SkipError(`응답이 ${MAX_BYTES / 1024 / 1024}MB를 넘어 중단`);
      }
      chunks.push(value);
    }
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  }

  /**
   * 호스트의 robots.txt 규칙 (RFC 9309 §2.3.1).
   * 2xx → 파싱, 3xx → 최대 5회 따라감, 4xx → 전부 허용([]), 5xx/네트워크 오류/리다이렉트 초과 → 전부 불허(null).
   */
  async function robotsRulesFor(origin) {
    if (robotsCache.has(origin)) return robotsCache.get(origin);
    let rules = null;
    let url = `${origin}/robots.txt`;
    try {
      for (let hop = 0; hop <= 5; hop += 1) {
        const res = await rawGet(url);
        const location = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && location) {
          url = new URL(location, url).href;
          continue;
        }
        if (res.status >= 200 && res.status < 300) {
          rules = rulesFor(parseRobots(await readLimited(res)), PRODUCT_TOKEN);
        } else if (res.status >= 400 && res.status < 500) {
          rules = [];
        }
        break;
      }
    } catch {
      // 차단 도메인으로 리다이렉트된 경우도 포함해 확인 불가 → 불허
      rules = null;
    }
    robotsCache.set(origin, rules);
    return rules;
  }

  /** robots.txt가 허용할 때만 HTML을 가져온다. 건너뛸 이유가 있으면 SkipError. */
  async function getHtml(startUrl) {
    let url = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new SkipError(`http(s)가 아님: ${url}`);
      if (isBlockedHost(parsed.hostname)) throw new SkipError(`차단 도메인이라 요청하지 않음: ${parsed.hostname}`);

      const rules = await robotsRulesFor(parsed.origin);
      if (rules === null) throw new SkipError(`robots.txt 확인 불가(5xx/네트워크 오류) → 불허로 취급: ${parsed.origin}`);
      if (!isAllowed(rules, parsed.pathname + parsed.search)) throw new SkipError(`robots.txt가 불허: ${url}`);

      let res;
      try {
        res = await rawGet(url);
      } catch (err) {
        if (err instanceof SkipError) throw err;
        throw new SkipError(`요청 실패: ${err.name === 'TimeoutError' ? '타임아웃' : err.message}`);
      }

      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location'), url).href;
        continue;
      }
      if (!res.ok) throw new SkipError(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('text/html')) throw new SkipError(`HTML이 아님(${type || 'content-type 없음'})`);
      return { url, html: await readLimited(res) };
    }
    throw new SkipError(`리다이렉트 ${MAX_REDIRECTS}회 초과`);
  }

  return { getHtml, requestLog };
}
