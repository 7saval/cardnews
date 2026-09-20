// Gemini에게 "원본 리서치 텍스트 → 카드뉴스 카피 JSON"을 시키기 위한 프롬프트와 응답 스키마.
//
// source_handle / cta_card.handle은 여기 스키마에 없다 — 그건 우리 계정 정보라 LLM이
// 지어내면 안 되는 값이고, generate.js가 --handle 인자로 받아 응답에 직접 주입한다.
// image_keyword는 남겨두되 image_url은 스키마에 없다 — 이미지 매칭은 Phase 3(image-matcher)의 몫.

export const SYSTEM_PROMPT = `너는 인스타그램 카드뉴스 카피라이터야. 아래 규칙을 반드시 지켜서 응답해.

- 입력으로 주어지는 장소 리서치 원본 텍스트를 바탕으로 카드뉴스 콘텐츠를 만든다.
- 응답은 반드시 주어진 JSON 스키마 형식 하나만 반환한다. 설명, 인사말, 마크다운 코드블록 등 다른 텍스트는 절대 포함하지 않는다.
- hook_line: 커버 카드에 큼직하게 들어갈 후킹 문구. 2~4개의 짧은 구절로 끊어서 각 구절 사이를 \\n로 구분한다. 예: "이 날씨\\n그냥 보낼 순\\n없잖아요?"
- cards: 입력에 주어진 장소 개수만큼 만든다. order는 1부터 순서대로. subtitle은 한 줄 소개, caption은 감성적인 한 문장 코멘트, image_keyword는 배경 이미지 검색에 쓸 영어 키워드(3~5단어).
- cta_card.hook_lines: 팔로우를 유도하는 2줄짜리 후킹 카피 [서브 문구, 메인 문구]. cta_text는 "미리 팔로우 해두면 좋은 이유"를 담은 1~2문장.
- 톤앤매너: 20~30대 타겟, 친근하고 감성적인 반말/구어체 카피. 과장된 홍보 문구는 피한다.`;

export const CARD_NEWS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    series_title: { type: 'string', description: '이 카드뉴스 시리즈의 제목' },
    hook_line: { type: 'string', description: '커버 카드 후킹 문구, \\n으로 줄바꿈' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer' },
          place_name: { type: 'string' },
          subtitle: { type: 'string' },
          caption: { type: 'string' },
          image_keyword: { type: 'string' },
          address: { type: 'string' },
        },
        required: ['order', 'place_name', 'subtitle', 'caption', 'image_keyword'],
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
