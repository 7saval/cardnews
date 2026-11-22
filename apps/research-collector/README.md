# research-collector

> 💤 **지금은 쓰지 않는 앱이다.** 맛집 주제 시절(2026-09~10)의 1단계였다. 2026-10-06 혜택 주제 전환 이후
> 1단계는 `benefit-collector`가 맡고, `content-generator`도 이 앱의 텍스트 출력(`*-adopted-*.txt`)이 아니라
> 혜택 JSON(`*-adopted.json`)을 입력으로 받는다. 기록과 참고용으로 남겨 둔다.

카카오 로컬 API(장소 후보) + NAVER API HUB 검색어트렌드 API(트렌드 랭킹)를 합쳐서
"채택할 소재 리스트"를 뽑는 CLI. 당시 파이프라인의 1단계였다.

전체 아키텍처와 각 단계의 설계 배경은 `_docs/insta-cardnews-automation-plan.md` 참고.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `src/collect.js` | **실행 진입점** (`npm run collect`). 주제별 네이버 트렌드 조회 → 모멘텀 랭킹 → 카카오 장소 후보 수집 → 상위 주제 채택·저장 |
| `src/test-kakao-local.js` | 카카오 로컬 API 키 확인용 스모크 테스트 (`npm run test:kakao`) |
| `src/test-naver-trend.js` | 네이버 검색어트렌드 API 키 확인용 스모크 테스트 (`npm run test:naver-trend`) |
| `data/topics.json` | 사람이 채우는 주제 목록 (이름, 카카오 검색어, 네이버 트렌드 키워드) |

## 정상 동작 순서 (당시 기준)

1. `npm install`, `.env`에 카카오·네이버 키
2. `npm run test:kakao -- --query "강남 야장"`, `npm run test:naver-trend`로 키 확인
3. `data/topics.json`에 주제 추가
4. `npm run collect` → `output/*-adopted-*.txt`

## 준비

1. 의존성 설치

   ```bash
   npm install
   ```

2. `.env` 생성 (`.env.example` 참고) 후 아래 값 채우기

   ```
   KAKAO_REST_API_KEY=
   NAVER_CLIENT_ID=
   NAVER_CLIENT_SECRET=
   ```

   - 카카오: [Kakao Developers](https://developers.kakao.com)에서 앱 생성 → REST API 키 발급.
     **"제품 설정 > 카카오맵"을 반드시 켜야** 로컬(장소) 검색이 열린다 (안 켜면 `403 OPEN_MAP_AND_LOCAL` 에러).
   - 네이버: 2026-07-31부로 기존 개발자센터 신규 발급이 막혀서, **NAVER Cloud Platform(NCP) 계정 가입 → NAVER API HUB**에서
     Search API를 신청해서 Client ID/Secret을 받아야 한다. 자세한 이관 배경은 계획서 1번 섹션 각주 참고.

## 소재 주제 정의 (`data/topics.json`)

이 파일은 **사람이 직접 채워넣는 시드 데이터**다 — 자동 생성 로직 없음. 원하는 지역/업종 조합을 추가하면 된다.

```json
[
  { "name": "강남 야장", "kakaoQuery": "강남 야장", "naverKeywords": ["야장", "루프탑"] }
]
```

| 필드 | 의미 |
|---|---|
| `name` | 랭킹/로그에 표시될 주제 이름 (자유 텍스트) |
| `kakaoQuery` | 카카오 로컬 API에 넘길 검색어 (지역+업종 형태 추천, 예: "홍대 이자카야") |
| `naverKeywords` | 이 주제의 트렌드를 잴 검색어 묶음(배열). 유사어를 여러 개 넣으면 그룹 전체 지수로 합산됨 |

## 실행

### 1. 통합 파이프라인 (실사용)

```bash
npm run collect
# 다른 topics 파일이나 채택 개수를 바꾸고 싶으면:
npm run collect -- --topics data/topics.json --top 2
```

동작 순서:
1. 모든 주제의 `naverKeywords`를 네이버 검색어트렌드 API 한 번의 호출로 조회 (그룹 배열로 묶어서 쿼터 절약)
2. 최근 지수와 "직전 평균 대비 모멘텀"을 계산해 상승/보합/하락 라벨링, 모멘텀 기준 랭킹
3. 각 주제의 `kakaoQuery`로 카카오 로컬 API 호출 → 장소 후보(상호명/카테고리/주소/링크) 수집
4. 상위 `--top`개(기본 1개) 주제를 "채택"해서 결과 저장

콘솔에 랭킹이 출력되고, 마지막에 결과 파일 경로가 찍힌다:

```
=== 주제 랭킹 (모멘텀 순) ===
1. 강남 야장 | 최근지수 55.2 | 모멘텀 +13.9 (상승) | 장소 8건
...

✔ 전체 결과: output/<timestamp>-candidates.json
✔ 채택된 소재(1개) → content-generator --input으로 바로 사용 가능:
  - output/<timestamp>-adopted-1-강남-야장.txt
```

- `output/*-candidates.json`: 전체 주제/트렌드/장소 데이터 (감사·디버깅용)
- `output/*-adopted-*.txt`: **다음 단계(`content-generator`)의 `--input`으로 바로 넣는 파일**

### 2. 개별 API 스모크 테스트 (연동 확인용)

```bash
npm run test:kakao -- --query "강남 야장"   # 카카오 로컬 API 단독 호출
npm run test:naver-trend                    # 네이버 검색어트렌드 단독 호출
```

## 다음 단계로 이어서 확인 (당시 기준 — 지금의 content-generator는 텍스트 입력을 받지 않는다)

```bash
cd ../content-generator
npm run generate -- --input ../research-collector/output/<위에서-나온-adopted-파일명>.txt --handle <내 인스타 핸들> --out output/test.json
```

자세한 사용법은 `../content-generator/README.md` 참고.
