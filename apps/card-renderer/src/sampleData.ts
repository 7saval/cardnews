import type { CardNewsData } from '../../../shared/schemas/card-news';
import example from '../../../shared/schemas/card-news.example.json';
import stress from '../samples/stress.json';

// JSON import는 series_type 같은 유니언이 string으로 넓혀지므로 스키마 타입으로 단언한다.
// 두 파일 모두 validate-card-news.js 검증을 통과하는 데이터다 (stress는 npm run render -- --data로 확인).

/** 실제 보조금24 데이터 5건으로 만든 기본 샘플 (content-generator 테스트와 같은 파일) */
export const sampleCardNews = example as CardNewsData;

/** 넘침 확인용: 아주 긴 정책명·기관명·대상, 아주 짧은 문구, D-day/오늘 마감 배지 */
export const stressCardNews = stress as CardNewsData;

export const BUILTIN_SAMPLES: Record<string, CardNewsData> = {
  '': sampleCardNews,
  '__stress': stressCardNews,
};
