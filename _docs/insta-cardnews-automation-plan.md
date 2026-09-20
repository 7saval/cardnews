# 인스타그램 카드뉴스 워크플로우 자동화 구현 계획

## 0. 목표

- **1차 목표**: "AI 워크플로우 자동화" 경험을 포트폴리오로 어필할 수 있는 엔드투엔드 파이프라인 구축
- **2차 목표**: 자동화 도입 전/후 팔로워 증가율을 정량적으로 측정·시각화
- **원칙**: 완전 자동화를 처음부터 목표로 하지 않는다. 핵심 로직(카피 구조화·렌더링)부터 완성하고, 데이터가 쌓일 시간을 벌기 위해 팔로워 추적을 최대한 일찍 붙인 뒤, 마지막에 발행 자동화를 얹는다.

---

## 1. 전체 아키텍처

```
[소재 리서치] → [카피 구조화(JSON)] → [배경 이미지 매칭] → [카드 렌더링(PNG)] → [발행] 
                                                                                    ↓
                                                          [팔로워/인사이트 수집 대시보드]
```

| 단계 | 핵심 기술 | 자동화 수준 |
|---|---|---|
| 1. 소재 리서치 | 카카오 로컬/네이버 지역검색 API + 트렌드 데이터(데이터랩/pytrends) 조합 + 블로그 크롤링(보조) | 반자동~자동 |
| 2. 카피 구조화 | LLM API + JSON 스키마 프롬프트 | 자동 |
| 3. 이미지 매칭 | 장소 상세페이지(카카오맵/네이버플레이스) 크롤링 + Google Places API(대안) + 블로그 OG 이미지(폴백) | 반자동 → 자동 전환 |
| 4. 카드 렌더링 | React + Playwright | 완전 자동 |
| 5. 발행 | Meta Graph API | 완전 자동 (Phase 4에서 도입) |
| 6. 성과 측정 | Graph API Insights + React/ECharts | 완전 자동 (Phase 2에서 조기 도입) |

> **참고**: 위 화살표는 개념적인 데이터 흐름이고, 각 단계는 지금 `apps/` 아래 독립된 앱으로 존재한다. 한 단계의 출력(JSON/이미지)을 다음 단계의 입력으로 넘겨주는 오케스트레이션(예: `research-collector` 결과를 `content-generator`에, 그 결과를 다시 `card-renderer`에 자동으로 전달)은 아직 없음 — 현재는 사람이 CLI로 파일 경로를 직접 넘겨가며 단계별로 실행해야 한다. Phase 4의 "무인 실행" 완료 기준을 만족하려면 이 오케스트레이션을 별도로 구현해야 한다 (6번 체크리스트 참고).

---

## 2. 우선순위 로드맵

### Phase 1 (1~2주차): 카피 구조화 + 카드 렌더링 — MVP

**목표**: 수동으로 소재/이미지를 넣으면 완성된 카드뉴스 PNG가 나오는 파이프라인.

1. **소재 리서치 자동화 (카카오 로컬/네이버 지역검색 API + 트렌드 데이터 조합)**
   - **공식 지역/장소 API로 후보 확보 (1순위)**: 카카오 로컬 API, 네이버 지역검색 API로 키워드+지역 기반 장소 후보 리스트를 검색. 평점·주소·카테고리·리뷰 요약이 응답에 포함돼 있어 그대로 1차 소재로 활용 가능. 약관상 합법적 사용이라 리스크 없음.
   - **트렌드 데이터로 소재 선별·랭킹 (핵심 조합)**: pytrends(Google Trends 비공식 라이브러리)나 네이버 데이터랩 API로 후보 장소/키워드의 검색량·상승세를 스코어링해서, 장소 후보 중 실제로 카드뉴스 소재로 채택할 대상과 시리즈 주제(예: "요즘 뜨는 야장")를 결정. 즉 카카오/네이버 API가 "장소 데이터"를, 트렌드 데이터가 "지금 다룰 가치가 있는 장소인지"를 판단하는 필터 역할을 함. 날씨 API와 결합하면 "기온 20도 이하 → 야장 소재 자동 트리거" 같은 타이밍 로직도 가능.
   - **블로그 텍스트 크롤링 (보조, 캡션·이미지 폴백용)**: 네이버 블로그, 티스토리 등 공개 블로그 글을 소재 아이디어 참고 및 이미지 폴백(3단계 참고)용으로 수집. RSS 피드가 있으면 우선 활용하고, 없으면 BeautifulSoup/requests로 공개 페이지만 파싱하되 robots.txt와 이용약관을 반드시 확인. 수집한 텍스트는 그대로 쓰지 않고 LLM API로 재요약·재구성해서 저작권 이슈를 최소화.
   - **인스타그램 자체 크롤링은 지양**: 경쟁 계정이나 인기 게시물을 직접 스크래핑하는 건 이용약관 위반 소지가 있고, 자동화 대상 계정 자체가 제재받을 위험이 있음. 벤치마킹이 꼭 필요하면 수동으로 참고하거나, Graph API의 해시태그 검색(비즈니스 계정 한정, 제한적)만 공식적으로 사용.

