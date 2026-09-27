# publisher

**아직 구현 전.** Phase 4 담당 — `card-renderer`가 만든 PNG를 Cloudflare R2에 올려
공개 URL을 얻은 뒤, Meta Graph API로 캐러셀 컨테이너를 만들어 인스타그램에 발행하는 역할.
발행 시점부터 `daily_insights.is_automated` 플래그를 true로 전환해서 대시보드에서
자동화 도입 전/후 구간이 나뉘게 한다.

사전 준비(비즈니스 계정 전환, 테스터 등록)와 발행 플로우는
`_docs/insta-cardnews-automation-plan.md`의 "Phase 4" 섹션 참고.
