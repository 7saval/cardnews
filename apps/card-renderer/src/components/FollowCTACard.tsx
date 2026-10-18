import './cards.css';
import './FollowCTACard.css';
import { CardChrome } from './CardChrome';
import { BRAND_THEME, gradientOf } from '../theme';
import type { CardNewsCTA } from '../../../../shared/schemas/card-news';

interface FollowCTACardProps {
  cta: CardNewsCTA;
  /** 출처 표시 문구 (CardNewsData.data_source) */
  dataSource: string;
  logoUrl?: string;
}

/**
 * 마지막 카드: 후킹 2줄 → 프로필 + 팔로우 → 마무리 문구 → 비공식 큐레이션·출처 표기.
 * 기관 공식 계정으로 오인되지 않도록 하단 표기는 데이터와 무관하게 항상 넣는다 (계획서 §8).
 */
export function FollowCTACard({ cta, dataSource, logoUrl = '/logo.png' }: FollowCTACardProps) {
  return (
    <div className="card" style={{ background: gradientOf(BRAND_THEME) }}>
      <div className="card-pattern" />
      <CardChrome />

      {cta.hook_lines && (
        <div className="cta-card__hook">
          <div className="cta-card__hook-sub">{cta.hook_lines[0]}</div>
          <div className="cta-card__hook-main">{cta.hook_lines[1]}</div>
        </div>
      )}

      <div className="cta-card__profile">
        <div className="cta-card__avatar">
          <img src={logoUrl} alt="핫수집 로고" />
        </div>
        <div className="cta-card__handle">{cta.handle}</div>
        <div className="cta-card__follow-btn">팔로우</div>
      </div>

      <div className="cta-card__closing">
        {cta.cta_text.split('\n').map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>

      <div className="cta-card__notice">
        <div className="cta-card__notice-main">비공식 큐레이션 · 신청 전 원문 공고를 꼭 확인하세요</div>
        <div>출처: {dataSource}</div>
      </div>
    </div>
  );
}
