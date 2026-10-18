import './cards.css';

/** 전 카드 공통: 좌상단 계정 워터마크 + 우상단 로고 배지 (design-reference/spec.md 0번) */
export function CardChrome({ handle, logoUrl = '/logo.png' }: { handle?: string; logoUrl?: string }) {
  return (
    <>
      {handle && (
        <div className="card-watermark">
          <span>📷</span>
          <span>{handle}</span>
        </div>
      )}
      <div className="card-mascot-badge">
        <img src={logoUrl} alt="핫수집 로고" />
      </div>
    </>
  );
}
