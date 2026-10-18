// 발행 이력. 같은 혜택을 다시 내지 않고(중복 제거), 카테고리 순환 순서를 정하는 데 쓴다.
// publisher가 생기면 Supabase `published_benefits` 테이블로 옮길 예정이고(계획서 §6.1),
// 그 전까지는 저장소에 커밋하는 로컬 JSON(data/published.json)으로 둔다 — GitHub Actions에서도 이어지게.
//
// 수집 시점이 아니라 발행(또는 렌더) 성공 뒤에 mark-published로 기록한다. 수집만 하고 생성이 실패한
// 회차의 혜택이 이력에 남아 영영 안 나오는 일을 막기 위해서다.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const HISTORY_FILE = fileURLToPath(new URL('../../data/published.json', import.meta.url));

/**
 * @typedef {{ source_id: string, title: string, category: string, series_type: string,
 *             region: string|null, published_at: string }} HistoryEntry
 */

/** @returns {Promise<HistoryEntry[]>} 파일이 없으면 빈 이력 */
export async function loadHistory(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(`발행 이력(${file})을 읽지 못했습니다: ${err.message}`);
  }
}

/**
 * 수집 결과의 항목을 이력에 더한다. 이미 있는 source_id는 건너뛴다(같은 회차를 두 번 기록해도 안전).
 * @param {HistoryEntry[]} history
 * @param {import('../../../../shared/schemas/benefit').CollectedBenefits} collected
 * @returns {{ history: HistoryEntry[], added: HistoryEntry[] }}
 */
export function appendHistory(history, collected, publishedAt) {
  const known = new Set(history.map((h) => h.source_id));
  const added = collected.items
    .filter((r) => !known.has(r.source_id))
    .map((r) => ({
      source_id: r.source_id,
      title: r.title,
      // 카테고리 순환은 회차 카테고리 기준이다 (district 회차는 null이라 순환에 영향이 없다)
      category: collected.category,
      series_type: collected.series_type,
      region: collected.region,
      published_at: publishedAt,
    }));
  return { history: [...history, ...added], added };
}

export async function saveHistory(file, history) {
  await writeFile(file, `${JSON.stringify(history, null, 2)}\n`);
}
