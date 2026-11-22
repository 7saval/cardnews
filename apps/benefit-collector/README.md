# benefit-collector

**파이프라인 1단계 — 혜택 고르기.** 공공 API(보조금24)에서 혜택을 받아 정규화하고, 이번 회차에 쓸 N건(기본 5건)을 골라
`shared/schemas/benefit.ts`의 `CollectedBenefits` JSON(`*-adopted.json`)으로 저장하는 CLI.
출력은 `content-generator`의 입력이 된다. 발행 기록(`data/published.json`)도 이 앱이 관리한다.

선별 규칙의 배경은 `_docs/topic-pivot-benefits-plan.md` §3.1(조사 결과), §6.1(선별 규칙) 참고.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `src/collect.js` | **실행 진입점** (`npm run collect`). 원본 로드 → 정규화 → 필터 → 발행 기록 제외 → 카테고리 순환 → AI 점수 → 상위 N건 저장까지 전체 흐름을 잇는다 |
| `src/mark-published.js` | **발행 기록 CLI** (`npm run mark-published`). 게시한 회차의 `adopted.json`을 받아 `data/published.json`에 추가한다 |
| `src/test-gov24.js` | 조사용 스크립트 (`npm run test:gov24`). 보조금24 응답 전체를 집계해 필드 채움 비율·신청기한 형식·분야 분포를 출력 (Phase 0 조사 근거) |
| `src/lib/gov24.js` | 보조금24 API 클라이언트. `serviceList`·`supportConditions`를 페이지 단위로 받아 `output/raw/`에 24시간 캐시 |
| `src/lib/normalize-gov24.js` | API 원본 행 → 공통 형식(`BenefitRecord`) 변환. 지역(전국/서울/자치구) 판정, 원문(`raw`) 보존 |
| `src/lib/period.js` | 신청기한 자유 텍스트("2026.10.1.~10.31.", "상시신청" 등)를 상시/기간/불명으로 분류하고 마감일을 뽑는다 |
| `src/lib/select.js` | API·AI를 부르지 않는 순수 규칙: 후보 필터(상시·개인·19~34세·지역·이름 길이), 카테고리 순환 순서, 최종 순위 |
| `src/lib/relevance.js` | AI 관련성 점수. 프롬프트·응답 스키마, 30건 묶음 질의, 빠진 항목 재질의, `source_id@수정일시` 키 캐시 |
| `src/lib/llm.js` | AI 호출 공통부. 1순위(`LLM_PRIMARY`, 기본 Claude Haiku) → 일시적 오류·시간 초과면 다른 쪽(Gemini)으로 폴백, 재시도 규칙 |
| `src/lib/history.js` | 발행 기록 읽기·추가·저장 (`data/published.json`) |
| `data/published.json` | **발행 기록 (저장소에 커밋).** 올린 혜택의 `source_id`·카테고리·발행일. 다음 수집에서 제외·카테고리 순환에 쓰인다 |
| `test/*.test.js` | 단위 테스트 — `period`(신청기한), `select`(필터·순환·순위), `relevance`(점수 파싱·캐시·재질의, AI 대역), `history`(기록), `llm-timeout`(타임아웃·폴백 판정) |
| `.env.example` | 필요한 환경변수 목록 |

실행하면 생기는 파일 (`output/`, git 제외):

| 파일 | 내용 |
|---|---|
| `output/raw/` | 보조금24 원본 캐시 (24시간) |
| `output/<YYYYMMDD-HHmmss>-<series>-adopted.json` | **선정 결과** — content-generator `--input`으로 넘길 파일 |
| `output/<같은 이름>.scores.json` | 후보 전체의 점수와 이유 (뽑힌 것 표시, 검수용) |
| `output/relevance-cache.json` | AI 점수 캐시. GitHub Actions에서는 artifact `relevance-cache`로 실행 사이에 넘긴다 |

## 정상 동작 순서

### 1. 준비 (처음 한 번)

```bash
npm install
cp .env.example .env   # 값 채우기
```

- `DATA_GO_KR_SERVICE_KEY` — 공공데이터포털 "행정안전부_대한민국 공공서비스(혜택) 정보" 인증키.
  Decoding 키를 넣는다 (Encoding 키를 넣어도 코드가 디코딩해서 쓴다)
