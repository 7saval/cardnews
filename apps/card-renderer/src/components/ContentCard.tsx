import './cards.css';
import './ContentCard.css';
import { CardChrome } from './CardChrome';
import { FitText } from './FitText';
import { gradientOf, periodBadge, themeOf } from '../theme';
import type { CardNewsItem } from '../../../../shared/schemas/card-news';

interface ContentCardProps {
  sourceHandle: string;
  item: CardNewsItem;
  total: number;
  /** D-day 계산 기준일 (CardNewsData.generated_at) */
  baseDate: string;
}

/** 혜택 1건 카드. 위에서부터 칩(카테고리·기한) → 정책명 → 혜택(가장 강조) → 대상 → 코멘트 → 출처 */
export function ContentCard({ sourceHandle, item, total, baseDate }: ContentCardProps) {
  const theme = themeOf(item.category);
  const badge = periodBadge(item.period_end, baseDate);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="card" style={{ background: gradientOf(theme) }}>
      <div className="card-pattern" />
      <CardChrome handle={sourceHandle} />

      <div className="content-card__body">
        <div className="content-card__chips">
          <span className="card-chip" style={{ color: theme.ink }}>
            {item.category}
          </span>
          <span className={`card-chip ${badge.urgent ? 'card-chip--urgent' : 'card-chip--outline'}`}>
            {badge.label}
          </span>
          <span className="content-card__count">
            {pad(item.order)} / {pad(total)}
          </span>
        </div>

        <div className="content-card__panel">
          <FitText fitKey={item.title} max={64} min={36} className="content-card__title">
            {item.title}
          </FitText>
          <FitText fitKey={item.subtitle} max={34} min={26} className="content-card__subtitle">
            {item.subtitle}
          </FitText>

          <div className="content-card__label" style={{ color: theme.ink }}>
            이런 혜택
          </div>
          <FitText fitKey={item.benefit} max={60} min={36} className="content-card__benefit">
            <span style={{ color: theme.ink }}>{item.benefit}</span>
          </FitText>

          <div className="content-card__label" style={{ color: theme.ink }}>
            이런 분께
          </div>
          <FitText fitKey={item.target} max={38} min={28} className="content-card__target">
            {item.target}
          </FitText>

          <FitText
            fitKey={item.caption}
            max={32}
            min={24}
            className="content-card__caption"
          >
            <span className="content-card__caption-inner" style={{ background: theme.soft }}>
              💬 {item.caption}
            </span>
          </FitText>
        </div>

        <div className="content-card__footer">
          <FitText fitKey={item.source_name} max={28} min={20} className="content-card__source">
            출처 · {item.source_name}
          </FitText>
          <span className="content-card__more">원문 링크는 캡션에 ↓</span>
        </div>
      </div>
    </div>
  );
}
