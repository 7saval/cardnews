import './cards.css';
import './ContentCard.css';

interface ContentCardProps {
  sourceHandle: string;
  placeName: string;
  caption: string;
  address?: string;
  backgroundImageUrl?: string;
  logoUrl?: string;
}

export function ContentCard({
  sourceHandle,
  placeName,
  caption,
  address,
  backgroundImageUrl,
  logoUrl = '/logo.png',
}: ContentCardProps) {
  return (
    <div className="card">
      {backgroundImageUrl ? (
        <div className="content-card__bg" style={{ backgroundImage: `url(${backgroundImageUrl})` }} />
      ) : (
        <div className="card-placeholder-bg">[배경 이미지 자리]</div>
      )}

      <div className="card-watermark">
        <span>📷</span>
        <span>{sourceHandle}</span>
      </div>
      <div className="card-mascot-badge">
        {logoUrl ? <img src={logoUrl} alt="맛수집 로고" /> : 'LOGO'}
      </div>

      <div className="content-card__overlay">
        <div className="content-card__title">#{placeName}</div>
        {address && <div className="content-card__address">📍 {address}</div>}
        <div className="content-card__caption">#{caption}</div>
      </div>
    </div>
  );
}
