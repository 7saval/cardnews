import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, rulesFor, isAllowed } from '../src/lib/robots.js';

const TOKEN = 'cardnews-channel-finder';
const allowed = (text, path) => isAllowed(rulesFor(parseRobots(text), TOKEN), path);

test('카카오맵 실제 robots.txt: 루트만 허용', () => {
  const kakao = `User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /\nAllow: /$\n`;
  assert.equal(allowed(kakao, '/'), true);
  assert.equal(allowed(kakao, '/12345'), false);
  assert.equal(allowed(kakao, '/?q=1'), false);
});

test('robots.txt가 비어 있거나 규칙이 없으면 전부 허용', () => {
  assert.equal(allowed('', '/anything'), true);
  assert.equal(allowed('User-agent: *\nDisallow:\n', '/anything'), true);
});

test('우리 UA 그룹이 있으면 * 그룹 대신 그것만 적용', () => {
  const text = `User-agent: *\nDisallow: /\n\nUser-agent: cardnews-channel-finder\nDisallow: /private\n`;
  assert.equal(allowed(text, '/'), true);
  assert.equal(allowed(text, '/private/x'), false);
});

test('UA 이름은 대소문자 무시', () => {
  assert.equal(allowed('User-agent: CardNews-Channel-Finder\nDisallow: /\n', '/'), false);
});

test('연속된 user-agent 줄은 한 그룹', () => {
  const text = `User-agent: googlebot\nUser-agent: cardnews-channel-finder\nDisallow: /a\n`;
  assert.equal(allowed(text, '/a'), false);
  assert.equal(allowed(text, '/b'), true);
});

test('같은 agent의 그룹이 여러 개면 합침', () => {
  const text = `User-agent: *\nDisallow: /a\n\nUser-agent: *\nDisallow: /b\n`;
  assert.equal(allowed(text, '/a'), false);
  assert.equal(allowed(text, '/b'), false);
  assert.equal(allowed(text, '/c'), true);
});

test('가장 긴 매칭이 이김', () => {
  const text = `User-agent: *\nDisallow: /shop\nAllow: /shop/about\n`;
  assert.equal(allowed(text, '/shop/cart'), false);
  assert.equal(allowed(text, '/shop/about'), true);
});

test('길이가 같으면 allow가 이김', () => {
  const text = `User-agent: *\nDisallow: /page\nAllow: /page\n`;
  assert.equal(allowed(text, '/page'), true);
});

test('* 와일드카드와 $ 끝 고정', () => {
  const text = `User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*/cache\n`;
  assert.equal(allowed(text, '/menu.pdf'), false);
  assert.equal(allowed(text, '/menu.pdf?v=1'), true);
  assert.equal(allowed(text, '/tmp123/cache/x'), false);
  assert.equal(allowed(text, '/index.html'), true);
});

test('정규식 특수문자는 문자 그대로', () => {
  const text = `User-agent: *\nDisallow: /a.b\n`;
  assert.equal(allowed(text, '/a.b'), false);
  assert.equal(allowed(text, '/axb'), true);
});

test('주석, 대소문자 키, 모르는 키는 무시', () => {
  const text = `# comment\nUSER-AGENT: * # all\nDISALLOW: /x # no\nSitemap: https://e.com/s.xml\nCrawl-delay: 5\n`;
  assert.equal(allowed(text, '/x'), false);
  assert.equal(allowed(text, '/y'), true);
});

test('/robots.txt 자체는 항상 허용', () => {
  assert.equal(allowed('User-agent: *\nDisallow: /\n', '/robots.txt'), true);
});
