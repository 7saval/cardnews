// 카드 색 테마. 사진 대신 카테고리(보조금24 서비스분야)별 그라디언트로 회차를 구분한다.
// 기본값은 로고와 같은 브랜드 그라디언트(코랄–오렌지, public/logos/hotsoozip_logo.svg).

export interface CardTheme {
  /** 배경 그라디언트 시작/끝 색 */
  from: string;
  to: string;
  /** 흰 패널 위 강조 글자색 (배경보다 어둡게 — 흰 바탕에서 읽혀야 한다) */
  ink: string;
  /** 흰 패널 위 옅은 강조 바탕 (캡션 박스) */
  soft: string;
}

export const BRAND_THEME: CardTheme = { from: '#ff4d5e', to: '#ff9a1f', ink: '#e2531f', soft: '#fff1e8' };

const CATEGORY_THEMES: Record<string, CardTheme> = {
  '고용·창업': BRAND_THEME,
  생활안정: { from: '#0fa38c', to: '#5cc98a', ink: '#0b7f6d', soft: '#e6f7f2' },
  '주거·자립': { from: '#4361ee', to: '#6ea8ff', ink: '#3049c9', soft: '#ebf0ff' },
  '보육·교육': { from: '#f59f00', to: '#ffc94d', ink: '#c27a00', soft: '#fff6e0' },
  '보건·의료': { from: '#1c8fd6', to: '#4fc3e8', ink: '#1572ad', soft: '#e5f4fc' },
  '행정·안전': { from: '#4b5d75', to: '#8798ad', ink: '#3d4d63', soft: '#eef1f5' },
  '임신·출산': { from: '#e8508f', to: '#ff8fb8', ink: '#c93a76', soft: '#fdeaf2' },
  '보호·돌봄': { from: '#7c4ddb', to: '#ad8bff', ink: '#6538c4', soft: '#f1ebff' },
  '문화·환경': { from: '#2e9e4f', to: '#7cc95e', ink: '#24803f', soft: '#eaf6ec' },
  농림축산어업: { from: '#8a6a3b', to: '#c19a5b', ink: '#73572e', soft: '#f6efe4' },
};

export function themeOf(category: string | null): CardTheme {
  return (category && CATEGORY_THEMES[category]) || BRAND_THEME;
}

export const gradientOf = (t: CardTheme) => `linear-gradient(160deg, ${t.from} 0%, ${t.to} 100%)`;

/**
 * 신청기한 배지 문구. 마감일이 없으면 상시, 있으면 생성 기준일(generated_at) 대비 D-day.
 * 날짜는 둘 다 `YYYY-MM-DD`라 UTC 자정으로 읽어 빼도 시간대 영향이 없다.
 */
export function periodBadge(periodEnd: string | null, baseDate: string): { label: string; urgent: boolean } {
  if (!periodEnd) return { label: '상시 신청', urgent: false };
  const days = Math.round((Date.parse(periodEnd) - Date.parse(baseDate)) / 86_400_000);
  if (days <= 0) return { label: '오늘 마감', urgent: true };
  return { label: `D-${days}`, urgent: days <= 7 };
}

/** "서울특별시 동작구" → "동작구" (커버 칩은 짧게) */
export const shortRegion = (region: string) => region.replace(/^서울특별시\s*/, '') || region;
