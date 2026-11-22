# content-generator

**파이프라인 2단계 — 문구 쓰기 + 사실 확인.** 혜택 선정 결과(`shared/schemas/benefit.ts`)를 AI에 넣어 카드 문구를 만들고,
원문의 사실 필드와 합쳐 `shared/schemas/card-news.ts` 형식의 카드뉴스 JSON을 만드는 CLI. 인스타 게시글(캡션)도 만든다.
`benefit-collector`의 출력(`*-adopted.json`)을 입력으로 받고, 출력은 `card-renderer`의 입력이 된다.

**AI는 문구만 쓴다.** 정책명·기관·링크·신청기한·신청 방법·문의처는 코드가 원문에서 옮기고(`src/assemble.js`),
AI가 쓴 문구의 숫자는 원문과 대조한다(`src/fact-check.js`). 설계 배경은 `_docs/topic-pivot-benefits-plan.md` §2, §6.2, §6.3.

**Claude Haiku(1순위) → Gemini(폴백)** 2-프로바이더 구조. `LLM_PRIMARY=gemini`로 순서를 되돌릴 수 있다.
2026-11-22까지는 Gemini가 1순위였는데, 몇 주째 매번 120초 타임아웃이라 바꿨다 (`_docs/llm-provider-fallback-plan.md` §7).

## 파일 구성

| 파일 | 역할 |
|---|---|
| `src/generate.js` | **실행 진입점** (`npm run generate`). AI 호출(재시도·폴백) → assemble → 스키마 검증 → fact-check → 실패 시 1회 재생성 → JSON·메타·캡션 저장 |
| `src/prompt.js` | AI 지시문(시스템 프롬프트), 입력 메시지·재생성 메시지 조립, 응답 스키마 두 벌(Gemini용 JSON Schema, Claude용 Zod — 필드를 바꿀 땐 같이 수정) |
| `src/assemble.js` | AI 문구 + 원문 → 카드뉴스 JSON. 사실 필드 주입, 카드 순서·개수는 선정 결과를 따름. AI가 카드를 빠뜨리거나 없는 ID를 만들면 에러. 신청 방법·문의처 표시 문구 정리(`applyMethodOf`, `contactOf`) |
| `src/fact-check.js` | 원문 대조 검증. AI가 쓴 필드의 숫자를 (값, 단위)로 정규화해 원문에 있는지 확인, 카드 수와 "N선" 일치, 마감일 경과 여부, 신청·문의 필드 재확인. `checkFreshness()`(발행 직전 재확인용, 아직 미사용) |
| `src/caption.js` | 카드뉴스 JSON → 인스타 캡션. 혜택별 정책명·혜택·대상·기한·문의·원문 링크, 비공식 안내, 출처, 해시태그. AI를 거치지 않음. 2,200자 넘으면 실패 |
| `test/fact-check.test.js` | 숫자 정규화·원문 대조 (20개) |
| `test/assemble.test.js` | 사실 필드 주입·카드 누락·중복·신청/문의 정리 (8개) |
| `test/caption.test.js` | 캡션 구성·해시태그·길이 제한 (5개) |
| `.env.example` | 필요한 환경변수 목록 |

실행하면 생기는 파일 (`output/`, git 제외):

| 파일 | 내용 |
|---|---|
| `output/<이름>.json` | **카드뉴스 JSON** — `card-renderer`가 바로 읽는다 |
| `output/<이름>.meta.json` | 어느 AI·모델이 만들었는지, 폴백 여부, fact-check 시도별 결과 (`{ provider, model, fellBack, generatedAt, input, factCheck }`) |
| `output/<이름>.caption.txt` | 게시글 본문 |
| `output/<이름>.failed.json` | 재생성 후에도 검증에 실패했을 때만. 에러 목록과 마지막 결과 |

## 정상 동작 순서

### 1. 준비 (처음 한 번)

```bash
npm install
cp .env.example .env   # 값 채우기
```

```
LLM_PRIMARY=haiku
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
```