2. **JSON 스키마 설계**
   ```json
   {
     "series_title": "서울 야장 스팟 9곳",
     "hook_line": "이 날씨 그냥 보낼 순 없잖아요?",
     "cards": [
       {
         "order": 1,
         "place_name": "가가바",
         "subtitle": "음식도 맛있지만 분위기가 더 좋은 곳",
         "caption": "노을과 와인의 조합이라면 진짜 행복...!",
         "image_keyword": "seoul rooftop bar sunset"
       }
     ],
     "cta_card": {
       "handle": "zinoo_travel",
       "cta_text": "새로운 데이트 코스가 궁금해?"
     }
   }
   ```

3. **프롬프트 엔지니어링**
   - System prompt에서 "반드시 위 JSON 스키마로만 응답, 다른 텍스트 금지" 명시
   - 원본 소재(1단계에서 수집한 장소/블로그 데이터)를 Human 메시지로 전달 → 구조화된 JSON 반환
   - 모델: 우선 Claude Haiku 또는 Gemini Flash(무료 티어)로 시작 — 짧은 입출력 작업이라 저비용 모델로 충분

4. **레퍼런스 디자인 분석**
   - 참고할 카드뉴스 계정의 스크린샷을 `design-reference/`에 수집·저장
   - 레이아웃 요소를 분해해서 스펙으로 정리: 박스 위치/크기, 폰트 크기·굵기, 오버레이 텍스트 배치, 색상 팔레트, 캐러셀 dot 스타일, 카드 간 여백
   - 측정 방법: 스크린샷을 이미지 편집 툴로 직접 픽셀 측정하거나, Claude Vision(이미지 입력)에 스크린샷을 넣어 "레이아웃을 CSS 속성 형태로 서술해줘" 프롬프트로 1차 초안 스펙을 뽑아낸 뒤 수동 보정
   - 결과물: `design-reference/spec.md`에 카드 타입별(커버/콘텐츠/CTA) 레이아웃 스펙 정리 — 이 스펙이 다음 단계 컴포넌트 구현의 기준이 됨

5. **React 카드 템플릿 컴포넌트 3종 제작**
   - `CoverCard.tsx`: 상단 말풍선 박스 + 하단 대형 오버레이 텍스트
   - `ContentCard.tsx`: 좌상단 넘버링 + 제목 + 본문 캡션
   - `FollowCTACard.tsx`: 프로필 카드 + 팔로우 버튼 스타일
   - 4단계에서 정리한 `spec.md` 기준으로 스타일링
   - React + Vite 기반으로 구현 (Vite dev server로 컴포넌트를 개별 페이지로 서빙)

6. **Playwright 렌더링 스크립트**
   - 각 카드를 독립된 HTML로 렌더 → `page.screenshot()`으로 PNG 추출
   - 해상도: 1080x1350 (인스타 4:5 비율) 고정

**완료 기준**: JSON 입력 → 카드 이미지 세트(PNG) 자동 생성, 수동 업로드로 1~2회 테스트 게시

---

### Phase 2 (2~3주차): 성과 측정 대시보드 — 베이스라인 구축

**목표**: 자동화 도입 전부터 팔로워 데이터를 쌓기 시작해서, 나중에 "도입 전/후" 비교가 가능하게 만든다. **이 단계를 발행 자동화보다 먼저 하는 이유는 데이터는 시간이 지나야 쌓이기 때문.**

1. **데이터 수집 배치**
   - GitHub Actions 크론(1일 1회) → Graph API `/insights` 호출
   - 수집 지표: `followers_count`, `reach`, `impressions`, `profile_views`
   - DB: 초기엔 Supabase(무료 티어) 또는 SQLite + 파일 커밋도 가능

