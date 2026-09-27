# content-generator

리서치 원본 텍스트(장소/트렌드 정보)를 LLM에 넣어서 `shared/schemas/card-news.ts`
스키마에 맞는 카드뉴스 JSON(제목/카피/카드별 문구)을 뽑아내는 CLI.
파이프라인의 2단계 — `research-collector`의 출력을 입력으로 받고, 출력은
`card-renderer`의 입력이 된다.

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

## 입력 파일 만들기

- `research-collector`가 만든 `output/*-adopted-*.txt`를 그대로 써도 되고,
- 직접 텍스트 파일을 만들어도 된다. 형식은 `sample-input.txt` 참고 (장소별로 번호,
  카테고리, 주소, 참고 정보를 나열하는 자유 텍스트 — 엄격한 스키마는 없음).

## 실행

```bash
npm run generate -- --input <입력.txt> --handle <내 인스타 핸들> --out output/결과.json
```

- `--input` 생략 시 기본값 `sample-input.txt` 사용 (내장 테스트 데이터로 빠르게 확인하고 싶을 때)
- `--handle` 필수. LLM이 지어내면 안 되는 계정 정보라 여기서 직접 주입한다.
- `--out` 생략 시 `output/<타임스탬프>.json`에 저장

예시:

```bash
npm run generate -- --input ../research-collector/output/2026-09-27T07-29-13-981Z-adopted-1-강남-야장.txt --handle zinoo_travel --out output/test.json
```

## 동작 방식

1. Gemini(`ai.models.generateContent`)로 먼저 시도. 429/503이면 지수 백오프로 최대 3회 재시도
2. 그래도 실패하면 Claude Haiku로 자동 전환해서 같은 프롬프트로 재시도 (429/500/529 대상, 역시 최대 3회)
3. 스키마 검증 실패나 인증 오류 같은 우리 쪽 문제는 폴백하지 않고 즉시 실패 — 폴백이 진짜 버그를 가리지 않게 하기 위함

## 출력

- `output/<이름>.json` — `card-renderer`가 바로 읽을 수 있는 카드뉴스 JSON
- `output/<이름>.meta.json` — 이번 생성에 실제로 어느 프로바이더가 쓰였는지 기록
  (`{ provider, model, fellBack, generatedAt }`) — 콘솔에도 같은 정보가 출력됨

```
✔ 카드 8개짜리 카드뉴스 JSON을 생성했습니다: output/test.json
  provider: gemini / model: gemini-3.8-flash
  series_title: 강남 야장 투어
```

## 다음 단계로 이어서 확인

```bash
cd ../card-renderer
npm run render -- --data ../content-generator/output/test.json --out output/test
```

자세한 사용법은 `../card-renderer/README.md` 참고.
