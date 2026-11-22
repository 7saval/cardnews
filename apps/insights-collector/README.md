# insights-collector

**성적 기록.** Meta Graph API로 인스타그램 비즈니스 계정의 하루치 성과(팔로워 수·도달·참여)를 조회해
Supabase `daily_insights` 테이블에 쌓는 앱. 자동화 도입 전/후를 비교할 **베이스라인 데이터**를 모으는 게 목적이라,
발행 자동화(publisher)보다 먼저 붙였다.

- **자동 실행**: GitHub Actions `insights-daily` (`.github/workflows/insights-daily.yml`), 매일 예약 KST 00:30
  (GitHub 사정으로 실제로는 새벽~아침에 돈다)
- **데이터 상태**: 2026-11-13부터 정상 적재 중. 2026-09-28~11-13은 Meta 쪽 `API access blocked`로 실패했다 (원인 불명, 11-14 복구)
- **사람 할 일**: 두 달에 한 번 장기 토큰 교체 (다음 만료 **2027-01-13**)

설계 배경은 `_docs/insta-cardnews-automation-plan.md`의 "Phase 2" 섹션 — 단, 거기 적힌 메트릭 일부는 현재 API와 다르다
(아래 "계획서와 달라진 점").

## 파일 구성

| 파일 | 역할 |
|---|---|
| `src/collect.js` | **실행 진입점** (`npm run collect`). 집계 날짜(기본: KST 어제)의 구간 계산 → 계정 필드(팔로워 수) → 일별 인사이트 메트릭 → 그날 게시물 수 → `daily_insights`에 날짜 기준 upsert |
| `src/test-insights.js` | 연결 확인용 스모크 테스트 (`npm run test:insights`). 계정 필드와 인사이트 메트릭이 조회되는지만 본다. DB에 쓰지 않음 |
| `src/exchange-token.js` | 토큰 교환 (`npm run exchange-token`). Graph API Explorer에서 받은 단기 토큰(1~2시간) → 60일 장기 토큰으로 바꿔 `.env`를 갱신 |
| `.env.example` | 필요한 환경변수 목록 |

`daily_insights`에 저장하는 값: `date`(PK), `followers_count`, `reach`, `accounts_engaged`, `total_interactions`,
`posts_count_today`, `is_automated`(지금은 항상 `false` — publisher가 생기면 자동 게시일부터 `true`).

## 정상 동작 순서

### 1. 준비 (처음 한 번)

```bash
npm install
cp .env.example .env   # 값 채우기
```

```
META_ACCESS_TOKEN=
IG_BUSINESS_ACCOUNT_ID=
META_APP_ID=                 # exchange-token에서만 필요
META_APP_SECRET=             # exchange-token에서만 필요
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=   # service_role 키 — 절대 커밋하거나 브라우저에 노출하지 말 것
```

- `META_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`는 Meta 개발자 콘솔의 Graph API Explorer에서 발급
  (Facebook 페이지에 연결된 IG 비즈니스 계정 필요. `instagram_manage_insights` 권한을 앱에 추가해야
  `instagram_business_account` 필드·인사이트 조회가 된다. 앱 대시보드 → 이용 사례 → "Facebook 로그인이 포함된 API" →
  권한 및 기능에서 추가)
- `META_APP_ID`/`META_APP_SECRET`은 앱 설정 > 기본 설정에서 확인

### 2. 장기 토큰으로 교환

Explorer에서 받은 토큰은 1~2시간이면 만료된다. 매일 자동으로 돌리려면 60일짜리로 바꿔야 한다.

```bash
npm run exchange-token   # 성공하면 .env의 META_ACCESS_TOKEN을 장기 토큰으로 교체
```

> **주의**: 이미 장기 토큰인 걸 다시 교환하면 만료일이 늘지 않는다. **반드시 Explorer에서 새 단기 토큰을 받아서** 교환한다.

### 3. 연결 확인

```bash
npm run test:insights
```

```
✔ @hotsoozip | 팔로워 N명 | 게시물 N개
  - reach: …
  - accounts_engaged: …
  - total_interactions: …
```

실패하면 범위를 좁혀 본다: 토큰 디버거(유효·권한) → `me` → `me/accounts` → IG 계정 필드 → `/insights` 순서.

### 4. 수집해서 DB에 저장

```bash
npm run collect -- --dry-run           # DB에 쓰지 않고 조회 결과만 출력
npm run collect                        # KST 기준 어제 하루치 저장
npm run collect -- --date 2026-11-20   # 특정 날짜 재수집
```

- `date` 기준 upsert라 같은 날짜로 다시 돌려도 중복되지 않고 덮어쓴다.
- 인사이트 메트릭은 해당 날짜(KST 00:00~24:00) 구간으로 고정 조회하지만, `followers_count`는 계정 필드라
  **실행 시점의 값**이다 (그래서 자정 직후에 돌게 예약했다). 과거 날짜를 재수집해도 팔로워 수는 "지금" 값이 들어간다.

### 5. GitHub Actions 등록 (자동 실행)

저장소 Secrets에 `META_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 등록한다.
Actions 탭에서 수동 실행(날짜 지정)도 된다.

**토큰을 교체할 때마다** `.env`뿐 아니라 GitHub Secret `META_ACCESS_TOKEN`도 갱신하고, 수동 실행으로 성공을 확인한다.

## 계획서와 달라진 점

계획 수립 당시 가정한 메트릭 일부가 현재 API에서 쓸 수 없다:

| 계획서 가정 | 현재 상태 |
|---|---|
| `impressions` | **폐기됨** (v22.0부터, 2025-04-21부로 전 버전 제거). 대체는 `views` |
| `profile_views` | **메트릭 자체가 없음**. 가장 가까운 대안은 `profile_links_taps`(프로필 링크 클릭) |
| `followers_count` | `/insights` 메트릭이 아니라 계정 필드 — 매일 스냅샷을 찍어 누적해야 시계열이 된다 |
| `reach` | 그대로 사용 |

## 남은 일

- [ ] 장기 토큰 만료 대응 자동화 (만료 임박 알림 또는 시스템 사용자 토큰)
- [x] 수집 실패 알림 — 2026-09~11에 7주 동안 실패를 몰랐다 → 2026-11-23 `notify-failure` 워크플로(실패 시 GitHub 이슈)
