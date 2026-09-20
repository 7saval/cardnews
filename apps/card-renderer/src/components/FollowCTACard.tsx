import './cards.css';
import './FollowCTACard.css';

interface FollowCTACardProps {
  handle: string;
  ctaText: string;
  hookLines?: [string, string];
  backgroundImageUrl?: string;
}

export function FollowCTACard({ handle, ctaText, hookLines, backgroundImageUrl }: FollowCTACardProps) {
  return (
    <div className="card">
      {backgroundImageUrl ? (
        <div className="cta-card__bg" style={{ backgroundImage: `url(${backgroundImageUrl})` }} />
      ) : (
        <div className="card-placeholder-bg">[배경 이미지 자리]</div>
      )}
      <div className="cta-card__dim" />

      {hookLines && (
        <div className="cta-card__hook">
          <div className="cta-card__hook-sub">{hookLines[0]}</div>
          <div className="cta-card__hook-main">{hookLines[1]}</div>
        </div>
      )}

      <div className="cta-card__profile">
        <div className="cta-card__avatar">LOGO</div>
        <div className="cta-card__handle">{handle}</div>
        <div className="cta-card__follow-btn">팔로우</div>
      </div>

      <div className="cta-card__closing">
        {ctaText.split('\n').map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
