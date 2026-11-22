# publisher

**자동 게시 — 아직 구현 전 (Phase 4).** 지금은 사람이 하는 루트 README 5·6단계(인스타 게시, 발행 기록)를 대신할 앱이다.

## 파일 구성

아직 코드가 없다. 이 README뿐이다.

## 만들 내용 (계획)

`_docs/insta-cardnews-automation-plan.md` "Phase 4"와 `_docs/2026-11-14-plan.md` §3.1 기준.

1. **사람 승인 대기** — 주간 실행이 카드를 만든 뒤 바로 올리지 않고, 사람이 검수하고 승인하면 진행한다
   (GitHub environment 승인 또는 별도 수동 실행 워크플로)
2. **발행 직전 신선도 확인** — 보조금24를 다시 조회해 원문이 바뀌거나 마감되지 않았는지 확인한다
   (`content-generator/src/fact-check.js`의 `checkFreshness()`, 지금은 아무 데서도 안 씀). 실패하면 게시 중단
3. **이미지 업로드** — PNG를 Cloudflare R2에 올려 공개 URL을 얻는다 (Graph API는 URL로만 이미지를 받는다)
4. **인스타 게시** — Graph API로 카드별 미디어 컨테이너 → 캐러셀 컨테이너(캡션은 `caption.txt`) → `media_publish`
5. **발행 기록** — 게시 성공 직후 기록한다. 지금의 `benefit-collector/data/published.json` 대신 Supabase
   `published_benefits` 테이블로 옮길 예정
6. **전/후 구분** — 자동 게시를 시작한 날부터 `daily_insights.is_automated = true`로 남겨 대시보드에서 구간을 나눈다

## 정상 동작 순서 (예정)

1. Meta 앱에 게시 권한(`instagram_content_publish`) 추가, R2 버킷·키 준비
2. 주간 실행 → 사람이 artifact 검수 → 승인
3. 신선도 확인 → R2 업로드 → 캐러셀 게시 → 발행 기록 → 결과 알림

사전 준비(비즈니스 계정 전환, 테스터 등록)는 `_docs/insta-cardnews-automation-plan.md`의 "Phase 4" 참고.
같은 Meta 앱·토큰을 `insights-collector`와 함께 쓴다.
