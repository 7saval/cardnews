import type { CardNewsData } from '../../../shared/schemas/card-news';

// design-reference/places 스크린샷 내용을 참고해 만든 더미 데이터.
// 실제 서비스에서는 Phase 1 파이프라인(리서치 수집 + LLM 구조화)이 이 형태의 JSON을 생성한다.
export const sampleCardNews: CardNewsData = {
  series_title: '영등포 타임스퀘어 맛집',
  hook_line: '실패없는\n<영등포>\n타임스퀘어\n찐 맛집',
  source_handle: 'seoulhotple',
  cards: [
    {
      order: 1,
      place_name: '바이킹스워프',
      subtitle: '',
      caption: '랍스타와 해산물, 고기까지 무한으로 먹을 수 있는 곳',
      image_keyword: 'seafood buffet lobster on ice',
      address: '영등포구 영중로 15 타임스퀘어 5F',
    },
    {
      order: 2,
      place_name: '딘타이펑',
      subtitle: '',
      caption: '얇은 피에 육즙이 가득한 만두, 샤오롱바오',
      image_keyword: 'xiaolongbao bamboo steamer',
      address: '영등포구 영중로 15 타임스퀘어 4층 413',
    },
    {
      order: 3,
      place_name: '매드포갈릭',
      subtitle: '',
      caption: '마늘맛이 조화롭게 어우러지는 이탈리안 레스토랑',
      image_keyword: 'garlic steak italian restaurant plate',
      address: '영등포구 영중로 15 타임스퀘어 4F 402',
    },
    {
      order: 4,
      place_name: '이관복명장냉면',
      subtitle: '',
      caption: '물비빔냉면부터 윤기 좌르르 기름냉면까지',
      image_keyword: 'korean cold noodles naengmyeon bowl',
      address: '영등포구 영중로 15 지하1층 147-2호',
    },
  ],
  cta_card: {
    handle: 'zinoo_travel',
    cta_text: '미리 팔로우 해두시면\n필요할 때 분명 도움이 될 거예요.',
    hook_lines: [
      '당신의 취향과 트렌드가 만나는 순간',
      '서울 맛집을 픽해서 정리해드립니다',
    ],
  },
};
