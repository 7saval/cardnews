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

`src/sampleData.ts`의 내장 샘플 데이터로 커버/콘텐츠/CTA 카드 3종을 화면에서 바로 확인할 수 있다.
레이아웃을 손보거나 새 카드 타입을 만들 때 이 모드로 확인하면서 작업.

### 2. PNG로 렌더링 (실사용)

```bash
# 내장 샘플 데이터로 렌더링 (output/ 폴더에 저장)
npm run render

# content-generator가 만든 실제 JSON으로 렌더링
npm run render -- --data ../content-generator/output/test.json --out output/test
```

- `--data` 생략 시 내장 샘플 데이터 사용
- `--out` 생략 시 `output/`에 저장

결과는 `1-cover.png`, `2-<장소명>.png`, ..., `N-cta.png` 순서로 저장된다.
탐색기나 VSCode에서 바로 더블클릭해서 미리볼 수 있음.

## 카드 구성

- `CoverCard.tsx`: 상단 말풍선 박스 + 하단 대형 오버레이 후킹 문구
- `ContentCard.tsx`: 좌상단 넘버링 + 제목 + 본문 캡션 (장소별로 1장씩, JSON의 `cards` 배열 순서대로)
- `FollowCTACard.tsx`: 프로필 카드 + 팔로우 유도 문구 (JSON의 `cta_card`)

레이아웃 스펙 원본은 `../../design-reference/spec.md` 참고.

## 이전 단계에서 이어서 확인

`content-generator`에서 방금 생성한 JSON을 렌더링하고 싶다면:

```bash
cd ../content-generator
npm run generate -- --input <입력.txt> --handle <내 인스타 핸들> --out output/test.json
cd ../card-renderer
npm run render -- --data ../content-generator/output/test.json --out output/test
```
