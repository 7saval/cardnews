// images/places/ 아래 가게 폴더를 카드의 장소와 짝짓는 순수 로직 (파일 I/O 없음 → 단위 테스트 대상).
//
// 가게 사진은 주제와 무관하게 가게 단위로 한 번 허락받아 여러 카드뉴스에서 재사용한다.
// 이름만으로 찾으면 다른 동네의 동명 가게(예: "보물섬")에 사진이 잘못 들어갈 수 있어서,
// --init이 폴더마다 place.json에 주소를 적어두고 매칭 때 카드 주소와 대조한다.

import { addressKey, districtOf } from './extract.js';

/** Windows 폴더명으로 쓸 수 없는 문자를 치환. */
export function toFolderName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, '-').trim();
}

/**
 * 이름 비교용 키: 끝의 "(강남구)" 같은 구분 꼬리표를 떼고 공백/특수문자 제거 + 소문자.
 * "춘식당 가로수길본점" == "춘식당-가로수길본점", "보물섬 (서초구)" == "보물섬"
 */
export function nameKey(name) {
  return name
    .replace(/\s*\([^)]*\)\s*$/, '')
    .toLowerCase()
    .replace(/[\s\\/:*?"<>|\-_.·()]+/g, '');
}

/**
 * 카드 장소에 맞는 가게 폴더 고르기.
 * @param {{ name: string, address: string | null }[]} folders  places/ 아래 폴더들 (address는 place.json 값)
 * @param {{ place_name: string, address?: string }} card
 * @returns {{ folder: string, warning?: string } | { reason: string }}
 */
export function pickPlaceFolder(folders, card) {
  const key = nameKey(card.place_name);
  const sameName = folders.filter((f) => nameKey(f.name) === key);
  if (!sameName.length) return { reason: '폴더 없음' };

  const cardAddr = addressKey(card.address);
  const withAddr = sameName.filter((f) => addressKey(f.address));
  const withoutAddr = sameName.filter((f) => !addressKey(f.address));

  if (cardAddr) {
    const exact = withAddr.filter((f) => addressKey(f.address) === cardAddr);
    if (exact.length) return { folder: exact[0].name };
    if (withoutAddr.length === 1) {
      return { folder: withoutAddr[0].name, warning: 'place.json(주소)이 없어 같은 가게인지 확인 못 함' };
    }
    if (withoutAddr.length > 1) return { reason: `주소 없는 동명 폴더가 ${withoutAddr.length}개라 고를 수 없음` };
    return { reason: `동명 폴더는 있지만 주소가 다름(다른 가게?): ${withAddr.map((f) => f.name).join(', ')}` };
  }

  if (sameName.length === 1) return { folder: sameName[0].name, warning: '카드에 도로명 주소가 없어 주소 확인 못 함' };
  return { reason: `카드에 도로명 주소가 없고 동명 폴더가 ${sameName.length}개라 고를 수 없음` };
}

/**
 * --init이 만들 폴더 이름. 이미 맞는 폴더가 있으면 그걸 쓰고, 이름은 같은데 주소가 다른 폴더가 있으면
 * "<이름> (<구>)"로 구분한다.
 * @returns {{ folder: string, created: boolean }}
 */
export function folderForInit(folders, card) {
  const picked = pickPlaceFolder(folders, card);
  if (picked.folder) return { folder: picked.folder, created: false };

  const base = toFolderName(card.place_name);
  const taken = new Set(folders.map((f) => f.name));
  if (!taken.has(base)) return { folder: base, created: true };

  const gu = districtOf(card.address);
  let candidate = gu ? `${base} (${gu})` : `${base} (2)`;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base} (${gu ? `${gu} ` : ''}${n})`;
  return { folder: candidate, created: true };
}
