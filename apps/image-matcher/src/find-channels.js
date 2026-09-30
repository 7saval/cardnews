// 카드뉴스 JSON의 장소별로 "사진 사용 허락을 요청할 곳"(가게 인스타/홈페이지) 후보를 찾는 CLI.
// 설계: _docs/channel-finder-plan.md
//
// 사진은 가져오지 않는다. 출력은 연락처 후보 + 근거, 못 찾은 곳은 사람이 확인할 링크.
//
// 소스별 역할 (2026-09-30 강남 야장 8곳 조사 결과 기반):
//   - 네이버 지역검색 link (주소 대조로 같은 가게 확인) → 주 소스
//   - 그 link가 가게 홈페이지면 robots.txt 확인 후 메인 1장에서 인스타 링크 → 주 소스
//   - 웹문서·블로그 검색 → 이미 나온 후보를 뒷받침할 때만 근거로 추가 (단독 후보는 대부분 후기 작성자라 오탐)
//
// 사용법:
//   npm run find-channels -- --data ../content-generator/output/pipeline-test.json

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidCardNewsData } from '../../../shared/schemas/validate-card-news.js';
import { naverSearch } from './lib/naver-search.js';
import { createPoliteFetcher, SkipError } from './lib/polite-fetch.js';
import {
  stripTags,
  addressKey,
  districtOf,
  classifyLink,
  extractInstagramHandles,
  extractInstagramFromHtml,
} from './lib/extract.js';

const appRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const HANDLE = 'matsoozip';

function parseArgs(argv) {
  const args = { data: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--data') args.data = argv[++i];
  }
  return args;
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`${missing.join(', ')}가 없습니다. apps/image-matcher/.env를 확인하세요 (.env.example 참고).`);
  }
}

function manualLinks(name, address) {
  const gu = districtOf(address);
  return {
    naver_map: `https://map.naver.com/p/search/${encodeURIComponent(`${name} ${address ?? ''}`.trim())}`,
    naver_search: `https://search.naver.com/search.naver?query=${encodeURIComponent(`${name} ${gu} 인스타그램`)}`,
  };
}

/** 후보 목록에 근거를 누적. 같은 type+value면 sources만 추가. */
function addCandidate(candidates, type, value, source) {
  let c = candidates.find((x) => x.type === type && x.value === value);
  if (!c) {
    c = { type, value, sources: [] };
    candidates.push(c);
  }
  if (!c.sources.some((s) => s.via === source.via && s.url === source.url)) c.sources.push(source);
}

// 신뢰도: 인스타는 지역검색/홈페이지에서 직접 나왔거나 소스 2개 이상이면 높음. 홈페이지 자체는 중간.
function confidenceOf(c) {
  if (c.type === 'homepage') return 'medium';
  const vias = new Set(c.sources.map((s) => s.via));
  if (vias.has('local.link') || vias.has('homepage') || vias.size >= 2) return 'high';
  return 'medium';
}

async function findForPlace(card, fetcher) {
  const name = card.place_name;
  const gu = districtOf(card.address);
  const cardKey = addressKey(card.address);
  const result = {
    place_name: name,
    address: card.address ?? null,
    address_verified: false,
    candidates: [],
    skipped: [],
    manual_links: manualLinks(name, card.address),
  };

  // 1. 지역검색 → 주소가 같은 항목의 link
  const local = await naverSearch('local', `${name} ${gu}`.trim(), 5);
  const match = cardKey ? local.find((it) => addressKey(it.roadAddress) === cardKey) : null;
  if (match) {
    result.address_verified = true;
    const link = classifyLink(match.link);
    if (link.type === 'instagram') {
      addCandidate(result.candidates, 'instagram', link.value, { via: 'local.link', url: match.link });
    } else if (link.type === 'homepage') {
      addCandidate(result.candidates, 'homepage', link.value, { via: 'local.link', url: match.link });
    } else if (link.type === 'platform') {
      result.skipped.push({ url: match.link, reason: '플랫폼 URL(가게 자체 채널 아님)' });
    }
  } else {
    result.skipped.push({ url: null, reason: `지역검색 결과 ${local.length}건 중 주소 일치 항목 없음` });
  }

  // 2. 홈페이지 → robots.txt 허용 시 메인 1장에서 인스타 링크
  for (const home of result.candidates.filter((c) => c.type === 'homepage')) {
    try {
      const { url, html } = await fetcher.getHtml(home.value);
      const handles = extractInstagramFromHtml(html);
      for (const h of handles) addCandidate(result.candidates, 'instagram', h, { via: 'homepage', url });
      if (!handles.length) result.skipped.push({ url, reason: '홈페이지에 인스타 링크 없음' });
    } catch (err) {
      if (!(err instanceof SkipError)) throw err;
      result.skipped.push({ url: home.value, reason: err.message });
    }
  }

  // 3. 웹문서·블로그 → 이미 있는 인스타 후보의 근거로만
  const known = new Set(result.candidates.filter((c) => c.type === 'instagram').map((c) => c.value));
  if (known.size) {
    const query = `"${name}" ${gu} 인스타그램`.trim();
    const nameKey = name.replace(/\s+/g, '');
    for (const endpoint of ['webkr', 'blog']) {
      const items = await naverSearch(endpoint, query, 30);
      for (const it of items) {
        const text = stripTags(`${it.link} ${it.title} ${it.description}`);
        if (!text.replace(/\s+/g, '').includes(nameKey)) continue; // 장소명이 없는 결과는 노이즈
        for (const h of extractInstagramHandles(text)) {
          if (known.has(h)) addCandidate(result.candidates, 'instagram', h, { via: endpoint, url: it.link });
        }
      }
    }
  }

  for (const c of result.candidates) c.confidence = confidenceOf(c);
  // 인스타 먼저, 그다음 근거 많은 순
  result.candidates.sort(
    (a, b) => (a.type === 'instagram' ? 0 : 1) - (b.type === 'instagram' ? 0 : 1) || b.sources.length - a.sources.length,
  );
  return result;
}

