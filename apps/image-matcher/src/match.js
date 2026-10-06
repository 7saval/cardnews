// 카드뉴스 JSON의 장소별로, 사람이 허락받아 넣어둔 사진을 찾아 image_url / image_credit을 채우는 CLI.
//
// 원칙: 남의 사진을 자동으로 가져오지 않는다. 가게 공식 채널에서 허락받은 사진이나
// 직접 찍은 사진만 사람이 폴더에 넣고, 이 스크립트는 그걸 카드에 연결만 한다.
// credit.txt(출처 표기)가 비어 있으면 사진이 있어도 쓰지 않는다 — 출처 표기 누락 방지.
//
// 폴더 구조:
//   images/places/<가게>/         가게 단위 — 허락은 가게별로 받으므로 여러 주제에서 재사용
//     ├── *.jpg|png|webp          파일명 순 첫 장을 배경으로 사용
//     ├── credit.txt              첫 줄이 출처 (예: @shinmi_official, 직접 촬영이면 내 계정)
//     └── place.json              --init이 기록하는 가게 이름·주소. 동명 다른 가게와 구분하는 데 씀
//   images/topics/<주제>/_cover/  주제별 커버 (<주제> = 카드 JSON의 series_title). 없으면 첫 매칭 가게 사진
//   images/_cta/                  핫수집 공통 CTA 배경 (주제와 무관). 자체 제작이면 credit.txt를 비워도 사용(출처 표기 숨김)
//
// 사용법:
//   npm run match -- --data ../content-generator/output/pipeline-test.json --init   # 빈 폴더 준비
//   npm run match -- --data ../content-generator/output/pipeline-test.json          # 매칭 → JSON 갱신
//
// image_url은 card-renderer 개발 서버의 /__images/<images 기준 경로> 로 채운다 (vite.config.ts 참고).

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidCardNewsData } from '../../../shared/schemas/validate-card-news.js';
import { toFolderName, pickPlaceFolder, folderForInit } from './lib/place-folders.js';

const appRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function parseArgs(argv) {
  const args = { data: null, images: join(appRoot, 'images'), init: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--data') args.data = argv[++i];
    else if (argv[i] === '--images') args.images = resolve(process.cwd(), argv[++i]);
    else if (argv[i] === '--init') args.init = true;
  }
  return args;
}

function readTextFirstLine(path) {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf-8').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

/** places/ 아래 폴더와 각 place.json의 주소. */
function listPlaceFolders(placesDir) {
  if (!existsSync(placesDir)) return [];
  return readdirSync(placesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, address: readJson(join(placesDir, d.name, 'place.json'))?.address ?? null }));
}

/**
 * 사진 + 출처가 모두 있어야 사용. relPath는 images 기준 경로 조각 배열.
 * creditOptional: 핫수집 자체 제작 이미지처럼 표기할 출처가 없는 경우 — 출처 없이 사용, 있으면 표기.
 */
function lookup(imagesDir, relPath, { creditOptional = false } = {}) {
  const dir = join(imagesDir, ...relPath);
  if (!existsSync(dir)) return { reason: '폴더 없음' };
  const image = readdirSync(dir).filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase())).sort()[0];
  if (!image) return { reason: '사진 없음' };
  const credit = readTextFirstLine(join(dir, 'credit.txt'));
  if (!credit && !creditOptional) return { reason: 'credit.txt 비어 있음 → 사용 안 함' };
  const url = `/__images/${[...relPath, image].map(encodeURIComponent).join('/')}`;
  return { url, credit, file: [...relPath, image].join('/') };
}

function ensureFolder(dir, extraFiles = {}) {
  mkdirSync(dir, { recursive: true });
  const creditPath = join(dir, 'credit.txt');
  if (!existsSync(creditPath)) writeFileSync(creditPath, '', 'utf-8');
  for (const [file, content] of Object.entries(extraFiles)) {
    if (!existsSync(join(dir, file))) writeFileSync(join(dir, file), content, 'utf-8');
  }
}

