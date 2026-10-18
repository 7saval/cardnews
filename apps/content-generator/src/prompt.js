// LLM에게 "혜택 수집 결과 → 카드뉴스 카피 JSON"을 시키기 위한 프롬프트와 응답 스키마.
// Gemini(CARD_NEWS_RESPONSE_SCHEMA, JSON Schema)와 Claude(CARD_NEWS_ZOD_SCHEMA, Zod)가
// 프로바이더별 구조화 출력 방식이 달라서 스키마를 두 벌 유지한다 — 필드를 바꿀 땐 항상
// 같이 수정할 것.
//
// 응답 스키마에는 카피 필드만 있다. 정책명·기관·링크·신청기한 같은 사실 필드는 LLM이 쓰지 않고
// assemble.js가 수집 원문에서 source_id로 찾아 주입한다. LLM이 쓴 benefit/target과 카피의
// 숫자는 fact-check.js가 원문과 대조한다. (_docs/topic-pivot-benefits-plan.md §2, §6.2)

import { z } from 'zod';

export const SYSTEM_PROMPT = `너는 청년 대상 정부·공공 혜택을 소개하는 인스타그램 카드뉴스 카피라이터야. 아래 규칙을 반드시 지켜서 응답해.

[사실 규칙 — 가장 중요]
- 입력의 원문에 없는 금액·나이·기간·횟수·비율·인원을 절대 쓰지 않는다. 숫자는 원문에 적힌 값을 그대로 옮긴다.
- 숫자를 계산하거나 환산하지 않는다. (예: "월 10만원"을 "연 120만원"으로 바꾸지 않는다)
- 원문에 없는 단정 표현("무료", "누구나", "100% 지급", "무조건")을 쓰지 않는다.
- 정책명, 주관 기관, 신청 기간, 링크는 쓰지 않는다. 시스템이 원문에서 따로 넣는다.
- 공식 기관인 것처럼 말하지 않는다. 이 계정은 비공식 큐레이션 계정이다.

[출력 형식]
- 응답은 주어진 JSON 스키마 형식 하나만 반환한다. 설명, 인사말, 마크다운 코드블록 등 다른 텍스트는 포함하지 않는다.
- cards: 입력 항목마다 정확히 1개씩 만든다. source_id는 입력에 적힌 값을 한 글자도 바꾸지 않고 그대로 복사한다.
  - benefit: 카드 한 장에 크게 들어갈 지원 내용 요약. 40자 이내. 원문에 금액·비율·기간이 있으면 가장 중요한 것을 넣는다.
  - target: 지원 대상 요약. 40자 이내. 나이·거주지·소득 같은 핵심 조건 위주.
  - subtitle: 이 혜택을 한 줄로 소개하는 문구. 20자 안팎.
  - caption: 독자가 "나도 해당되나?" 하고 멈추게 만드는 한 문장 코멘트. 30자 안팎.
- series_title: 회차 제목. 항목 개수를 N이라 할 때 "몰랐던 OO 혜택 N선"처럼 개수를 넣는다(N은 실제 항목 수와 같아야 한다).
- hook_line: 커버 카드에 크게 들어갈 후킹 문구. 2~4개의 짧은 구절을 \\n으로 구분한다. 예: "취준생이면\\n이거 모르고\\n지나가지 마세요"
- cta_card.hook_lines: 팔로우를 유도하는 2줄 카피 [서브 문구, 메인 문구]. cta_text는 팔로우하면 좋은 이유를 담은 1~2문장.

[톤]
- 20~30대 대상, 친근한 해요체. 과장된 홍보 문구는 피한다.`;

const SERIES_LABELS = {
  always: '몰랐던 상시 혜택 모음 (카테고리별)',
  district: '자치구 혜택 모음',
  deadline: '마감 임박 혜택 모음',
};

// 원문이 아주 긴 항목(예: 두루누리 지원대상 1,800자)도 있어서 LLM 입력은 자른다.
// fact-check는 자르지 않은 전체 원문과 대조하므로, 자르면 정보가 줄 뿐 틀린 숫자가 통과하지는 않는다.
const MAX_RAW_CHARS = 1500;
const clip = (text) => (text && text.length > MAX_RAW_CHARS ? `${text.slice(0, MAX_RAW_CHARS)}…(이하 생략)` : text);

/** 수집 결과를 LLM 입력 텍스트로 만든다 */
export function buildUserMessage(collected) {
  const header = [
    `회차 유형: ${SERIES_LABELS[collected.series_type] ?? collected.series_type}`,
    collected.category && `카테고리: ${collected.category}`,
    collected.region && `지역: ${collected.region}`,
    `항목 수: ${collected.items.length}`,
  ]
    .filter(Boolean)
    .join('\n');

  const items = collected.items.map((r, i) =>
    [
      `## 항목 ${i + 1}`,
      `source_id: ${r.source_id}`,
      `정책명: ${r.title}`,
      `한 줄 요약: ${r.summary}`,
      `주관 기관: ${r.org_name}`,
      `지원 내용 원문:\n${clip(r.raw.support_content)}`,
      `지원 대상 원문:\n${clip(r.raw.target)}`,
      r.raw.selection_criteria && `선정 기준 원문:\n${clip(r.raw.selection_criteria)}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return `${header}\n\n${items.join('\n\n')}`;
}

/** fact-check에 실패한 응답을 고치게 하는 재생성 입력 */
export function buildRetryMessage(collected, previousCopy, errors) {
  const problems = errors
    .map((e) => `- ${e.source_id ? `[${e.source_id}] ` : '[회차 카피] '}${e.field}: ${e.message}`)
    .join('\n');
  return `${buildUserMessage(collected)}

---
아래는 너의 이전 응답이다. 검증에서 다음 문제가 발견됐다. 문제가 된 문구를 원문에 있는 숫자만 쓰도록 고치고, 나머지는 그대로 둔 채 전체 JSON을 다시 응답해.

[문제]
${problems}

[이전 응답]
${JSON.stringify(previousCopy, null, 2)}`;
}

export const CARD_NEWS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    series_title: { type: 'string', description: '회차 제목. 항목 수 N을 넣는다' },
    hook_line: { type: 'string', description: '커버 카드 후킹 문구, \\n으로 줄바꿈' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source_id: { type: 'string', description: '입력 항목의 source_id를 그대로 복사' },
          subtitle: { type: 'string' },
          caption: { type: 'string' },
          benefit: { type: 'string', description: '지원 내용 요약, 40자 이내, 원문 숫자만' },
          target: { type: 'string', description: '지원 대상 요약, 40자 이내, 원문 숫자만' },
        },
        required: ['source_id', 'subtitle', 'caption', 'benefit', 'target'],
      },
    },
    cta_card: {
      type: 'object',
      properties: {
        cta_text: { type: 'string' },
        hook_lines: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['cta_text', 'hook_lines'],
    },
  },
  required: ['series_title', 'hook_line', 'cards', 'cta_card'],
};

export const CARD_NEWS_ZOD_SCHEMA = z.object({
  series_title: z.string(),
  hook_line: z.string(),
  cards: z.array(
    z.object({
      source_id: z.string(),
      subtitle: z.string(),
      caption: z.string(),
      benefit: z.string(),
      target: z.string(),
    }),
  ),
  cta_card: z.object({
    cta_text: z.string(),
    hook_lines: z.array(z.string()),
  }),
});