const VIA_LABEL = { 'local.link': '지역검색', homepage: '홈페이지', webkr: '웹문서', blog: '블로그' };

function toMarkdown(title, places) {
  const lines = [`# 사진 사용 허락 요청 대상 — ${title}`, ''];
  const found = places.filter((p) => p.candidates.length).length;
  lines.push(`장소 ${places.length}곳 중 ${found}곳 자동으로 찾음. 후보는 **확정이 아니다** — 들어가서 맞는 가게인지 확인 후 DM.`, '');

  for (const p of places) {
    lines.push(`## ${p.place_name}${p.address ? ` (${p.address})` : ''}`);
    for (const c of p.candidates) {
      const vias = [...new Set(c.sources.map((s) => VIA_LABEL[s.via] ?? s.via))].join(', ');
      const conf = c.confidence === 'high' ? '높음' : '중간';
      if (c.type === 'instagram') {
        lines.push(`- [ ] 인스타 [@${c.value}](https://www.instagram.com/${c.value}/) — ${conf} (${vias})`);
      } else {
        lines.push(`- [ ] 홈페이지 ${c.value} — ${conf} (${vias})`);
      }
    }
    if (!p.candidates.length) lines.push('- 자동으로 찾지 못함');
    lines.push(`- 직접 확인: [네이버 지도](${p.manual_links.naver_map}) · [네이버 검색](${p.manual_links.naver_search})`);
    for (const s of p.skipped) lines.push(`  - 참고: ${s.reason}${s.url ? ` — ${s.url}` : ''}`);
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '## DM 템플릿',
    '',
    `> 안녕하세요, 맛집 카드뉴스 계정 @${HANDLE} 입니다. 이번에 <주제> 카드뉴스에 <가게명>을 소개하고 싶은데,`,
    '> 계정에 올려주신 사진 1장을 사용해도 될까요? 카드에 @<가게계정> 출처를 표기하고 게시 후 링크도 공유드리겠습니다.',
    '',
    '허락받으면: `npm run match -- --data <카드 JSON> --init` → `images/places/<가게>/`에 사진 + `credit.txt`에 출처 → `npm run match -- --data <카드 JSON>`',
    '',
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.data) throw new Error('--data <카드뉴스 JSON 경로>가 필요합니다.');
  requireEnv(['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET']);

  const dataPath = resolve(process.cwd(), args.data);
  const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
  assertValidCardNewsData(data, dataPath);

  const fetcher = createPoliteFetcher();
  const places = [];
  for (const card of data.cards) {
    console.log(`조회 중: ${card.place_name}...`);
    const place = await findForPlace(card, fetcher);
    places.push(place);
    const summary = place.candidates.length
      ? place.candidates.map((c) => (c.type === 'instagram' ? `@${c.value}` : c.value)).join(', ')
      : '없음 (수동 확인 링크 제공)';
    console.log(`  → ${summary}`);
  }

  const name = basename(dataPath).replace(/\.json$/, '');
  const outDir = join(appRoot, 'output');
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `${name}-channels.json`);
  const mdPath = join(outDir, `${name}-channels.md`);
  writeFileSync(jsonPath, JSON.stringify({ source: dataPath, places, requests: fetcher.requestLog }, null, 2), 'utf-8');
  writeFileSync(mdPath, toMarkdown(data.series_title ?? name, places), 'utf-8');

  const found = places.filter((p) => p.candidates.length).length;
  console.log(`\n✔ 장소 ${places.length}곳 중 ${found}곳 후보 찾음`);
  console.log(`  크롤링 요청 ${fetcher.requestLog.length}건: ${fetcher.requestLog.join(', ') || '없음'}`);
  console.log(`  체크리스트: ${mdPath}`);
  console.log(`  상세(JSON): ${jsonPath}`);
}

main().catch((err) => {
  console.error(`\n✘ 채널 찾기 실패: ${err.message}`);
  process.exit(1);
});
