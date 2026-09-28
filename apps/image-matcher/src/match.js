// 카드뉴스 JSON의 장소별로, 사람이 허락받아 넣어둔 사진(images/<장소명>/)을 찾아
// image_url / image_credit을 채우는 CLI.
//
// 원칙: 남의 사진을 자동으로 가져오지 않는다. 가게 공식 채널에서 허락받은 사진이나
// 직접 찍은 사진만 사람이 폴더에 넣고, 이 스크립트는 그걸 카드에 연결만 한다.
// credit.txt(출처 표기)가 비어 있으면 사진이 있어도 쓰지 않는다 — 출처 표기 누락 방지.
//
// 폴더 구조:
//   images/<장소명>/credit.txt   → 첫 줄이 출처 (예: @shinmi_official, 직접 촬영이면 내 계정)
//   images/<장소명>/*.jpg|png|webp → 파일명 순 첫 장을 배경으로 사용
//   images/_cover/, images/_cta/  → (선택) 커버/CTA 전용 사진. 커버는 없으면 첫 매칭 장소 사진을 씀
//
// 사용법:
//   npm run match -- --data ../content-generator/output/pipeline-test.json --init   # 장소별 빈 폴더 생성
//   npm run match -- --data ../content-generator/output/pipeline-test.json          # 매칭 → JSON 갱신
//
// image_url은 card-renderer 개발 서버의 /__images/<폴더>/<파일> 경로로 채운다 (vite.config.ts 참고).

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidCardNewsData } from '../../../shared/schemas/validate-card-news.js';

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

/** Windows 폴더명으로 쓸 수 없는 문자를 치환. --init이 만드는 폴더명. */
function toFolderName(placeName) {
  return placeName.replace(/[\\/:*?"<>|]+/g, '-').trim();
}

/** 매칭용 정규화: 공백/특수문자 제거 + 소문자. "춘식당 가로수길본점" == "춘식당-가로수길본점" */
function normalize(name) {
  return name.toLowerCase().replace(/[\s\\/:*?"<>|\-_.·()]+/g, '');
}

function readFolder(imagesDir, folderName) {
  const dir = join(imagesDir, folderName);
  const image = readdirSync(dir)
    .filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
    .sort()[0];
  const creditPath = join(dir, 'credit.txt');
  const credit = existsSync(creditPath)
    ? readFileSync(creditPath, 'utf-8').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).find(Boolean)
    : undefined;
  return { image, credit };
}

function toImageUrl(folderName, fileName) {
  return `/__images/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`;
}

function initFolders(data, imagesDir) {
  const names = [...data.cards.map((c) => toFolderName(c.place_name)), '_cover', '_cta'];
  for (const name of names) {
    const dir = join(imagesDir, name);
    const creditPath = join(dir, 'credit.txt');
    mkdirSync(dir, { recursive: true });
    if (!existsSync(creditPath)) writeFileSync(creditPath, '', 'utf-8');
  }
  console.log(`✔ ${imagesDir}에 폴더 ${names.length}개 준비 (이미 있던 폴더/credit.txt는 그대로 둠)`);
  names.forEach((n) => console.log(`  - ${n}/`));
  console.log('\n각 폴더에 허락받은 사진을 넣고 credit.txt 첫 줄에 출처(예: @가게계정)를 적은 뒤 --init 없이 다시 실행하세요.');
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

  const folders = existsSync(args.images)
    ? readdirSync(args.images, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  const SPECIAL = ['_cover', '_cta'];
  const byNormalized = new Map(folders.filter((f) => !SPECIAL.includes(f)).map((f) => [normalize(f), f]));
  const special = (name) => (folders.includes(name) ? name : undefined);

  // 사진 + 출처가 모두 있어야 사용. 이유를 같이 돌려줘서 로그로 보여준다.
  function lookup(folderName) {
    if (!folderName) return { reason: '폴더 없음' };
    const { image, credit } = readFolder(args.images, folderName);
    if (!image) return { reason: '사진 없음' };
    if (!credit) return { reason: 'credit.txt 비어 있음 → 사용 안 함' };
    return { url: toImageUrl(folderName, image), credit, file: image };
  }

  console.log(`사진 폴더: ${args.images}\n`);
  let matched = 0;
  let firstMatch = null;
  for (const card of data.cards) {
    const result = lookup(byNormalized.get(normalize(card.place_name)));
    // 재실행 시 이전 매칭이 남지 않도록 항상 덮어쓴다 (사진을 빼면 placeholder로 돌아감)
    card.image_url = result.url;
    card.image_credit = result.credit;
    if (result.url) {
      matched += 1;
      firstMatch ??= result;
      console.log(`  ✔ ${card.place_name} ← ${result.file} (${result.credit})`);
    } else {
      console.log(`  - ${card.place_name}: ${result.reason}`);
    }
  }

  const cover = lookup(special('_cover'));
  const coverSource = cover.url ? cover : firstMatch;
  data.cover_image_url = coverSource?.url;
  data.cover_image_credit = coverSource?.credit;
  console.log(`  ${coverSource ? '✔' : '-'} 커버: ${cover.url ? `_cover/${cover.file}` : firstMatch ? '첫 매칭 장소 사진 사용' : '사진 없음'}`);

  const cta = lookup(special('_cta'));
  data.cta_card.image_url = cta.url;
  data.cta_card.image_credit = cta.credit;
  console.log(`  ${cta.url ? '✔' : '-'} CTA: ${cta.url ? `_cta/${cta.file}` : cta.reason}`);

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
