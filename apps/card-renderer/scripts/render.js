// 카드뉴스 JSON을 받아 카드별 PNG로 렌더링하는 CLI 스크립트.
//
// 사용법:
//   npm run render                                    → 내장 샘플 데이터로 렌더링
//   npm run render -- --data path/to/data.json         → 지정한 JSON으로 렌더링
//   npm run render -- --data path/to/data.json --out output-example

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidCardNewsData } from '../../../shared/schemas/validate-card-news.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { data: null, out: 'output' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--data') args.data = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function loadCardNewsData(dataPath) {
  const raw = readFileSync(dataPath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${dataPath}가 올바른 JSON이 아닙니다: ${err.message}`);
  }
  assertValidCardNewsData(data, dataPath);
  return data;
}

function slugifyPlaceName(placeName) {
  return placeName.replace(/[\\/:*?"<>|\s]+/g, '-');
}

/** cover + content-N... + cta 렌더링 순서와 저장 파일명을 결정한다. */
function buildRenderTargets(data) {
  const total = data.cards.length + 2;
  const pad = (n) => String(n).padStart(String(total).length, '0');

  const targets = [{ cardParam: 'cover', fileName: `${pad(1)}-cover.png` }];
  data.cards.forEach((c, i) => {
    targets.push({
      cardParam: `content-${i + 1}`,
      fileName: `${pad(i + 2)}-${slugifyPlaceName(c.place_name)}.png`,
    });
  });
  targets.push({ cardParam: 'cta', fileName: `${pad(total)}-cta.png` });
  return targets;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(process.cwd(), args.out);
  mkdirSync(outDir, { recursive: true });

  const injectedData = args.data ? loadCardNewsData(resolve(process.cwd(), args.data)) : null;

  console.log('카드 렌더러 개발 서버를 띄우는 중...');
  const server = await createServer({ root: projectRoot, server: { open: false } });
  await server.listen();
  const url = server.resolvedUrls.local[0];

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

  if (injectedData) {
    await page.addInitScript((data) => {
      window.__RENDER_DATA__ = data;
    }, injectedData);
  }

  // 실제로 화면에 쓰이는 데이터(주입 데이터 or 내장 샘플 폴백)를 읽어와서 렌더링 대상 목록을 정확히 계산한다.
  await page.goto(`${url}/?card=cover`, { waitUntil: 'networkidle' });
  const resolvedData = await page.evaluate(() => window.__RESOLVED_RENDER_DATA__);
  if (!resolvedData) {
    throw new Error('카드 데이터를 읽어오지 못했습니다. card-renderer 앱이 정상적으로 로드됐는지 확인하세요.');
  }

  const targets = buildRenderTargets(resolvedData);
  console.log(`렌더링 대상: ${targets.length}장 (${targets.map((t) => t.cardParam).join(', ')})`);

  const savedFiles = [];
  for (const target of targets) {
    await page.goto(`${url}/?card=${target.cardParam}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.card');
    const filePath = join(outDir, target.fileName);
    await page.screenshot({ path: filePath });
    savedFiles.push(filePath);
  }

  await browser.close();
  await server.close();

  console.log(`\n✔ ${savedFiles.length}장의 카드 이미지를 "${outDir}"에 저장했습니다.`);
  savedFiles.forEach((f) => console.log(`  - ${f}`));
}

main().catch((err) => {
  console.error(`\n✘ 렌더링 실패: ${err.message}`);
  process.exit(1);
});
