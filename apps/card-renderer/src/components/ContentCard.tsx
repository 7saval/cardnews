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

/** "기관명 044-202-7450"에서 전화번호가 줄바꿈으로 쪼개지지 않게 번호만 nowrap으로 감싼다 */
function ContactText({ contact }: { contact: string }) {
  const m = /^(.*?)\s*([\d-]{3,})$/.exec(contact);
  if (!m) return <>{contact}</>;
  return (
    <>
      {m[1]} <span style={{ whiteSpace: 'nowrap' }}>{m[2]}</span>
    </>
  );
}

/**
 * 혜택 1건 카드. 위에서부터 칩(카테고리·기한) → 정책명 → 혜택(가장 강조) → 세부 항목 → 대상
 * → 신청·문의 → 코멘트 → 출처.
 *
 * details·apply_method·contact는 2026-11-14에 추가된 필드라 이전 회차 JSON에는 없다.
 * 없으면 그 칸을 빼고, 남는 높이는 세부 항목 자리(빈 칸)가 가져간다.
 */
export function ContentCard({ sourceHandle, item, total, baseDate }: ContentCardProps) {
  const theme = themeOf(item.category);
  const badge = periodBadge(item.period_end, baseDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  const details = item.details ?? [];

  const period = item.period_end ? `${item.period_end}까지` : item.period_text;
  const howToApply = [period, item.apply_method].filter(Boolean).join(' · ');

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
          <FitText fitKey={item.title} max={60} min={36} className="content-card__title">
            {item.title}
          </FitText>
          <FitText fitKey={item.subtitle} max={32} min={24} className="content-card__subtitle">
            {item.subtitle}
          </FitText>

          <div className="content-card__label content-card__label--first" style={{ color: theme.ink }}>
            이런 혜택
          </div>
          <FitText fitKey={item.benefit} max={54} min={34} className="content-card__benefit">
            <span style={{ color: theme.ink }}>{item.benefit}</span>
          </FitText>

          {details.length > 0 ? (
            <FitText
              fitKey={details.join('\n')}
              max={34}
              min={22}
              className="content-card__details"
            >
              <ul className="content-card__details-list" style={{ background: theme.soft }}>
                {details.map((d) => (
                  <li key={d}>
                    <span className="content-card__check" style={{ color: theme.ink }}>
                      ✓
                    </span>
                    {d}
                  </li>
                ))}
              </ul>
            </FitText>
          ) : (
            <div className="content-card__spacer" />
          )}

          <div className="content-card__label" style={{ color: theme.ink }}>
            이런 분께
          </div>
          <FitText fitKey={item.target} max={34} min={26} className="content-card__target">
            {item.target}
          </FitText>

          <div className="content-card__info">
            <div className="content-card__info-cell">
              <div className="content-card__info-label" style={{ color: theme.ink }}>
                신청
              </div>
              <FitText fitKey={howToApply} max={30} min={22} className="content-card__info-value">
                {howToApply}
              </FitText>
            </div>
            {item.contact && (
              <div className="content-card__info-cell">
                <div className="content-card__info-label" style={{ color: theme.ink }}>
                  문의
                </div>
                <FitText fitKey={item.contact} max={30} min={22} className="content-card__info-value">
                  <ContactText contact={item.contact} />
                </FitText>
              </div>
            )}
          </div>

          <FitText fitKey={item.caption} max={30} min={22} className="content-card__caption">
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
