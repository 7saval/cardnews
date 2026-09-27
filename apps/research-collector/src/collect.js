// 카카오 로컬 API(장소 후보) + NAVER API HUB 검색어트렌드 API(랭킹)를 합쳐서
// "채택할 소재 리스트"를 뽑는 통합 파이프라인.
//
// 절차:
//   1. data/topics.json에 정의된 각 주제(topic)의 키워드로 네이버 검색어트렌드를 한 번에 조회
//   2. 트렌드 지수(최근 값)와 모멘텀(직전 평균 대비 증감)으로 주제 랭킹을 매김
//   3. 각 주제의 kakaoQuery로 카카오 로컬 API를 호출해 장소 후보를 가져옴
//   4. 랭킹 상위 --top개 주제를 "채택"하여 content-generator의 --input으로 바로 쓸 수 있는
//      텍스트 파일과, 감사/디버깅용 전체 결과 JSON을 output/에 저장
//
// 사용법:
//   npm run collect                              # data/topics.json 사용, 상위 1개 채택
//   npm run collect -- --topics data/topics.json --top 2

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

function parseArgs(argv) {
  const args = { topics: 'data/topics.json', top: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--topics') args.topics = argv[++i];
    else if (argv[i] === '--top') args.top = Number(argv[++i]);
  }
  return args;
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`${missing.join(', ')}가 없습니다. apps/research-collector/.env를 확인하세요 (.env.example 참고).`);
  }
}

async function fetchTrends(topics) {
  requireEnv(['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET']);

  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(today.getMonth() - 3);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const requestBody = {
    startDate: fmt(threeMonthsAgo),
    endDate: fmt(today),
    timeUnit: 'week',
    keywordGroups: topics.map((t) => ({ groupName: t.name, keywords: t.naverKeywords })),
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

  const byTitle = new Map(body.results.map((r) => [r.title, r.data]));
  return byTitle;
}

function computeTrend(points) {
  if (!points || points.length === 0) {
    return { latestRatio: null, momentum: null, label: '데이터없음' };
  }
  const latest = points[points.length - 1].ratio;
  const prior = points.slice(0, -1);
  const priorAvg = prior.length ? prior.reduce((s, p) => s + p.ratio, 0) / prior.length : latest;
  const momentum = Math.round((latest - priorAvg) * 10) / 10;
  const label = momentum > 5 ? '상승' : momentum < -5 ? '하락' : '보합';
  return { latestRatio: latest, momentum, label };
}

async function fetchKakaoPlaces(query, size = 8) {
  requireEnv(['KAKAO_REST_API_KEY']);

  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.searchParams.set('query', query);
  url.searchParams.set('size', String(size));

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`카카오 로컬 API 호출 실패 (${res.status}): ${JSON.stringify(body)}`);
  }

  return body.documents.map((doc) => ({
    place_name: doc.place_name,
    category_name: doc.category_name,
    address: doc.road_address_name || doc.address_name,
    place_url: doc.place_url,
  }));
}

function toAdoptedText(topic) {
  const { name, trend, places } = topic;
  const momentumText = trend.momentum === null
    ? ''
    : ` (직전 대비 ${trend.momentum >= 0 ? '+' : ''}${trend.momentum}, ${trend.label})`;

  const lines = [
    `[리서치 자동 수집 소재 - research-collector 산출물]`,
    `주제: ${name}`,
    `트렌드: 최근 검색 지수 ${trend.latestRatio ?? '알 수 없음'}${momentumText}`,
    ``,
    `후보 장소:`,
  ];

  places.forEach((p, i) => {
    lines.push(``, `${i + 1}. ${p.place_name}`, `- 카테고리: ${p.category_name}`, `- 주소: ${p.address}`);
    if (p.place_url) lines.push(`- 참고 링크: ${p.place_url}`);
  });

  return lines.join('\n') + '\n';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const topicsPath = resolve(process.cwd(), args.topics);
  const topicDefs = JSON.parse(readFileSync(topicsPath, 'utf-8'));

  console.log(`주제 ${topicDefs.length}개 로드: ${topicDefs.map((t) => t.name).join(', ')}`);

  console.log('네이버 검색어트렌드 조회 중...');
  const trendsByTitle = await fetchTrends(topicDefs);

  const topics = [];
  for (const def of topicDefs) {
    console.log(`카카오 로컬 API 조회 중: "${def.kakaoQuery}"...`);
    const places = await fetchKakaoPlaces(def.kakaoQuery);
    const trend = computeTrend(trendsByTitle.get(def.name));
    topics.push({ name: def.name, kakaoQuery: def.kakaoQuery, trend, places });
  }

  topics.sort((a, b) => {
    const am = a.trend.momentum ?? -Infinity;
    const bm = b.trend.momentum ?? -Infinity;
    if (bm !== am) return bm - am;
    return (b.trend.latestRatio ?? -Infinity) - (a.trend.latestRatio ?? -Infinity);
  });

  console.log('\n=== 주제 랭킹 (모멘텀 순) ===');
  topics.forEach((t, i) => {
    const m = t.trend.momentum === null ? '-' : `${t.trend.momentum >= 0 ? '+' : ''}${t.trend.momentum}`;
    console.log(`${i + 1}. ${t.name} | 최근지수 ${t.trend.latestRatio ?? '-'} | 모멘텀 ${m} (${t.trend.label}) | 장소 ${t.places.length}건`);
  });

  const adopted = topics.slice(0, args.top);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = resolve(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });

  const candidatesPath = resolve(outDir, `${timestamp}-candidates.json`);
  writeFileSync(candidatesPath, JSON.stringify({ topics }, null, 2), 'utf-8');

  const adoptedPaths = [];
  adopted.forEach((topic, i) => {
    const safeName = topic.name.replace(/[^\w가-힣]+/g, '-');
    const path = resolve(outDir, `${timestamp}-adopted-${i + 1}-${safeName}.txt`);
    writeFileSync(path, toAdoptedText(topic), 'utf-8');
    adoptedPaths.push(path);
  });

  console.log(`\n✔ 전체 결과: ${candidatesPath}`);
  console.log(`✔ 채택된 소재(${adopted.length}개) → content-generator --input으로 바로 사용 가능:`);
  adoptedPaths.forEach((p) => console.log(`  - ${p}`));
}

main().catch((err) => {
  console.error(`\n✘ 통합 파이프라인 실패: ${err.message}`);
  process.exit(1);
});
