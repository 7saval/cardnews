// 수집 결과(*-adopted.json)의 혜택을 발행 이력(data/published.json)에 기록하는 CLI.
// 기록된 혜택은 다음 수집부터 빠지고, 회차 카테고리는 순환 순서의 맨 뒤로 간다.
//
// 사용법:
//   npm run mark-published -- --input output/20261018-153000-always-adopted.json
//   npm run mark-published -- --input <파일> --date 2026-10-20     # 발행일 지정 (기본: 오늘 KST)

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HISTORY_FILE, loadHistory, appendHistory, saveHistory } from './lib/history.js';
import { assertValidCollectedBenefits } from '../../../shared/schemas/validate-benefits.js';

function parseArgs(argv) {
  const args = { input: null, date: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--date') args.date = argv[++i];
  }
  if (!args.input) throw new Error('--input <수집 결과 파일>이 필요합니다');
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('--date는 YYYY-MM-DD 형식입니다');
  return args;
}

const todayKst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolve(process.cwd(), args.input);
  const collected = JSON.parse(await readFile(inputPath, 'utf8'));
  assertValidCollectedBenefits(collected, inputPath);

  const { history, added } = appendHistory(await loadHistory(HISTORY_FILE), collected, args.date ?? todayKst());
  await saveHistory(HISTORY_FILE, history);
  console.log(`✔ 발행 이력에 ${added.length}건 기록 (이미 있던 ${collected.items.length - added.length}건 제외), 전체 ${history.length}건`);
  for (const h of added) console.log(`  - ${h.source_id} ${h.title}`);
}

main().catch((err) => {
  console.error(`\n✘ 기록 실패: ${err.message}`);
  process.exit(1);
});
