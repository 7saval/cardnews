# insights-collector

Meta Graph API로 인스타그램 비즈니스 계정의 팔로워 수·인사이트를 수집하는 앱.
Phase 2 담당 — 발행 자동화(Phase 4)보다 먼저 붙여서, 자동화 도입 전/후 비교를 위한
베이스라인 데이터를 최대한 일찍부터 모으는 게 목적.

**현재 상태**: API 연동 스모크 테스트까지 완료. 매일 도는 크론 배치 + DB 적재는 아직.

설계 배경은 `_docs/insta-cardnews-automation-plan.md`의 "Phase 2" 섹션 참고 —
단, 거기 적힌 DB 스키마(`impressions`, `profile_views` 컬럼)는 **현재 API와 안 맞음**.
아래 "계획서와 달라진 점" 참고.

## 준비

1. 의존성 설치

   ```bash
   npm install
   ```

2. `.env` 생성 (`.env.example` 참고)

   ```
   META_ACCESS_TOKEN=
   IG_BUSINESS_ACCOUNT_ID=

   # npm run exchange-token 에서만 필요
   META_APP_ID=
   META_APP_SECRET=
   ```

   - `META_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`는 Meta 개발자 콘솔의 Graph API Explorer에서 발급
     (Facebook 페이지에 연결된 IG 비즈니스 계정 필요 — 설정 과정에서 `instagram_manage_insights` 권한을
     앱에 추가해야 `instagram_business_account` 필드/인사이트 조회가 됨. 앱 대시보드 → 이용 사례 →
     "Facebook 로그인이 포함된 API" → 권한 및 기능에서 추가)
   - `META_APP_ID`/`META_APP_SECRET`은 앱 설정 > 기본 설정에서 확인 (장기 토큰 교환용, 당장 없어도
     스모크 테스트는 가능)

## 실행

### 1. API 연동 확인 (스모크 테스트)

```bash
npm run test:insights
```

두 가지를 확인한다:
1. 계정 필드 조회 (`GET /{ig-user-id}?fields=username,followers_count,media_count`) — 팔로워 수는
   `/insights` 메트릭이 아니라 계정 자체 필드라서 별도 조회
2. 일별 인사이트 메트릭 (`reach`, `accounts_engaged`, `total_interactions`)

```
✔ @matsoozip | 팔로워 0명 | 게시물 0개
  - reach: 0
  - accounts_engaged: 0
  - total_interactions: 0
```

### 2. 장기 토큰으로 교환 (단기 토큰은 ~1-2시간 후 만료)

```bash
npm run exchange-token
```

성공하면 `.env`의 `META_ACCESS_TOKEN`을 60일짜리 장기 토큰으로 자동 교체한다. 크론으로
자동화하려면 이 장기 토큰이 필요 (또는 60일마다 재교환 로직 필요 — 아직 미구현).

## 계획서와 달라진 점

계획 수립 당시(`_docs/insta-cardnews-automation-plan.md`) 가정한 메트릭 중 일부가 현재 API에서
사용 불가능해졌다:

| 계획서 가정 | 현재 상태 |
|---|---|
| `impressions` | **폐기됨** (v22.0부터, 2025-04-21부로 전 버전 제거). 대체는 `views` |
| `profile_views` | **메트릭 자체가 없음**. 가장 가까운 대안은 `profile_links_taps`(프로필 링크 클릭)뿐 |
| `followers_count` | `/insights` 메트릭이 아니라 계정 필드 — 매일 스냅샷을 직접 찍어서 누적해야 시계열이 됨 |
| `reach` | 그대로 사용 가능 |

`daily_insights` DB 스키마를 구현할 때 이 표 기준으로 컬럼을 다시 정해야 한다 (다음 작업).

## 다음 작업

- [ ] `daily_insights` DB 스키마 재설계 (위 표 반영: `impressions`→`views`, `profile_views` 제거/대체)
- [ ] GitHub Actions 크론 배치 스크립트 (`npm run collect` 같은 형태로, 매일 계정 필드+인사이트를
  조회해서 DB에 upsert)
- [ ] 장기 토큰 60일 만료 대응 (알림 또는 자동 재교환)
