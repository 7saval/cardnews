import './cards.css';
import './ContentCard.css';
import { ImageCredit } from './ImageCredit';

interface ContentCardProps {
  sourceHandle: string;
  placeName: string;
  caption: string;
  address?: string;
  backgroundImageUrl?: string;
  imageCredit?: string;
}

export function ContentCard({
  sourceHandle,
  placeName,
  caption,
  address,
  backgroundImageUrl,
  imageCredit,
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
      <ImageCredit credit={imageCredit} />
      <div className="card-mascot-badge">LOGO</div>

      <div className="content-card__overlay">
        <div className="content-card__title">#{placeName}</div>
        {address && <div className="content-card__address">📍 {address}</div>}
        <div className="content-card__caption">#{caption}</div>
      </div>
    </div>
  );
}
