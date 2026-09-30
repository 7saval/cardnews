// robots.txt 파서 (RFC 9309). 학습 목적으로 직접 구현 — 동작은 test/robots.test.js로 검증.
//
// 핵심 규칙:
//   - user-agent 줄이 연속되면 한 그룹. 뒤따르는 allow/disallow는 그 그룹의 모든 agent에 적용
//   - 우리 product token과 일치하는 그룹이 있으면 그것만, 없으면 "*" 그룹을 쓴다 (같은 agent 그룹이 여러 개면 합침)
//   - 경로 매칭은 가장 긴 패턴이 이긴다. 길이가 같으면 allow가 이긴다
//   - 패턴의 "*"는 임의 문자열, 끝의 "$"는 경로 끝
//   - 빈 disallow는 규칙이 없는 것과 같다
//   - /robots.txt 자체는 항상 허용

export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      if (!lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (!current) continue; // user-agent 없이 나온 규칙은 무시
      if (value === '') continue; // 빈 disallow/allow = 규칙 없음
      current.rules.push({ allow: key === 'allow', pattern: value });
    } else {
      // sitemap 등 다른 키는 그룹을 끊지 않되 agent 연속도 아님
      lastWasAgent = false;
    }
  }
  return groups;
}

/** product token 기준으로 적용할 규칙 목록. 일치 그룹이 없으면 "*", 그것도 없으면 빈 목록(전부 허용). */
export function rulesFor(groups, productToken) {
  const token = productToken.toLowerCase();
  const own = groups.filter((g) => g.agents.includes(token));
  if (own.length) return own.flatMap((g) => g.rules);
  return groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
}

function patternToRegex(pattern) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

/** path(쿼리 포함 가능)가 허용되는지. */
export function isAllowed(rules, path) {
  if (path === '/robots.txt') return true;
  let best = null;
  for (const rule of rules) {
    if (!patternToRegex(rule.pattern).test(path)) continue;
    const len = rule.pattern.length;
    if (!best || len > best.len || (len === best.len && rule.allow && !best.allow)) {
      best = { len, allow: rule.allow };
    }
  }
  return best ? best.allow : true;
}
