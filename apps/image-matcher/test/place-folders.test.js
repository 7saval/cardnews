import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, toFolderName, pickPlaceFolder, folderForInit } from '../src/lib/place-folders.js';

const GANGNAM = '서울 강남구 강남대로120길 40';
const SEOCHO = '서울 서초구 서초대로 1';

test('nameKey: 공백·하이픈·구분 꼬리표 무시', () => {
  assert.equal(nameKey('춘식당 가로수길본점'), nameKey('춘식당-가로수길본점'));
  assert.equal(nameKey('보물섬 (서초구)'), nameKey('보물섬'));
});

test('toFolderName: Windows 금지 문자 치환', () => {
  assert.equal(toFolderName('A/B:C?'), 'A-B-C-');
});

test('pickPlaceFolder: 이름 + 주소 일치', () => {
  const folders = [{ name: '보물섬', address: '서울특별시 강남구 강남대로120길 40 2층' }];
  assert.deepEqual(pickPlaceFolder(folders, { place_name: '보물섬', address: GANGNAM }), { folder: '보물섬' });
});

test('pickPlaceFolder: 동명인데 주소가 다르면 사용 안 함', () => {
  const folders = [{ name: '보물섬', address: SEOCHO }];
  const r = pickPlaceFolder(folders, { place_name: '보물섬', address: GANGNAM });
  assert.equal(r.folder, undefined);
  assert.match(r.reason, /주소가 다름/);
});

test('pickPlaceFolder: 동명 폴더 여러 개면 주소로 고름', () => {
  const folders = [
    { name: '보물섬', address: SEOCHO },
    { name: '보물섬 (강남구)', address: GANGNAM },
  ];
  assert.deepEqual(pickPlaceFolder(folders, { place_name: '보물섬', address: GANGNAM }), { folder: '보물섬 (강남구)' });
});

test('pickPlaceFolder: place.json 없는 폴더는 경고와 함께 사용', () => {
  const r = pickPlaceFolder([{ name: '신미식당', address: null }], { place_name: '신미식당', address: GANGNAM });
  assert.equal(r.folder, '신미식당');
  assert.match(r.warning, /확인 못 함/);
});

test('pickPlaceFolder: 폴더 없음', () => {
  assert.deepEqual(pickPlaceFolder([], { place_name: '신미식당', address: GANGNAM }), { reason: '폴더 없음' });
});

test('folderForInit: 새 가게는 이름 그대로', () => {
  assert.deepEqual(folderForInit([], { place_name: '보물섬', address: GANGNAM }), { folder: '보물섬', created: true });
});

test('folderForInit: 이미 맞는 폴더가 있으면 재사용', () => {
  const folders = [{ name: '보물섬', address: GANGNAM }];
  assert.deepEqual(folderForInit(folders, { place_name: '보물섬', address: GANGNAM }), { folder: '보물섬', created: false });
});

test('folderForInit: 동명 다른 가게가 있으면 구를 붙여 구분', () => {
  const folders = [{ name: '보물섬', address: SEOCHO }];
  assert.deepEqual(folderForInit(folders, { place_name: '보물섬', address: GANGNAM }), { folder: '보물섬 (강남구)', created: true });
});
