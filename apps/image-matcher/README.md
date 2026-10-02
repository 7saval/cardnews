# image-matcher

카드뉴스 JSON의 장소별로 **허락받은 사진**을 찾아 카드 배경(`image_url`)과 출처(`image_credit`)를
채우는 CLI. Phase 3 담당 — 파이프라인에서 `content-generator`와 `card-renderer` 사이에 들어간다.

## 원칙: 사진을 자동으로 "가져오지" 않는다

카카오맵/네이버 지도/Google Places의 사진은 가게 사장님이 올린 "공식 사진"이어도 **그 플랫폼 안에서
보여주라고 올린 것**이라, 우리 계정에 재게시할 권리가 없다 (카카오맵 `robots.txt`는 장소 페이지
수집 자체도 막고 있고, Google Places 정책은 사진 저장을 금지함 — 상세: `_docs/insta-cardnews-automation-plan.md`
Phase 3). 그래서 사진 확보는 사람이 한다:

1. 가게 공식 채널(인스타/홈페이지)에 DM으로 사진 사용 허락 요청 — 또는 직접 방문해서 촬영
   (연락할 곳은 아래 `npm run find-channels`로 찾음)
2. 허락받은 사진을 `images/places/<가게>/`에 넣고, `credit.txt` 첫 줄에 출처(`@가게계정`, 직접 촬영이면 내 계정) 기록
3. 이 스크립트가 카드에 연결 — **`credit.txt`가 비어 있으면 사진이 있어도 쓰지 않는다** (출처 표기 누락 방지)

`images/`는 `.gitignore` 처리 — 사용 허락이지 재배포 허락이 아니라서 저장소에 올리지 않는다.

## 사용법

```bash
# 1) 빈 폴더 준비: 가게별 폴더(+ place.json 주소) + 이 주제의 _cover + 공통 _cta. 기존 폴더는 그대로 둠
npm run match -- --data ../content-generator/output/<이름>.json --init

# 2) 사진/출처를 채운 뒤 매칭 → JSON의 image_url / image_credit 갱신 (파일을 제자리에서 수정)
npm run match -- --data ../content-generator/output/<이름>.json
```

```
  ✔ 신미식당 ← places/신미식당/1.jpg (@shinmi_official)
  - 춘식당 가로수길본점: 사진 없음
  - 보물섬: credit.txt 비어 있음 → 사용 안 함
  ✔ 커버: topics/강남 야장 투어/_cover/cover.jpg
  ✔ CTA: _cta/bg.jpg
```

루트의 `npm run pipeline`은 이 단계를 자동으로 거친다. 사진이 하나도 없어도 실패하지 않고, 매칭 안 된
카드는 placeholder 배경으로 렌더링된다. 사진을 넣은 뒤에는 LLM을 다시 부를 필요 없이 이 스크립트 →
`card-renderer`의 `npm run render`만 다시 돌리면 된다.

## 폴더 규칙

```
images/
├── places/                       # 가게 단위 — 허락은 가게별로 받으므로 여러 주제에서 재사용
│   ├── 신미식당/
│   │   ├── 1.jpg                 # 파일명 순 첫 장을 배경으로 사용 (jpg/jpeg/png/webp)
│   │   ├── credit.txt            # 첫 줄: @shinmi_official
│   │   └── place.json            # --init이 기록: { place_name, address }
│   ├── 보물섬 (강남구)/           # 이름이 같은 다른 동네 가게가 이미 있으면 --init이 구를 붙여 구분
│   └── 춘식당 가로수길본점/        # 이름 매칭은 공백·하이픈·끝의 "(구)"를 무시
├── topics/
│   └── 강남 야장 투어/             # 카드 JSON의 series_title
│       └── _cover/               # (선택) 이 주제의 커버. 없으면 첫 매칭 가게 사진을 씀
└── _cta/                         # (선택) 맛수집 공통 CTA 배경 — 주제와 무관하게 계속 사용.
                                  #   자체 제작 배경이면 credit.txt를 비워도 쓰고 출처 표기를 숨김 (스톡 이미지면 출처를 적을 것)
```

**동명 가게 방지**: 매칭할 때 폴더의 `place.json` 주소와 카드 주소를 도로명 기준(`강남구 강남대로120길 40`)으로
대조한다. 이름이 같아도 주소가 다르면 사진을 쓰지 않는다. `place.json`이 없는 폴더(직접 만든 폴더)는 경고와 함께 사용.

## 이미지 전달 방식

`image_url`은 `/__images/places/<가게>/<파일>`처럼 `images/` 기준 경로로 채워지고, `card-renderer`의 개발 서버(`vite.config.ts`)가
이 경로를 `images/`의 실제 파일로 서빙한다. 미리보기(`npm run dev`)와 PNG 렌더링(`npm run render`) 모두
같은 서버를 쓰므로 둘 다 그대로 동작한다. 카드에는 좌상단 워터마크 아래에 `📸 <출처>`가 표시된다.

## 허락 요청 대상 찾기 (`npm run find-channels`)

카드 JSON의 장소별로 **연락할 곳(가게 인스타/홈페이지) 후보**를 찾아 체크리스트로 만든다. 사진은 가져오지 않는다.
설계와 조사 근거: `_docs/channel-finder-plan.md`.

```bash
# .env에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (지역·웹문서·블로그 검색이 켜진 NAVER API HUB 키, research-collector와 같은 키 가능)
npm run find-channels -- --data ../content-generator/output/<이름>.json
```

```
✔ 장소 8곳 중 2곳 후보 찾음
  크롤링 요청 2건: https://opoong.com/robots.txt, https://opoong.com/
  체크리스트: output/<이름>-channels.md
```

- **네이버 지역검색 `link`** (주소 대조로 같은 가게인지 확인) → 인스타면 후보, 가게 자체 도메인이면 홈페이지 후보
- **가게 홈페이지** → `robots.txt`가 허용할 때만 메인 1장에서 인스타 링크 추출
- **웹문서·블로그 검색** → 이미 나온 계정을 뒷받침할 때만 근거로 추가 (단독으로는 후기 작성자 오탐이 대부분이라 후보로 안 냄)
- 못 찾은 장소는 네이버 지도/네이버 검색 **수동 확인 링크**를 붙여서 체크리스트에 올림
- 체크리스트(`output/<이름>-channels.md`) 하단에 DM 템플릿 포함. 상세 근거·건너뛴 이유·실제 요청 URL은 `-channels.json`

**크롤링 규칙** (`src/lib/polite-fetch.js`, `src/lib/robots.js`): 네이버·카카오·다음·인스타그램·페이스북 도메인은 코드에서
요청 거부, UA `cardnews-channel-finder/0.1 (+github)` 명시, 같은 호스트 1초 간격, 타임아웃 10초, 2MB 제한,
리다이렉트마다 차단 도메인·`robots.txt` 재확인, `robots.txt` 확인 불가(5xx/오류)면 불허.

```bash
npm test   # extract / robots / place-folders 단위 테스트 (node:test)
```
