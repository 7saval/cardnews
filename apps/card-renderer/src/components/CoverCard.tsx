import './cards.css';
import './CoverCard.css';
import { CardChrome } from './CardChrome';
import { FitText } from './FitText';
import { BRAND_THEME, gradientOf, shortRegion } from '../theme';
import type { CardNewsData } from '../../../../shared/schemas/card-news';

const SERIES_BADGE: Record<CardNewsData['series_type'], string> = {
  always: '상시 신청 가능',
  district: '우리 구 혜택',
  deadline: '마감 임박',
};

/** 커버: 브랜드 그라디언트 위에 카테고리(또는 자치구) 칩 → 후킹 문구 → 회차 제목 + 건수 */
export function CoverCard({ data }: { data: CardNewsData }) {
  const lines = data.hook_line.split('\n');
  const chip = data.series_type === 'district' && data.region ? shortRegion(data.region) : data.category;

  return (
    <div className="card" style={{ background: gradientOf(BRAND_THEME) }}>
      <div className="card-pattern" />
      <CardChrome handle={data.source_handle} />

      <div className="cover-card__chips">
        {chip && (
          <span className="card-chip" style={{ color: BRAND_THEME.ink }}>
            {chip}
          </span>
        )}
        <span className={`card-chip ${data.series_type === 'deadline' ? 'card-chip--urgent' : 'card-chip--outline'}`}>
          {SERIES_BADGE[data.series_type]}
        </span>
      </div>

      <FitText fitKey={data.hook_line} max={150} min={80} className="cover-card__hook">
        {lines.map((line, i) => (
          <div key={i} className={`cover-card__line ${i % 2 === 1 ? 'cover-card__line--accent' : ''}`}>
            {line}
          </div>
        ))}
      </FitText>

      <div className="cover-card__footer">
        <FitText fitKey={data.series_title} max={52} min={30} className="cover-card__series">
          {data.series_title}
        </FitText>
        <div className="cover-card__swipe">혜택 {data.cards.length}개 · 옆으로 넘겨보세요 →</div>
      </div>
    </div>
  );
}
