# LLM 프로바이더 폴백(Gemini → Claude Haiku) 구현 계획

## 0. 배경

`content-generator`(리서치 원본 텍스트 → 카드뉴스 JSON 구조화)는 현재 Gemini(`gemini-3.8-flash`) 단일 프로바이더로 동작한다. 2026-09-27 작업 중 다음 두 가지를 확인했다:

1. `ai.interactions.create()`(신형 스트리밍 엔드포인트)의 SDK 재시도 로직 버그(`TypeError: unusable`)를 `ai.models.generateContent()`(구형 안정 엔드포인트)로 전환해 해결함
2. 이 과정에서 반복 테스트하다가 **Gemini 무료 티어의 일일 한도(`gemini-3.8-flash` 기준 20건/일)를 소진**해서, 정상적인 코드에도 불구하고 그날은 더 이상 생성이 안 되는 상황을 직접 겪음

이 두 번째 문제가 이번 계획의 출발점이다: 무료 한도를 다 쓰면 파이프라인이 그냥 멈춘다. 대안으로 "Gemini 소진 시 Claude Haiku로 자동 전환"을 검토했고, 아래 세 가지 근거로 진행하기로 했다(우선순위 순).

## 1. 근거 정리 (우선순위 순)

1. **가용성(주 근거)** — 무료 한도 소진/일시 장애로 파이프라인이 완전히 멈추는 상황을 막는다. 특히 프롬프트 튜닝처럼 하루에 여러 번 돌리는 개발 단계에서 오늘 실제로 겪은 문제.
2. **멀티 프로바이더 자동화 서사(포트폴리오)** — 단일 LLM 벤더 종속 없이 장애/한도 상황에 자동으로 대체 프로바이더로 전환하는 설계는 그 자체로 어필 포인트가 된다.
3. **비용 최소화(보조 근거, 효과는 작음)** — Claude Haiku 4.5 가격은 입력 $1/output $5 per 1M 토큰 기준 카드뉴스 1건당 약 8~13원 수준(계획서의 기존 추정 "수 원~수십 원"과 일치). Gemini 무료 20건/일을 우선 소진하는 게 산술적으로는 항상 더 싸지만, 실제 운영 시나리오(하루 1~2건 발행)에서는 애초에 20건 캡에 거의 안 걸리므로 **절감액 자체는 미미**하다. 즉 "돈을 아낀다"는 방향은 맞지만 이게 단독 근거였다면 구현 우선순위로 삼기엔 약했다 — 1번(가용성) 문제가 실제로 발생했기 때문에 지금 진행 가치가 있다.

## 2. 설계 원칙

- **Gemini가 항상 1순위.** 무료이고 이미 검증된 경로이므로, 정상 동작하는 한 계속 Gemini를 쓴다.
- **Haiku는 "Gemini를 쓸 수 없을 때"만 개입하는 폴백이다.** 상시 병행 호출(둘 다 불러서 비교)이 아니라, 실패 시에만 전환하는 단순 스위치로 시작한다.
- **폴백은 "프로바이더 장애/한도" 상황에만 발동해야 한다.** 우리 쪽 코드 문제(스키마 검증 실패, JSON 파싱 실패, 잘못된 인자 등)까지 조용히 Haiku로 넘겨버리면 진짜 버그가 가려진다 → 재시도 대상 상태 코드(429/503)로 명확히 한정하고, 그 외 에러는 기존처럼 즉시 실패시킨다.
- **어떤 프로바이더가 실제로 응답을 만들었는지 항상 로그로 남긴다.** 폴백이 실제로 얼마나 발동하는지 나중에 확인할 수 있어야 한다(포트폴리오 서술에도 필요한 데이터).
- **카드뉴스 JSON 스키마(`shared/schemas/card-news.ts`)는 프로바이더가 바뀌어도 동일해야 한다.** `card-renderer`는 어느 프로바이더가 만들었는지 신경 쓸 필요가 없다.

## 3. 아키텍처 변경