- `ANTHROPIC_API_KEY` — AI 점수용 (기본 1순위). content-generator와 같은 키를 써도 된다
- `GEMINI_API_KEY` — 1순위가 과부하·시간 초과일 때 쓰는 폴백 (없어도 1순위가 정상이면 돈다)
- `LLM_PRIMARY` — (선택) `haiku`(기본) 또는 `gemini`

### 2. 연결 확인 (AI 없이)

```bash
npm run collect -- --dry-run      # 보조금24를 받아 카테고리별 후보 수만 출력, AI 호출 없음
npm test                          # 규칙 단위 테스트 (API·AI 호출 없음)
```

`--dry-run`에서 카테고리별 후보 수가 나오면 API 키와 필터가 정상이다.

### 3. 실제 선정

```bash
npm run collect                                   # 카테고리 시리즈, 순환 순서대로 5건
npm run collect -- --category 주거·자립 --count 4  # 카테고리·건수 지정
npm run collect -- --series district --region 동작구  # 자치구 시리즈
npm run collect -- --refresh                      # 원본을 API에서 다시 받기 (기본: 24시간 캐시)
npm run collect -- --out output/weekly-adopted.json  # 저장 경로 지정 (루트 pipeline이 사용)
```

마지막 줄의 `✔ … 5건을 골랐습니다: <경로>`가 다음 단계(content-generator) 입력이다.
보통은 이 앱을 따로 돌리지 않고 루트에서 `npm run pipeline -- --handle hotsoozip --collect`로 2·3단계까지 한 번에 돌린다.

### 4. 게시한 뒤 발행 기록

```bash
npm run mark-published -- --input <결과 폴더>/adopted.json
npm run mark-published -- --input <파일> --date 2026-10-20   # 발행일 지정 (기본: 오늘 KST)
git add data/published.json && git commit -m "chore: 발행 기록" && git push
```

기록된 혜택은 다음 수집부터 빠지고, 그 카테고리는 순환 순서의 맨 뒤로 간다.
**push까지 해야** GitHub Actions의 다음 주간 실행에 반영된다.

## 선별 방식

1. **원본 로드** — `serviceList`·`supportConditions` 전체(약 11,000건)를 받아 `output/raw/`에 24시간 캐시
2. **공통 조건** (`src/lib/select.js`의 `filterCandidates`)
   - 신청기한이 상시(`상시`·`연중`·`수시`)
   - 사용자구분에 `개인` 포함 — 사업주·법인 대상 제외
   - 대상 나이 범위가 19~34세와 겹침 (나이 조건 없음은 포함)
   - 정책명 50자 이하 — 카드에 다 안 들어가는 이름 제외
   - 지역: 카테고리 시리즈는 전국 + 서울특별시(산하 포함), 자치구 시리즈는 그 구만
   - 발행 기록에 있는 혜택 제외, 공백·구두점만 다른 같은 정책명은 하나만
3. **카테고리 순환** — 가장 오래 안 다룬 카테고리부터 시도한다. 농림축산어업은 순환에서 뺐다.
   후보가 N건 미만이거나 관련성 기준을 넘는 것이 N건 미만이면 다음 카테고리로 넘어간다
4. **AI 관련성 점수** (`src/lib/relevance.js`) — 후보마다 1~5점 두 개
   - `relevance`: 19~34세 개인이 실제로 받을 수 있고 쓸모 있는가
   - `obscurity`: 청년들이 잘 모를 법한가 (누구나 아는 대표 정책이면 낮다)
   - 30건씩 나눠 묻고, 응답에서 빠진 항목은 한 번 더 묻는다
   - `source_id@수정일시` 키로 캐시 — 원문이 안 바뀌면 다시 묻지 않는다
   - 1순위 AI가 과부하·시간 초과면 그 실행 동안은 폴백 AI로만 묻는다 (`src/lib/llm.js`)
5. **최종 N건** — `relevance` 4 이상 중 `relevance + obscurity` 합이 높은 순

## 발행 기록을 "발행 뒤에" 남기는 이유

수집이나 렌더 시점에 기록하면, 생성이 실패했거나 검수에서 탈락해 안 올린 회차의 혜택이 기록에 남아
다시는 후보로 안 나온다. 그래서 사람이 게시한 뒤 `mark-published`로 남긴다.
publisher가 생기면 Supabase `published_benefits` 테이블로 옮기고, 게시 성공 직후 자동 기록할 예정이다 (계획서 §6.1).
