# content-generator

혜택 수집 결과(`shared/schemas/benefit.ts`)를 LLM에 넣어 카피를 만들고, 원문의 사실 필드와 합쳐
`shared/schemas/card-news.ts` 스키마의 카드뉴스 JSON을 만드는 CLI.
파이프라인의 2단계 — `benefit-collector`의 출력을 입력으로 받고, 출력은 `card-renderer`의 입력이 된다.

**LLM은 카피만 쓴다.** 정책명·기관·링크·신청기한은 코드가 원문에서 주입하고(`src/assemble.js`),
LLM이 쓴 문구의 숫자는 원문과 대조한다(`src/fact-check.js`). 설계 배경은
`_docs/topic-pivot-benefits-plan.md` §2, §6.2, §6.3 참고.

**Gemini(1순위, 무료) → Claude Haiku(폴백)** 2-프로바이더 구조. 설계 배경은
`_docs/llm-provider-fallback-plan.md` 참고.

## 준비

1. 의존성 설치

   ```bash
   npm install
   ```

2. `.env` 생성 (`.env.example` 참고) 후 아래 값 채우기

   ```
   GEMINI_API_KEY=
   GEMINI_MODEL=gemini-3.8-flash

   ANTHROPIC_API_KEY=
   ANTHROPIC_MODEL=claude-haiku-4-5
   ```

   - `GEMINI_API_KEY`는 필수. 이게 없으면 아예 실행이 안 된다.
   - `ANTHROPIC_API_KEY`는 Gemini가 429(무료 한도 소진)/503(과부하)일 때만 쓰이는 폴백용이라,
     당장 없어도 Gemini가 정상일 땐 문제없이 돌아간다. 다만 Gemini가 막히는 날엔
     이 키가 없으면 그 순간 실패하니, 안정적으로 쓰려면 미리 채워두는 걸 권장.

## 입력 파일

`benefit-collector`가 만든 `output/*-adopted.json`(`CollectedBenefits`). 형식은
`shared/schemas/collected-benefits.example.json` 참고 — 실제 보조금24 데이터 5건으로 만든 샘플이다.

## 실행

```bash
npm run generate -- --input <수집결과.json> --handle <내 인스타 핸들> --out output/결과.json
```

- `--input` 생략 시 `shared/schemas/collected-benefits.example.json` 사용 (샘플로 빠르게 확인할 때)
- `--handle` 필수. LLM이 지어내면 안 되는 계정 정보라 여기서 직접 주입한다.
- `--out` 생략 시 `output/<타임스탬프>.json`에 저장
- `--today YYYY-MM-DD` 생략 시 오늘(KST). 마감일 확인과 `generated_at`에 쓴다

## 동작 방식

1. 수집 결과를 검증하고(`shared/schemas/validate-benefits.js`) 항목별 원문을 LLM 입력으로 만든다.
   원문이 1,500자를 넘으면 LLM 입력에서만 자른다 (fact-check는 전체 원문과 대조)
2. LLM 호출 — Gemini(`ai.models.generateContent`)로 먼저 시도. 429/503이면 지수 백오프로 최대 3회 재시도,
   그래도 실패하면 Claude Haiku로 자동 전환 (429/500/529 대상, 역시 최대 3회)
3. **assemble** — LLM 카피와 원문을 `source_id`로 합친다. 카드 순서·개수는 수집 결과를 따르고,
   LLM이 카드를 빠뜨리거나 없는 ID를 지어내거나 중복으로 쓰면 에러
4. 카드뉴스 스키마 검증(`shared/schemas/validate-card-news.js`)
5. **fact-check** — LLM이 쓴 문구(subtitle, caption, benefit, target, 회차 카피)의 숫자가 원문에 있는지
   (값, 단위)로 대조. 카드 수와 "N선"이 맞는지, 마감일이 지나지 않았는지도 본다
6. 3·5에서 문제가 나오면 **문제 목록과 이전 응답을 넣어 1회 재생성**. 그래도 실패하면
   `<out>.failed.json`을 남기고 종료 코드 1로 끝낸다 — 틀린 정보를 내보내는 것보다 낫다

스키마 검증 실패나 인증 오류 같은 우리 쪽 문제는 폴백·재생성하지 않고 즉시 실패한다.

fact-check가 못 잡는 것(숫자 없는 거짓말 "무료"·"누구나", 한글 수사 "두 배", 숫자는 맞는데 다른 조건에
붙인 경우)은 발행 전 사람이 검수한다.

## 출력

- `output/<이름>.json` — `card-renderer`가 바로 읽을 수 있는 카드뉴스 JSON
- `output/<이름>.meta.json` — 프로바이더·모델, 입력 파일, fact-check 시도별 결과
  (`{ provider, model, fellBack, generatedAt, input, factCheck: { passed, attempts } }`)
- `output/<이름>.failed.json` — 재생성 후에도 검증에 실패했을 때만. 에러 목록과 마지막 결과

```
✔ 카드 5개짜리 카드뉴스 JSON을 생성했습니다: output/benefits-test.json
  provider: gemini / model: gemini-3.8-flash
  fact-check: 통과 (1회 생성)
  series_title: 몰랐던 고용·창업 혜택 5선
```

## 테스트

```bash
npm test
```

`test/fact-check.test.js`(숫자 정규화·원문 대조), `test/assemble.test.js`(사실 필드 주입·카드 누락)를
`shared/schemas`의 실제 샘플로 돌린다.

## 다음 단계로 이어서 확인

```bash
cd ../card-renderer
npm run render -- --data ../content-generator/output/test.json --out output/test
```

자세한 사용법은 `../card-renderer/README.md` 참고.
