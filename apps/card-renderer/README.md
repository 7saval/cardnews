# card-renderer

카드뉴스 JSON(`shared/schemas/card-news.ts` 스키마)을 React 컴포넌트로 렌더링한 뒤
Playwright로 스크린샷을 찍어 인스타그램 캐러셀용 PNG(1080x1350)를 뽑아내는 CLI.
파이프라인의 3단계(마지막) — `content-generator`의 출력을 입력으로 받는다.

## 준비

```bash
npm install
```

별도 `.env` 없음 — 외부 API 호출이 없는 순수 렌더링 단계라서.

## 실행

### 1. 미리보기 (브라우저에서 눈으로 확인)

```bash
npm run dev
# 콘솔에 뜨는 http://localhost:5173 주소를 브라우저로 열기
```

내장 샘플(`shared/schemas/card-news.example.json`, 실제 보조금24 데이터 5건)로 커버/콘텐츠/CTA 카드를
화면에서 바로 확인할 수 있다. 드롭다운의 **(넘침 확인 샘플)**은 `samples/stress.json` — 아주 긴 정책명·기관명,
아주 짧은 문구, D-day/오늘 마감 배지를 한 번에 본다.

상단 **데이터** 드롭다운에서 `content-generator/output/`의 산출물(최신순)을 고르면 그 JSON으로 바로 바꿔서
보여준다. URL로 직접 열어도 된다: `http://localhost:5173/?data=pipeline-test`
(`npm run pipeline -- --name <이름>`으로 만든 결과를 PNG 렌더링 없이 빠르게 확인할 때 유용).
산출물은 `vite.config.ts`의 개발 서버 전용 미들웨어(`/__outputs`)가 읽어서 넘겨준다.
레이아웃을 손보거나 새 카드 타입을 만들 때 이 모드로 확인하면서 작업.

### 2. PNG로 렌더링 (실사용)

```bash
# 내장 샘플 데이터로 렌더링 (output/benefit/sample에 저장)
npm run render

# 넘침 확인 샘플로 렌더링
npm run render -- --data samples/stress.json          # → output/benefit/stress

# content-generator가 만든 실제 JSON으로 렌더링
npm run render -- --data ../content-generator/output/test.json   # → output/benefit/test
```

- `--data` 생략 시 내장 샘플 데이터 사용
- `--out` 생략 시 `output/benefit/<JSON 파일 이름>`(샘플은 `sample`)에 저장. 맛집 시절 결과물(`output/` 바로 아래)과
  섞이지 않고, 회차마다 폴더가 따로 생긴다

결과는 `1-cover.png`, `2-<정책명>.png`, ..., `N-cta.png` 순서로 저장된다.

글자가 들어가는 칸은 `FitText`가 글자 크기를 줄여 맞추는데, 최소 크기로도 넘치면 **렌더가 실패**하고
넘친 문구를 출력한다. 잘린 정책명·지원 내용을 내보내지 않기 위해서다 — 문구를 줄이거나 그 항목을 빼고 다시 돌린다.
탐색기나 VSCode에서 바로 더블클릭해서 미리볼 수 있음.

## 카드 구성

- `CoverCard.tsx`: 카테고리(또는 자치구) 칩 + 대형 후킹 문구 + 회차 제목·건수
- `ContentCard.tsx`: 혜택 1건 — 카테고리·기한 배지 → 정책명 → 혜택(가장 크게) → 대상 → 코멘트 → 출처 기관
  (JSON의 `cards` 배열 순서대로 1장씩)
- `FollowCTACard.tsx`: 프로필 카드 + 팔로우 유도 문구 + 비공식 큐레이션·출처 표기 (JSON의 `cta_card`)
- `theme.ts`: 카테고리별 색, 기한 배지(상시/D-day) 계산
- `FitText.tsx`: 칸에 맞춰 글자 크기를 줄이는 박스

사진은 쓰지 않는다 — 배경은 카테고리별 그라디언트다. 레이아웃 스펙 원본은 `../../design-reference/spec.md` 참고.

## 이전 단계에서 이어서 확인

`content-generator`에서 방금 생성한 JSON을 렌더링하고 싶다면:

```bash
cd ../content-generator
npm run generate -- --input <수집결과.json> --handle <내 인스타 핸들> --out output/test.json
cd ../card-renderer
npm run render -- --data ../content-generator/output/test.json   # → output/benefit/test
```
