// content-generator(카피 구조화) → image-matcher(허락받은 사진 연결) → card-renderer(PNG 렌더링)를
// 한 번에 잇는 오케스트레이션 CLI.
//
// 각 앱은 자기 폴더의 .env / node_modules를 쓰는 독립 CLI라서, import로 합치지 않고
// 앱 폴더를 cwd로 해서 자식 프로세스로 실행한다. npm 대신 node로 스크립트를 직접 띄우는 건
// Windows에서 npm.cmd 실행에 셸이 필요해지고 한글/공백 경로 인자 quoting이 꼬이는 걸 피하기 위함.
//
// 사용법 (저장소 루트에서):
//   npm run pipeline -- --handle matsoozip
//     → research-collector/output의 가장 최근 *-adopted-*.txt를 입력으로 사용
//   npm run pipeline -- --handle matsoozip --input apps/research-collector/output/xxx-adopted-1-강남-야장.txt
//   npm run pipeline -- --handle matsoozip --name gangnam-yajang   # 산출물 이름 지정 (기본: 타임스탬프)
//
// 산출물 (같은 이름으로 짝지어짐):
//   apps/content-generator/output/<name>.json, <name>.meta.json
//   apps/card-renderer/output/<name>/*.png

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const apps = {
  research: join(repoRoot, 'apps/research-collector'),
  generator: join(repoRoot, 'apps/content-generator'),
  matcher: join(repoRoot, 'apps/image-matcher'),
  renderer: join(repoRoot, 'apps/card-renderer'),
};

function parseArgs(argv) {
  const args = { input: null, handle: null, name: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--handle') args.handle = argv[++i];
    else if (argv[i] === '--name') args.name = argv[++i];
  }
  return args;
}

function findLatestAdopted() {
  const outDir = join(apps.research, 'output');
  const files = existsSync(outDir)
    ? readdirSync(outDir).filter((f) => /-adopted-.*\.txt$/.test(f))
    : [];
  if (!files.length) {
    throw new Error(
      'research-collector 산출물(*-adopted-*.txt)이 없습니다. apps/research-collector에서 npm run collect를 먼저 실행하거나 --input으로 직접 지정하세요.',
    );
  }
  const latest = files
    .map((f) => ({ path: join(outDir, f), mtime: statSync(join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0];
  return latest.path;
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
  if (!args.handle) {
    throw new Error('--handle <계정 핸들>이 필요합니다. 예: npm run pipeline -- --handle matsoozip');
  }

  const inputPath = args.input ? resolve(process.cwd(), args.input) : findLatestAdopted();
  if (!existsSync(inputPath)) {
    throw new Error(`입력 파일이 없습니다: ${inputPath}`);
  }

  const name = args.name ?? new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = join(apps.generator, 'output', `${name}.json`);
  const pngDir = join(apps.renderer, 'output', name);

  console.log(`입력: ${inputPath}`);
  console.log(`산출물 이름: ${name}`);

  await runStep('1/3 카피 구조화 (content-generator)', apps.generator, 'src/generate.js', [
    '--input', inputPath,
    '--handle', args.handle,
    '--out', jsonPath,
  ]);

  // 사진이 하나도 없어도 실패하지 않고 placeholder로 진행된다
  await runStep('2/3 이미지 매칭 (image-matcher)', apps.matcher, 'src/match.js', ['--data', jsonPath]);

  await runStep('3/3 카드 렌더링 (card-renderer)', apps.renderer, 'scripts/render.js', [
    '--data', jsonPath,
    '--out', pngDir,
  ]);

  console.log('\n✔ 파이프라인 완료');
  console.log(`  카드뉴스 JSON: ${jsonPath}`);
  console.log(`  카드 이미지:   ${pngDir}`);
}

main().catch((err) => {
  console.error(`\n✘ 파이프라인 실패: ${err.message}`);
  process.exit(1);
});
