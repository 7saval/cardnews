import './cards.css';
import './CoverCard.css';

interface CoverCardProps {
  sourceHandle: string;
  /** \n으로 구분된 훅 카피. 줄마다 흰색/틸이 번갈아 표시된다. */
  hookLine: string;
  backgroundImageUrl?: string;
}

export function CoverCard({ sourceHandle, hookLine, backgroundImageUrl }: CoverCardProps) {
  const lines = hookLine.split('\n');

  return (
    <div className="card">
      {backgroundImageUrl ? (
        <div className="cover-card__bg" style={{ backgroundImage: `url(${backgroundImageUrl})` }} />
      ) : (
        <div className="card-placeholder-bg">[배경 이미지 자리]</div>
      )}
      <div className="cover-card__dim" />

      <div className="card-watermark">
        <span>📷</span>
        <span>{sourceHandle}</span>
      </div>
      <div className="card-mascot-badge">LOGO</div>

      <div className="cover-card__title">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`cover-card__line ${i % 2 === 0 ? 'cover-card__line--white' : 'cover-card__line--teal'}`}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