function initFolders(data, imagesDir) {
  const placesDir = join(imagesDir, 'places');
  const folders = listPlaceFolders(placesDir);
  console.log(`사진 폴더: ${imagesDir}\n`);

  for (const card of data.cards) {
    const { folder, created } = folderForInit(folders, card);
    const placeJson = JSON.stringify({ place_name: card.place_name, address: card.address ?? null }, null, 2) + '\n';
    ensureFolder(join(placesDir, folder), { 'place.json': placeJson });
    if (created) folders.push({ name: folder, address: card.address ?? null });
    console.log(`  ${created ? '+ 생성' : '= 기존'}  places/${folder}/`);
  }

  const topic = toFolderName(data.series_title ?? 'untitled');
  ensureFolder(join(imagesDir, 'topics', topic, '_cover'));
  console.log(`  ✓ 준비  topics/${topic}/_cover/`);
  ensureFolder(join(imagesDir, '_cta'));
  console.log('  ✓ 준비  _cta/ (공통)');

  console.log('\n이미 있던 폴더·credit.txt·place.json은 그대로 둠.');
  console.log('허락받은 사진을 넣고 credit.txt 첫 줄에 출처(예: @가게계정)를 적은 뒤 --init 없이 다시 실행하세요.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.data) {
    throw new Error('--data <카드뉴스 JSON 경로>가 필요합니다.');
  }
  const dataPath = resolve(process.cwd(), args.data);
  const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
  assertValidCardNewsData(data, dataPath);

  if (args.init) {
    initFolders(data, args.images);
    return;
  }

  const folders = listPlaceFolders(join(args.images, 'places'));
  console.log(`사진 폴더: ${args.images}\n`);
  let matched = 0;
  let firstMatch = null;
  for (const card of data.cards) {
    const picked = pickPlaceFolder(folders, card);
    const result = picked.folder ? lookup(args.images, ['places', picked.folder]) : picked;
    // 재실행 시 이전 매칭이 남지 않도록 항상 덮어쓴다 (사진을 빼면 placeholder로 돌아감)
    card.image_url = result.url;
    card.image_credit = result.credit;
    if (result.url) {
      matched += 1;
      firstMatch ??= result;
      console.log(`  ✔ ${card.place_name} ← ${result.file} (${result.credit})${picked.warning ? `  ⚠ ${picked.warning}` : ''}`);
    } else {
      console.log(`  - ${card.place_name}: ${result.reason}`);
    }
  }

  const topic = toFolderName(data.series_title ?? 'untitled');
  const cover = lookup(args.images, ['topics', topic, '_cover']);
  const coverSource = cover.url ? cover : firstMatch;
  data.cover_image_url = coverSource?.url;
  data.cover_image_credit = coverSource?.credit;
  console.log(`  ${coverSource ? '✔' : '-'} 커버: ${cover.url ? cover.file : firstMatch ? '첫 매칭 가게 사진 사용' : `사진 없음 (topics/${topic}/_cover/)`}`);

  // CTA는 핫수집 브랜드 배경이라 출처 생략 가능. 스톡 이미지 등 표기가 필요하면 credit.txt에 적는다.
  const cta = lookup(args.images, ['_cta'], { creditOptional: true });
  data.cta_card.image_url = cta.url;
  data.cta_card.image_credit = cta.credit;
  console.log(`  ${cta.url ? '✔' : '-'} CTA: ${cta.url ? cta.file :`${cta.reason} (_cta/)`}`);

  writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n✔ 장소 ${data.cards.length}곳 중 ${matched}곳 매칭 → ${dataPath} 갱신`);
  if (matched < data.cards.length) {
    console.log('  (매칭 안 된 장소는 placeholder 배경으로 렌더링됨. 폴더가 없으면 --init으로 만들 수 있음)');
  }
}

try {
  main();
} catch (err) {
  console.error(`\n✘ 이미지 매칭 실패: ${err.message}`);
  process.exit(1);
}
