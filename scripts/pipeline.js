// benefit-collector(수집·선별) → content-generator(카피 + fact-check) → card-renderer(PNG 렌더링)를
// 한 번에 잇는 오케스트레이션 CLI.
//
// 각 앱은 자기 폴더의 .env / node_modules를 쓰는 독립 CLI라서, import로 합치지 않고
// 앱 폴더를 cwd로 해서 자식 프로세스로 실행한다. npm 대신 node로 스크립트를 직접 띄우는 건
// Windows에서 npm.cmd 실행에 셸이 필요해지고 한글/공백 경로 인자 quoting이 꼬이는 걸 피하기 위함.
//
// 사용법 (저장소 루트에서):
//   npm run pipeline -- --handle hotsoozip --collect
//     → 수집부터 (카테고리 순환 순서대로 5건). GitHub Actions 주간 실행이 이 형태
//   npm run pipeline -- --handle hotsoozip --collect --category 주거·자립 --count 4
//   npm run pipeline -- --handle hotsoozip --collect --series district --region 동작구
//   npm run pipeline -- --handle hotsoozip
//     → 수집 없이 benefit-collector/output의 가장 최근 *-adopted.json으로
//   npm run pipeline -- --handle hotsoozip --input apps/benefit-collector/output/xxx-adopted.json
//   --name <이름>  산출물 이름 (기본: KST 타임스탬프)
//
// 산출물: apps/card-renderer/output/benefit/<name>/ 한 폴더에 검수·게시에 필요한 것을 모은다
//   01-cover.png … NN-cta.png   카드 이미지
//   caption.txt                 게시물 캡션 (원문 링크·확인 안내 포함)
//   adopted.json                수집 결과 — 게시 후 mark-published --input으로 넘긴다
//   scores.json                 후보 전체의 관련성 점수 (--collect일 때)
//   card-news.json, card-news.meta.json
//
// 발행 이력은 여기서 기록하지 않는다. 사람이 검수·게시한 뒤 mark-published로 기록한다
// (publisher 구현 전까지. _docs/topic-pivot-benefits-plan.md §6.5).

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const apps = {
  collector: join(repoRoot, 'apps/benefit-collector'),
  generator: join(repoRoot, 'apps/content-generator'),
  renderer: join(repoRoot, 'apps/card-renderer'),
};

// --collect일 때 benefit-collector로 그대로 넘기는 옵션
const COLLECT_OPTIONS = ['--series', '--category', '--region', '--count'];

function parseArgs(argv) {
  const args = { input: null, handle: null, name: null, collect: false, refresh: false, collectArgs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--handle') args.handle = argv[++i];
    else if (argv[i] === '--name') args.name = argv[++i];
    else if (argv[i] === '--collect') args.collect = true;
    else if (argv[i] === '--refresh') args.collectArgs.push('--refresh');
    else if (COLLECT_OPTIONS.includes(argv[i])) args.collectArgs.push(argv[i], argv[++i]);
    else throw new Error(`알 수 없는 옵션입니다: ${argv[i]}`);
  }
  if (!args.handle) {
    throw new Error('--handle <계정 핸들>이 필요합니다. 예: npm run pipeline -- --handle hotsoozip --collect');
  }
  if (args.collect && args.input) throw new Error('--collect와 --input은 함께 쓸 수 없습니다');
  if (!args.collect && args.collectArgs.length > 0) {
    throw new Error(`${args.collectArgs[0]}은 --collect와 함께 써야 합니다`);
  }
  return args;
}

/** KST 기준 "20261021-073000" */
function stampKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
}

function findLatestAdopted() {
  const outDir = join(apps.collector, 'output');
  const files = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith('-adopted.json')) : [];
  if (!files.length) {
    throw new Error(
      'benefit-collector 산출물(*-adopted.json)이 없습니다. --collect로 수집부터 돌리거나 --input으로 직접 지정하세요.',
    );
  }
  return files
    .map((f) => ({ path: join(outDir, f), mtime: statSync(join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].path;
}

function runStep(label, cwd, script, scriptArgs) {
  console.log(`\n━━━ ${label} ━━━`);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${label} 단계가 실패했습니다 (exit ${code}). 위 로그를 확인하세요.`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args.name ?? stampKst();
  const total = args.collect ? 3 : 2;
  let step = 0;
  const label = (text) => `${(step += 1)}/${total} ${text}`;

  const adoptedPath = args.collect
    ? join(apps.collector, 'output', `${name}-adopted.json`)
    : args.input
      ? resolve(process.cwd(), args.input)
      : findLatestAdopted();
  const jsonPath = join(apps.generator, 'output', `${name}.json`);
  const bundleDir = join(apps.renderer, 'output', 'benefit', name);

  console.log(`산출물 이름: ${name}`);
  if (args.collect) {
    await runStep(label('혜택 수집·선별 (benefit-collector)'), apps.collector, 'src/collect.js', [
      ...args.collectArgs,
      '--out', adoptedPath,
    ]);
  } else {
    if (!existsSync(adoptedPath)) throw new Error(`입력 파일이 없습니다: ${adoptedPath}`);
    console.log(`입력: ${adoptedPath}`);
  }

  await runStep(label('카피 생성 + fact-check (content-generator)'), apps.generator, 'src/generate.js', [
    '--input', adoptedPath,
    '--handle', args.handle,
    '--out', jsonPath,
  ]);

  await runStep(label('카드 렌더링 (card-renderer)'), apps.renderer, 'scripts/render.js', [
    '--data', jsonPath,
    '--out', bundleDir,
  ]);

  // 검수·게시에 필요한 파일을 PNG 폴더 한곳에 모은다 (GitHub Actions는 이 폴더를 artifact로 올린다)
  const bundle = [
    [adoptedPath, 'adopted.json'],
    [adoptedPath.replace(/\.json$/, '.scores.json'), 'scores.json'],
    [jsonPath, 'card-news.json'],
    [jsonPath.replace(/\.json$/, '.meta.json'), 'card-news.meta.json'],
    [jsonPath.replace(/\.json$/, '.caption.txt'), 'caption.txt'],
  ];
  for (const [from, to] of bundle) {
    if (existsSync(from)) copyFileSync(from, join(bundleDir, to));
  }

  const adoptedInBundle = relative(apps.collector, join(bundleDir, 'adopted.json'));
  console.log('\n✔ 파이프라인 완료');
  console.log(`  결과 폴더: ${bundleDir}`);
  console.log('\n다음 할 일: 카드와 caption.txt를 검수하고 인스타그램에 게시한 뒤 발행 이력에 기록하세요.');
  console.log(`  cd apps/benefit-collector && npm run mark-published -- --input ${adoptedInBundle}`);
}

main().catch((err) => {
  console.error(`\n✘ 파이프라인 실패: ${err.message}`);
  process.exit(1);
});