```
generate.js
├── generateWithGemini(rawMaterial)   # 기존 ai.models.generateContent() 로직 그대로 함수로 분리
├── generateWithHaiku(rawMaterial)    # 신규: @anthropic-ai/sdk, claude-haiku-4-5
└── main()
    1. withRetry(() => generateWithGemini(...))  // 429/503만 재시도(기존 로직 유지)
    2. 재시도 소진 & 마지막 에러가 429/503이면
       → console.warn("Gemini 사용 불가, Haiku로 전환")
       → withRetry(() => generateWithHaiku(...))
    3. 그 외 에러(404, 인증 실패, JSON 파싱 실패 등)는 폴백하지 않고 즉시 throw
    4. 결과 JSON 저장 시 실제 사용된 provider를 콘솔에 출력 + 결과 파일 옆에 sidecar 메타(.meta.json 등)로 남김 (card-news.ts 스키마 자체엔 필드 추가 안 함)
```

## 4. 구현 체크리스트

- [x] `apps/content-generator/package.json`에 `@anthropic-ai/sdk`(^0.128.0) + `zod`(^4.6.5) 의존성 추가
- [x] `apps/content-generator/.env.example`, `.env`에 `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` 추가
- [x] `generate.js`의 기존 Gemini 호출부를 `generateWithGemini(rawMaterial)` 함수로 분리 (로직 동일, 동작 변경 없음)
- [x] `generateWithHaiku(rawMaterial)` 함수 작성
  - 모델: `claude-haiku-4-5`
  - 시스템 프롬프트: 기존 `SYSTEM_PROMPT`(`prompt.js`) 재사용
  - 구조화 출력: claude-api 스킬 typescript/claude-api/tool-use.md 확인 후 `client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })` 사용(Zod 스키마 권장 경로). `CARD_NEWS_RESPONSE_SCHEMA`(JSON Schema, Gemini용)와 별도로 `CARD_NEWS_ZOD_SCHEMA`(Zod, Haiku용)를 `prompt.js`에 병행 정의
  - thinking 파라미터 생략 (단순 추출 작업)
- [x] `main()`에 폴백 오케스트레이션 추가: Gemini `withRetry` 실패 시 마지막 에러 상태코드가 429/503일 때만 Haiku로 전환, 그 외는 즉시 실패. Anthropic 쪽 재시도 대상 상태코드는 429/500/529(overloaded)로 별도 관리(Gemini의 429/503과 다름 — claude-api 스킬 error-codes.md 기준)
- [x] 실제 사용된 provider를 콘솔 로그(`provider: gemini` / `provider: haiku (Gemini 폴백)`)로 출력
- [x] 결과 저장 시 사이드카 메타 파일(`<output>.meta.json` — `{ provider, model, fellBack, generatedAt }`)로 기록. `shared/schemas/card-news.ts` 스키마는 변경하지 않음
- [x] 로컬 검증
  - [x] Gemini 정상 동작 시 기존과 동일하게 동작하는지 확인 — 코드는 그대로 함수로 옮기기만 해서 회귀 위험은 낮으나, 오늘 무료 할당량이 소진된 상태라 실제 성공 응답으로 직접 재확인은 못함(다음날 할당량 리셋 후 확인 필요)
  - [x] Gemini 할당량 소진(429) 상태에서 실제로 Haiku로 전환되는지, 결과 JSON이 `assertValidCardNewsData` 검증을 통과하는지 확인 — `output/fallback-success-test.json`으로 확인, `card-renderer`까지 렌더링해서 PNG 출력까지 검증
- [x] `_docs/insta-cardnews-automation-plan.md` 기술스택 표(3번 섹션)·체크리스트(6번 섹션) 갱신

## 5. 완료 기준

- Gemini가 정상일 때는 기존과 동일하게 무료로 동작
- Gemini 429/503(무료 한도 소진 또는 일시 장애) 시 사람 개입 없이 Haiku로 자동 전환되어 카드뉴스 JSON이 끊김 없이 생성됨
- 실행 로그만 보고 이번 생성이 어느 프로바이더로 이루어졌는지 바로 알 수 있음
- Gemini/Haiku 어느 쪽으로 생성되든 `card-renderer`가 그대로 소비 가능(스키마 변경 없음)

## 6. 범위 밖 (지금 안 하는 것)

- Gemini/Haiku 동시 호출 후 결과 비교·품질 평가 (필요해지면 별도 논의)
- 프로바이더별 프롬프트 최적화 (일단 동일 프롬프트 재사용, 품질 차이 발생 시 추후 대응)
- 3번째 프로바이더 추가 (지금은 2-프로바이더 폴백까지만)