2. **DB 스키마 예시**
   ```sql
   CREATE TABLE daily_insights (
     date DATE PRIMARY KEY,
     followers_count INT,
     reach INT,
     impressions INT,
     profile_views INT,
     posts_count_today INT,
     is_automated BOOLEAN  -- 자동화 게시물 여부 플래그 (전/후 비교용)
   );
   ```

3. **대시보드**
   - React + ECharts 조합으로 시각화 (Canvas 렌더링이라 데이터가 늘어나도 성능 부담이 적음)
   - 차트: 일별 팔로워 증가 추이, `is_automated` 기준 전/후 구간 비교 라인, 게시물당 평균 도달수

**완료 기준**: 최소 1~2주치 베이스라인 데이터가 쌓인 대시보드 완성

---

### Phase 3 (3주차): 실사 장소 이미지 자동 매칭

**배경**: 소재가 실존하는 맛집/장소이므로 Unsplash/Pexels 같은 범용 스톡 이미지는 실제 장소와 무관해 신뢰도가 떨어짐. 장소가 실제로 등록한 사진을 우선 사용해야 카드뉴스의 신뢰도가 유지됨.

**전략 (우선순위 순)**:

1. **장소 상세페이지 크롤링 (1순위, 무료)**: 카카오 로컬 API 응답의 `place_url`, 네이버 지역검색 API 응답의 `link`로 연결되는 카카오맵/네이버플레이스 상세페이지에서 대표 이미지(썸네일/대표사진)를 파싱. 소재 리서치 단계에서 장소명이 이미 확정돼 있어 이미지-장소 매칭 정확도가 가장 높음. robots.txt·이용약관 확인 후 공개된 대표 이미지 1~2장만 가져오는 수준으로 범위를 제한.
2. **Google Places API Photos (공식 API 대안)**: 크롤링 리스크를 피하고 싶은 경우, 카카오/네이버로 얻은 장소명+주소를 Google Places Text Search로 재검색해 `place_id`를 얻고 Place Photos API로 사용자가 등록한 공식 사진 URL을 받아옴. 완전 자동화가 가능하고 라이선스 처리가 구글 쪽에서 이뤄져 리스크가 적음. 월 $200 크레딧 무료 티어 내에서 카드뉴스 규모는 충분히 커버 가능하나 API 키·빌링 등록 필요.
3. **블로그 OG 이미지 폴백 (보조)**: 1단계 소재 리서치에서 이미 수집 중인 관련 블로그/뉴스 포스트의 `og:image` 메타태그를 함께 크롤링해 저장해두고, 1·2번에서 이미지를 찾지 못했을 때 폴백으로 사용. 원본 그대로 게시하지 않고 크롭·필터·텍스트 오버레이 등으로 가공해서 "단순 재게시"가 아닌 편집물 형태로 저작권 리스크를 최소화하고, 가능하면 출처 표기.
4. **휴먼인더루프 검수 (초기)**: 자동 매칭된 이미지 품질이 들쭉날쭉할 수 있으므로 초기엔 카드 렌더링 직전 후보 이미지를 사람이 1차 확인(채택/스킵) → 매칭 정확도가 충분히 검증되면 자동 채택으로 전환.

**완료 기준**: 카카오/네이버로 확정된 장소 데이터만 입력하면 대표 이미지까지 자동 매칭되어 카드에 반영(수동 개입은 예외 케이스에 한정)

---

### Phase 4 (4주차 이후): 발행 자동화

1. **사전 준비**
   - Instagram 계정을 비즈니스/크리에이터 계정으로 전환, Facebook 페이지 연결
   - Meta 개발자 콘솔에서 본인 계정을 "Instagram 테스터"로 등록 (앱 심사 불필요)

2. **스토리지 업로드**
   - Cloudflare R2(무료 10GB)에 렌더링된 PNG 업로드 → 공개 URL 획득

3. **Graph API 발행 플로우**
   - 카드별로 `media` 컨테이너 생성 → 캐러셀 컨테이너로 묶기 → `media_publish` 호출
   - 예약 발행이 필요하면 GitHub Actions 크론으로 특정 시간에 실행되도록 스케줄링

4. **DB의 `is_automated` 플래그를 이 시점부터 true로 전환**하여 대시보드에서 전/후 구간이 명확히 나뉘도록 함

