# benefit-collector

공공 API(보조금24)에서 혜택을 받아 정규화하고, 이번 회차에 쓸 N건을 골라
`shared/schemas/benefit.ts`의 `CollectedBenefits` JSON으로 저장하는 CLI.
파이프라인의 1단계 — 출력은 `content-generator`의 입력이 된다.

선별 규칙의 배경은 `_docs/topic-pivot-benefits-plan.md` §3.1(조사 결과), §6.1(선별 규칙) 참고.

## 준비

```bash
npm install
```

`.env` 생성 (`.env.example` 참고):

- `DATA_GO_KR_SERVICE_KEY` — 공공데이터포털 "행정안전부_대한민국 공공서비스(혜택) 정보" 인증키.
  Decoding 키를 넣는다 (Encoding 키를 넣어도 코드가 디코딩해서 쓴다)
- `GEMINI_API_KEY` — 관련성 점수용. content-generator와 같은 키를 써도 된다
- `ANTHROPIC_API_KEY` — Gemini가 429/503일 때만 쓰는 폴백 (없어도 Gemini가 정상이면 돈다)

## 실행

```bash
npm run collect                                   # 카테고리 시리즈, 순환 순서대로 5건
npm run collect -- --category 주거·자립 --count 4  # 카테고리·건수 지정
npm run collect -- --series district --region 동작구
npm run collect -- --dry-run                      # LLM 없이 카테고리별 후보 수만 확인
npm run collect -- --out output/weekly-adopted.json  # 저장 경로 지정 (루트 pipeline이 사용)
npm run collect -- --refresh                      # 원본을 API에서 다시 받기 (기본: 24시간 캐시)
```

산출물:

- `output/<YYYYMMDD-HHmmss>-<series>-adopted.json` — content-generator `--input`으로 넘길 파일
- `output/<같은 이름>.scores.json` — 후보 전체의 점수와 이유 (뽑힌 것 표시, 사람 검수용)

발행(또는 렌더)까지 끝나면 이력에 기록한다. 기록된 혜택은 다음 수집부터 빠진다.

```bash
npm run mark-published -- --input output/20261018-153000-always-adopted.json
```

## 선별 방식

1. **원본 로드** — `serviceList`·`supportConditions` 전체(약 11,000건)를 받아 `output/raw/`에 24시간 캐시
2. **공통 조건** (`src/lib/select.js`의 `filterCandidates`)
   - 신청기한이 상시(`상시`·`연중`·`수시`)
   - 사용자구분에 `개인` 포함 — 사업주·법인 대상 제외
   - 대상 나이 범위가 19~34세와 겹침 (나이 조건 없음은 포함)
   - 정책명 50자 이하 — 카드에 다 안 들어가는 이름 제외
   - 지역: 카테고리 시리즈는 전국 + 서울특별시(산하 포함), 자치구 시리즈는 그 구만
   - 발행 이력에 있는 혜택 제외, 공백·구두점만 다른 같은 정책명은 하나만
3. **카테고리 순환** — 가장 오래 안 다룬 카테고리부터 시도한다. 농림축산어업은 순환에서 뺐다.
   후보가 N건 미만이거나 관련성 기준을 넘는 것이 N건 미만이면 다음 카테고리로 넘어간다
4. **LLM 관련성 점수** (`src/lib/relevance.js`) — 후보마다 1~5점 두 개
   - `relevance`: 19~34세 개인이 실제로 받을 수 있고 쓸모 있는가
   - `obscurity`: 청년들이 잘 모를 법한가 (누구나 아는 대표 정책이면 낮다)
   - 30건씩 나눠 묻고, 응답에서 빠진 항목은 한 번 더 묻는다
   - `source_id@수정일시` 키로 `output/relevance-cache.json`에 캐시 — 원문이 안 바뀌면 다시 묻지 않는다
5. **최종 N건** — `relevance` 4 이상 중 `relevance + obscurity` 합이 높은 순

## 발행 이력

`data/published.json` (저장소에 커밋한다 — GitHub Actions 실행 사이에도 이어지게).
publisher가 생기면 Supabase `published_benefits` 테이블로 옮길 예정이다 (계획서 §6.1).
수집 시점이 아니라 발행 뒤에 기록하는 이유: 수집만 하고 생성이 실패한 회차의 혜택이 이력에 남아
다시 안 나오는 일을 막기 위해서다.

## 테스트

```bash
npm test
```

`test/period.test.js`(신청기한 분류), `test/select.test.js`(필터·순환·순위),
`test/relevance.test.js`(점수 파싱·캐시·재질의, LLM 대역 사용), `test/history.test.js`(이력 기록).
API나 LLM을 부르지 않는다.

## 조사 스크립트

```bash
npm run test:gov24   # Phase 0 전수 집계 (§3.1 표의 근거)
```