- 1순위 프로바이더의 키는 필수 (기본은 `ANTHROPIC_API_KEY`). 키가 무효(401)면 폴백하지 않고 바로 실패한다.
- 폴백 쪽 키(기본은 `GEMINI_API_KEY`)는 1순위가 과부하·시간 초과일 때만 쓰인다. 없어도 1순위가 정상이면
  돌아가지만, 1순위가 막히는 날엔 그 순간 실패하니 채워 두는 걸 권장.

### 2. 규칙 확인 (AI 없이)

```bash
npm test   # assemble·fact-check·caption 단위 테스트 33개, API 호출 없음
```

### 3. 샘플로 생성해 보기 (AI 호출)

```bash
npm run generate -- --handle hotsoozip --out output/test.json
```

`--input`을 생략하면 `shared/schemas/collected-benefits.example.json`(실제 보조금24 데이터 5건 샘플)을 쓴다.
아래처럼 나오면 키·AI·검증이 모두 정상이다.

```
Claude(claude-haiku-4-5) 호출 중...
✔ 카드 5개짜리 카드뉴스 JSON을 생성했습니다: output/test.json
  provider: haiku / model: claude-haiku-4-5
  fact-check: 통과 (1회 생성)
  series_title: 몰랐던 고용·창업 혜택 5선
```

### 4. 실제 선정 결과로 생성

```bash
npm run generate -- --input ../benefit-collector/output/<선정결과>-adopted.json --handle hotsoozip --out output/result.json
```

- `--handle` 필수. AI가 지어내면 안 되는 계정 정보라 여기서 직접 넣는다.
- `--out` 생략 시 `output/<타임스탬프>.json`
- `--today YYYY-MM-DD` 생략 시 오늘(KST). 마감일 확인과 `generated_at`에 쓴다

보통은 루트의 `npm run pipeline`이 이 단계를 대신 돌린다.

### 5. 다음 단계 — 카드 이미지로

```bash
cd ../card-renderer
npm run render -- --data ../content-generator/output/result.json   # → card-renderer/output/benefit/result
```

## 동작 방식

1. 선정 결과를 검증하고(`shared/schemas/validate-benefits.js`) 항목별 원문을 AI 입력으로 만든다.
   원문이 1,500자를 넘으면 AI 입력에서만 자른다 (fact-check는 전체 원문과 대조)
2. **AI 호출** — 1순위(기본 Claude Haiku, `messages.parse` 구조화 출력)로 먼저 시도. 일시적 오류
   (Haiku 429/500/529, Gemini 429/500/503)면 지수 백오프로 최대 3회 재시도, 그래도 실패하거나 시간 초과면
   다른 프로바이더로 자동 전환. 재생성 때는 이미 폴백한 프로바이더를 건너뛴다
3. **assemble** — AI 문구와 원문을 `source_id`로 합친다. 카드 순서·개수는 선정 결과를 따르고,
   AI가 카드를 빠뜨리거나 없는 ID를 지어내거나 중복으로 쓰면 에러
4. 카드뉴스 스키마 검증(`shared/schemas/validate-card-news.js`)
5. **fact-check** — AI가 쓴 문구(subtitle, caption, benefit, target, details, 회차 문구)의 숫자가 원문에 있는지
   (값, 단위)로 대조. 카드 수와 "N선"이 맞는지, 마감일이 지나지 않았는지도 본다
6. 3·5에서 문제가 나오면 **문제 목록과 이전 응답을 넣어 1회 재생성**. 그래도 실패하면
   `<out>.failed.json`을 남기고 종료 코드 1로 끝낸다 — 틀린 정보를 내보내는 것보다 낫다
7. JSON·메타·캡션 저장

스키마 검증 실패나 인증 오류 같은 우리 쪽 문제는 폴백·재생성하지 않고 즉시 실패한다.

fact-check가 못 잡는 것(숫자 없는 거짓말 "무료"·"누구나", 한글 수사 "두 배", 숫자는 맞는데 다른 조건에
붙인 경우)은 발행 전 사람이 검수한다. 반대로 같은 값의 다른 표기("100분의 20" ↔ "20%")는 맞는 문구인데도
틀렸다고 잡아서 재생성이 한 번 더 일어난다 (계획서 `_docs/2026-11-14-plan.md` §2.3, 미해결).