**완료 기준**: 전체 파이프라인 무인 실행 → 게시까지 자동 완료

---

## 3. 기술 스택 정리

| 영역 | 선택 | 비고 |
|---|---|---|
| 소재 리서치 | 카카오 로컬 API / 네이버 지역검색·데이터랩 API | 공식 API 우선, 무료 티어 존재 |
| 트렌드 감지 (선택) | pytrends (Google Trends 비공식) | 무료, 주제 선정 자동화용 |
| LLM API | Claude Haiku 또는 Gemini Flash | 구조화 출력 작업, 저비용/무료 티어 우선 |
| 프론트엔드 템플릿 | React + Vite | 컴포넌트 기반 템플릿 렌더링에 적합 |
| 렌더링 | Playwright | 헤드리스 스크린샷 → PNG |
| 이미지 소스 | 장소 상세페이지(카카오맵/네이버플레이스) 크롤링 + Google Places API(대안) | 실사 장소 사진 우선 사용, 크롤링 리스크 회피 시 공식 API로 대체 |
| 스토리지 | Cloudflare R2 | 무료 티어 10GB |
| 발행 | Meta Graph API (Instagram Content Publishing) | 본인 계정은 심사 불필요 |
| 배치 실행 | GitHub Actions | 무료 크론 |
| DB | Supabase 또는 SQLite | 소규모 데이터라 가벼운 선택 |
| 대시보드 시각화 | React + ECharts | Canvas 렌더링으로 대량 데이터 처리에 유리 |

---

## 4. 비용 정리

| 항목 | 비용 |
|---|---|
| LLM API (Haiku/Gemini Flash) | 카드뉴스 1건당 수 원~수십 원 수준 |
| 장소 상세페이지 크롤링 | 무료 |
| Google Places API (대안 사용 시) | 월 $200 크레딧 무료, 소규모 프로젝트는 크레딧 내 커버 가능 |
| Cloudflare R2 | 무료 (월 10GB 이내) |
| GitHub Actions | 무료 (퍼블릭 레포 무제한, 프라이빗 월 2,000분) |
| Meta Graph API | 무료 (본인 계정 테스터 등록만 하면 됨) |
| Supabase | 무료 티어로 충분 |

**실질 비용은 LLM API 종량제 사용료뿐이며, 개인 포트폴리오 규모에서는 월 몇 천 원 이내로 예상.**

---

## 5. 프로젝트 폴더 구조 제안

```
cardnews-automation/
├── design-reference/           # 참고 스크린샷 원본 + spec.md (레이아웃 스펙 정리본)
├── apps/
│   ├── research-collector/    # Phase 1: 지역/장소 API·블로그·트렌드 데이터 수집
│   ├── content-generator/     # Phase 1: LLM 호출 + JSON 구조화
│   ├── card-renderer/         # Phase 1: React 템플릿 + Playwright
│   ├── image-matcher/         # Phase 3: 장소 상세페이지 크롤링 + Google Places API 연동
│   ├── publisher/             # Phase 4: Graph API 발행
│   └── insights-collector/    # Phase 2: 일별 인사이트 수집 배치
├── dashboard/                 # Phase 2: React + ECharts 대시보드
├── shared/
│   └── schemas/               # JSON 스키마, 타입 정의 공유
├── .github/workflows/         # GitHub Actions 크론 정의
└── README.md                  # 포트폴리오용 아키텍처 설명
```

---

## 6. 체크리스트

- [ ] 소재 리서치용 공식 API(카카오 로컬/네이버 지역검색) 연동
- [x] 레퍼런스 스크린샷 수집 및 `spec.md` 레이아웃 스펙 정리
- [x] JSON 카드 스키마 확정 (`shared/schemas/card-news.ts`)
- [x] LLM 프롬프트 작성 및 구조화 출력 테스트 (`apps/content-generator`, Gemini API)
- [x] React 카드 템플릿 3종 (커버/콘텐츠/CTA) 퍼블리싱
- [x] Playwright 렌더링 스크립트 작성 (`apps/card-renderer/scripts/render.js`)
- [ ] 인스타 비즈니스 계정 전환 + 테스터 등록
- [ ] Graph API Insights 수집 배치 + DB 스키마 구축
- [ ] ECharts 대시보드 (전/후 비교 뷰 포함) 구축
- [ ] 베이스라인 데이터 최소 1~2주 수집
- [ ] 장소 상세페이지 크롤링 또는 Google Places API 이미지 자동 매칭 연동
- [ ] Cloudflare R2 업로드 파이프라인
- [ ] Graph API 발행 자동화 + 스케줄링
- [ ] 전체 파이프라인을 잇는 오케스트레이션 스크립트 작성 (research-collector → content-generator → image-matcher → card-renderer → publisher, 현재는 각 앱을 CLI로 수동 연결)
- [ ] `is_automated` 플래그 전환 및 전/후 비교 결과 정리
- [ ] README에 아키텍처 다이어그램 및 성과 지표 정리 (포트폴리오용)

