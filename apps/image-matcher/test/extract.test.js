import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripTags,
  addressKey,
  districtOf,
  instagramHandleFromUrl,
  extractInstagramHandles,
  extractInstagramFromHtml,
  classifyLink,
} from '../src/lib/extract.js';

test('stripTags: 검색 API의 <b> 태그와 엔티티 제거', () => {
  assert.equal(stripTags('<b>신미식당</b> &quot;감자탕&quot; &amp; 삼겹살'), '신미식당 "감자탕" & 삼겹살');
});

test('addressKey: 시/도 표기·건물명·층수 차이를 흡수', () => {
  assert.equal(addressKey('서울특별시 강남구 압구정로 214 현대종합상가빌딩 1층'), '강남구 압구정로 214');
  assert.equal(addressKey('서울 강남구 압구정로 214'), '강남구 압구정로 214');
  assert.equal(addressKey('서울 강남구 테헤란로64길 26'), '강남구 테헤란로64길 26');
  assert.equal(addressKey('서울 강남구 도산대로23길 17-1'), '강남구 도산대로23길 17-1');
});

test('addressKey: 도로명 주소가 아니면 null', () => {
  assert.equal(addressKey('서울특별시 강남구 신사동 615'), null);
  assert.equal(addressKey(undefined), null);
  assert.equal(addressKey(null), null); // place.json이 없는 폴더의 주소
});

test('districtOf: 구 이름 추출', () => {
  assert.equal(districtOf('서울 강남구 압구정로 214'), '강남구');
  assert.equal(districtOf(''), '');
});

test('instagramHandleFromUrl: 계정 페이지만 인정', () => {
  assert.equal(instagramHandleFromUrl('https://www.instagram.com/dolsanhouse'), 'dolsanhouse');
  assert.equal(instagramHandleFromUrl('https://instagram.com/DolsanHouse/?hl=ko'), 'dolsanhouse');
  assert.equal(instagramHandleFromUrl('https://www.instagram.com/p/C1abcDEF/'), null);
  assert.equal(instagramHandleFromUrl('https://www.instagram.com/reel/xyz/'), null);
  assert.equal(instagramHandleFromUrl('https://www.instagram.com/'), null);
  assert.equal(instagramHandleFromUrl('https://notinstagram.com/abc'), null);
  assert.equal(instagramHandleFromUrl('not a url'), null);
});

test('extractInstagramHandles: 링크와 @멘션, 이메일은 제외', () => {
  const text = '문의 shop@gmail.com 인스타 @dolsan_house. 링크 instagram.com/opoong_official (@misik.photo)';
  assert.deepEqual(extractInstagramHandles(text).sort(), ['dolsan_house', 'misik.photo', 'opoong_official']);
});

test('extractInstagramHandles: 게시물 링크는 계정이 아님', () => {
  assert.deepEqual(extractInstagramHandles('https://www.instagram.com/p/abc123/'), []);
});

test('extractInstagramFromHtml: a href의 인스타 계정만', () => {
  const html = `
    <a href="https://www.instagram.com/opoong_official/">인스타</a>
    <a href='https://instagram.com/p/xyz'>게시물</a>
    <a href="/menu">메뉴</a>
    <p>instagram.com/textonly</p>`;
  assert.deepEqual(extractInstagramFromHtml(html), ['opoong_official']);
});

test('classifyLink: 조사에서 본 실제 link 값들', () => {
  assert.deepEqual(classifyLink('https://www.instagram.com/dolsanhouse'), { type: 'instagram', value: 'dolsanhouse' });
  assert.deepEqual(classifyLink('https://opoong.com/'), { type: 'homepage', value: 'https://opoong.com/' });
  assert.deepEqual(classifyLink('https://booking.naver.com/booking/6/bizes/1399586'), { type: 'platform' });
  assert.deepEqual(classifyLink(''), { type: 'empty' });
  assert.deepEqual(classifyLink('https://blog.naver.com/some'), { type: 'platform' });
  assert.deepEqual(classifyLink('https://www.siksinhot.com/P/120236'), { type: 'platform' });
  assert.deepEqual(classifyLink('javascript:alert(1)'), { type: 'invalid' });
});
