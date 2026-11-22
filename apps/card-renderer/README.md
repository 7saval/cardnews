# card-renderer

**파이프라인 3단계(마지막) — 카드 그리기.** 카드뉴스 JSON(`shared/schemas/card-news.ts`)을 React 컴포넌트로 그린 뒤
Playwright(자동 조작 브라우저)로 스크린샷을 찍어 인스타그램 캐러셀용 PNG(1080×1350)를 뽑는 CLI.
`content-generator`의 출력을 입력으로 받는다. 외부 API를 부르지 않아서 `.env`가 없다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `scripts/render.js` | **실행 진입점** (`npm run render`). Vite 개발 서버를 띄우고, Playwright로 카드별 페이지를 열어 PNG로 저장. JSON 스키마 검증, 글자 넘침 검사(넘치면 실패) |
| `src/main.tsx` | React 앱 시작점 |
| `src/App.tsx` | 화면 구성. 렌더 모드(`?card=cover` 등, render.js가 주입한 데이터로 카드 1장)와 미리보기 모드(전체 카드 갤러리 + 데이터 선택 드롭다운) |
| `src/components/CoverCard.tsx` · `.css` | **표지**: 카테고리(또는 자치구) 칩 + 대형 후킹 문구 + 회차 제목·건수 |
| `src/components/ContentCard.tsx` · `.css` | **혜택 카드 1장**: 카테고리·기한 배지 → 정책명 → 소제목 → 혜택(가장 크게) → 세부 항목 → 대상 → 신청·문의 → 코멘트 → 출처 기관. JSON의 `cards` 순서대로 |
| `src/components/FollowCTACard.tsx` · `.css` | **마무리 카드**: 프로필 + 팔로우 유도 문구 + 비공식 큐레이션·출처 표기 (JSON의 `cta_card`) |
| `src/components/CardChrome.tsx` | 모든 카드 공통 장식: 좌상단 계정 워터마크, 우상단 로고 배지 |
| `src/components/FitText.tsx` | 고정 크기 칸에 글자가 다 들어갈 때까지 글자 크기를 줄이는 박스. 최소 크기로도 넘치면 표시를 남겨 render.js가 실패시킨다 |
| `src/components/cards.css` | 카드 공통 스타일 (1080×1350 크기, 워터마크·배지 위치) |
| `src/theme.ts` | 카테고리별 배경 그라디언트·강조색, 기한 배지(상시 / D-day) 계산, 지역명 줄임 |
| `src/sampleData.ts` | 내장 샘플: 실제 보조금24 5건(`shared/schemas/card-news.example.json`), 넘침 확인용(`samples/stress.json`) |
| `src/App.css`, `src/index.css` | 미리보기 화면·기본 스타일 |
| `samples/stress.json` | 넘침 확인용 데이터 — 아주 긴 정책명·기관명·대상, 아주 짧은 문구, D-day/오늘 마감 배지 |
| `public/logo.png`, `public/logos/` | 카드에 찍히는 계정 로고 |
| `vite.config.ts` | Vite 설정. 개발 서버 전용 미들웨어 `/__outputs`로 `content-generator/output/`의 JSON을 미리보기에 넘긴다 |
| `index.html`, `tsconfig*.json`, `.oxlintrc.json` | 웹 앱 진입 HTML, TypeScript·린트 설정 |

실행하면 생기는 파일 (`output/`, git 제외): `output/benefit/<이름>/01-cover.png`, `02-<정책명>.png` … `NN-cta.png`.
루트 `npm run pipeline`으로 돌리면 같은 폴더에 `caption.txt`, `adopted.json`, `scores.json`, `card-news.json`도 모인다.

## 정상 동작 순서

### 1. 준비 (처음 한 번)

```bash
npm install
npx playwright install chromium   # PNG 저장에 쓰는 브라우저
```

### 2. 미리보기로 눈으로 확인

```bash
npm run dev
# 콘솔에 뜨는 http://localhost:5173 주소를 브라우저로 열기
```

- 처음엔 내장 샘플(실제 보조금24 5건)로 표지·혜택·마무리 카드가 전부 보인다.
- 상단 **데이터** 드롭다운에서 **(넘침 확인 샘플)**을 고르면 극단적인 길이의 문구를 한 번에 본다.
- 같은 드롭다운에서 `content-generator/output/`의 결과(최신순)를 고르면 그 JSON으로 바뀐다.
  URL로 직접 열어도 된다: `http://localhost:5173/?data=<이름>`
- 레이아웃을 손보거나 새 카드 타입을 만들 때 이 모드로 확인하면서 작업한다.

### 3. PNG로 저장

```bash
npm run render                                                    # 내장 샘플 → output/benefit/sample
npm run render -- --data samples/stress.json                      # 넘침 확인 → output/benefit/stress
npm run render -- --data ../content-generator/output/result.json  # 실제 결과 → output/benefit/result
npm run render -- --data <JSON> --out output/원하는-폴더            # 저장 위치 지정
```

- `--data` 생략 시 내장 샘플, `--out` 생략 시 `output/benefit/<JSON 파일 이름>`
- 글자가 칸에 안 들어가면 `FitText`가 크기를 줄이고, **최소 크기로도 넘치면 렌더가 실패**하며 넘친 문구를 출력한다.
  잘린 정책명·지원 내용을 내보내지 않기 위해서다 — 문구를 줄이거나 그 항목을 빼고 다시 돌린다.

보통은 루트의 `npm run pipeline`이 이 단계를 대신 돌린다.

### 4. 다음 — 검수와 게시

PNG와 `caption.txt`를 검수하고 인스타그램에 올린 뒤, `benefit-collector`의 `mark-published`로 기록한다 (루트 README 5·6단계).

## 디자인 메모

- 사진은 쓰지 않는다 — 배경은 카테고리별 그라디언트다 (맛집 주제 시절엔 가게 사진을 썼다).
- `details`(세부 항목)·`apply_method`(신청 방법)·`contact`(문의처)는 2026-11-14에 추가된 선택 필드라, 이전 회차 JSON도 그대로 그려진다.
- 문의처 전화번호는 줄이 바뀌어 끊기지 않게 마지막 번호 덩어리를 한 줄로 묶는다 (`ContactText`).
- 레이아웃 스펙 원본: `../../design-reference/spec.md`