---

## 7. 포트폴리오 서술 포인트

- 단순 LLM 호출이 아닌 **"리서치 → 구조화 데이터 → 렌더링 → 발행 → 성과 측정"까지 이어지는 파이프라인 설계** 강조
- **"자유 텍스트 → JSON 스키마" 구조화 프롬프트 엔지니어링**이 개발자 관점 AI 활용력의 핵심 증거
- **정량적 성과**: 자동화 도입 전/후 팔로워 증가율, 게시물당 평균 도달수 변화를 그래프로 제시
- **소재 수집 단계에서도 공식 API를 우선 활용하는 설계**를 통해 데이터 수집의 안정성·합법성까지 고려했음을 어필

---

## 8. 향후 확장 아이디어 (Develop 사항)

현재 계획은 "실존하는 지역 맛집/장소"를 소재로 하기 때문에 3단계 이미지 매칭에서 실사 이미지(장소 상세페이지 크롤링/Google Places API)를 우선 사용한다. 다만 이후 카드뉴스 주제를 실제 장소 외의 영역(예: 라이프스타일 팁, 명언·감성 카피, 계절/트렌드 이슈처럼 특정 실물 장소가 없는 소재)으로 확장할 경우, 매칭할 "공식 이미지"가 존재하지 않는 케이스가 생긴다.

- **Unsplash/Pexels API 도입**: 실물 장소가 없는 주제에서 `image_keyword` 필드 기반으로 분위기에 맞는 배경 이미지를 검색. 초기엔 후보 3~5장 중 수동 선택(휴먼-인-더-루프)으로 시작해 안정화되면 최상위 결과 자동 채택으로 전환.
- 라이선스 표기 필요 여부는 도입 시점에 정책 재확인 필요(Unsplash는 크레딧 불필요 정책이나 최신 약관 확인 권장).
- 주제 확장 시점에 맞춰 `image-matcher` 모듈에 소스 선택 로직(실사 장소 소재 → 크롤링/Places API, 비장소 소재 → Unsplash/Pexels)을 추가하는 방식으로 자연스럽게 합류 가능.

---

## 9. 로컬 실행 및 확인 명령어

Phase 1에서 만든 두 앱(`card-renderer`, `content-generator`)을 로컬에서 직접 실행하고 결과를 확인할 때 쓰는 명령어. 아직 9번 오케스트레이션이 없어서(1번 섹션 참고) 아래 명령어를 순서대로 사람이 직접 실행해야 한다.

### card-renderer

```
cd apps/card-renderer

# 미리보기 갤러리 (내장 샘플 데이터로 브라우저에서 확인)
npm run dev
# → 콘솔에 뜨는 http://localhost:5173 주소를 브라우저로 열기

# PNG로 렌더링 (내장 샘플 데이터, output/ 폴더에 저장)
npm run render

# 임의의 JSON 데이터로 렌더링
npm run render -- --data <JSON 경로> --out <저장 폴더>
```

렌더링 결과 PNG는 `apps/card-renderer/output/`(또는 `--out`으로 지정한 폴더)에 `1-cover.png`, `2-<장소명>.png`, ... 순서로 저장됨. 탐색기에서 더블클릭해서 열거나 VSCode 파일 탐색기에서 클릭하면 바로 미리보기 가능.

### content-generator

```
cd apps/content-generator

# .env에 GEMINI_API_KEY 설정 필요 (.env.example 참고)
npm run generate -- --handle <내 인스타 계정 핸들>
```

결과 JSON은 `apps/content-generator/output/<타임스탬프>.json`에 저장됨. 이 JSON을 바로 위 card-renderer의 `--data`에 넣으면 실제 생성된 카피로 렌더링해서 확인할 수 있음:

```
cd apps/card-renderer
npm run render -- --data ../content-generator/output/<파일명>.json --out output-llm
```
