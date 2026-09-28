import './cards.css';

/** 배경 사진 출처 표기. 허락받은 사진은 출처를 반드시 보여줘야 해서 모든 카드 공통으로 쓴다. */
export function ImageCredit({ credit }: { credit?: string }) {
  if (!credit) return null;
  return <div className="card-image-credit">📸 {credit}</div>;
}
