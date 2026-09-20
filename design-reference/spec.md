# 카드뉴스 레이아웃 스펙

> 분석 대상: `places/timesquare_1~5.png` (seoulhotple 계정 스타일)
> 캔버스 기준: 1080 x 1350px (4:5, 인스타 세로형)
> 아래 px 수치는 표시된 이미지(682px 폭 기준) 비율을 1080px 기준으로 환산한 **추정치**입니다. 실제 제작 시 Playwright 스크린샷으로 렌더링 후 눈으로 비교하며 미세 조정 필요.

---

## 0. 전 카드 공통 요소

| 요소 | 위치 | 크기/스타일 |
|---|---|---|
| 출처 계정 워터마크 | 좌상단, 여백 약 32px | 흰색 굵은 볼드체 + 인스타 카메라 아이콘, 폰트 크기 ~28px, 검은 그림자로 가독성 확보 |
| 브랜드 마스코트 배지 | 우상단, 여백 약 24px | 원형 캐릭터 스티커("MIMI"), 지름 ~130px. 카드마다 동일하게 반복 → 계정 고유 브랜딩 요소 |
| 카드 비율 | 전체 | 1080 x 1350 (4:5) 고정 |

> **[수정] 좌/우 스와이프 화살표·캐러셀 dot은 디자인에서 제외.** 처음엔 레퍼런스 스크린샷에 보이는 화살표/dot을 카드 디자인 요소로 보고 스펙에 넣었었는데, 이건 스크린샷을 찍을 때 인스타그램 앱/웹이 캐러셀 게시물을 보여주면서 자체적으로 그려주는 UI(화면 캡처 시 같이 찍힌 것)였음. 실제 업로드하는 이미지 자체에는 없어야 하는 요소이고, 넣으면 인스타가 그려주는 진짜 화살표/dot과 중복 노출됨. → `CoverCard`/`ContentCard`/`FollowCTACard` 컴포넌트에서 제거함.

---

## 1. 커버 카드 (Cover Card) — `timesquare_1.png`

**목적**: 시리즈 제목 + 후킹 문구로 스와이프 유도

- **배경**: 실제 장소 사진(빌딩+분수) 위에 어두운 톤 다운 처리(사진 대비 낮춰서 텍스트 가독성 확보)
- **중앙 텍스트 블록** (카드의 세로 15%~85% 구간을 거의 채움):
  - 4줄 구성, 각 줄이 카드 폭의 ~90%를 채우는 초대형 타이포
  - 줄1: "실패없는" — 폰트 크기 ~110px
  - 줄2: "〈영등포〉" — 꺾쇠괄호로 지역명 강조, 폰트 크기 ~110px
  - 줄3: "타임스퀘어" — 폰트 크기 ~110px (5글자라 자간 살짝 좁힘)
  - 줄4: "찐 맛집" + 우측에 작은 아이콘(붓/스프레이 이모지) — 폰트 크기 ~120px
  - **폰트 스타일**: 두꺼운 라운드체(고딕 계열 임팩트 폰트), 글자 하나하나에 두꺼운 아웃라인(~10~12px)
  - **색상 규칙**: 줄마다 채우기 색이 다름 → 흰색/틸(청록)이 번갈아 등장, 아웃라인은 전부 네이비(#1a3a5c 계열)로 통일 + 흰색 halo(광선) 처리로 사진 위에서도 튐
  - 줄 간격: 거의 붙어있음 (line-height ~0.95) → 덩어리감 있는 타이포 블록
- **텍스트 정렬**: 중앙 정렬

**CSS 속성 초안**:
```css
.cover-text {
  font-family: 'Jalnan', 'BM Yeonsung', sans-serif; /* 두꺼운 라운드 고딕 계열로 대체 가능 */
  font-size: 110px;
  font-weight: 900;
  -webkit-text-stroke: 11px #16324f;
  text-shadow: 0 0 18px rgba(255,255,255,0.9), 4px 4px 0 rgba(0,0,0,0.15);
  line-height: 0.95;
  text-align: center;
}
```

---

## 2. 콘텐츠 카드 (Content Card) — `timesquare_2~5.png`

**목적**: 장소 1곳씩 소개 (사진 위주 + 하단 정보 오버레이)

- **배경**: 음식/장소 사진이 카드 전체를 꽉 채움 (풀블리드), 카드 상단 ~75% 영역 차지
- **하단 정보 오버레이 박스** (카드 하단 ~25% 영역, 바닥에서 위로 갈수록 투명해지는 흰색/서리 텍스처 그라데이션):
  - **상호명 태그**: `#상호명` 형태, 중앙 정렬, 파란색 계열 채우기 + 흰색 아웃라인, 폰트 크기 ~64px, 볼드
  - **주소 라인**: 📍 아이콘 + 주소 텍스트, 상호명 바로 아래, 폰트 크기 ~26px, 다크 그레이/네이비, 중앙 정렬
  - **설명 캡션 라인**: `#설명 문구` 형태, 주소 아래, 폰트 크기 ~24px, 회색, 중앙 정렬
  - 세 줄 사이 간격: 8~12px 정도로 촘촘
- **정렬 기준**: 상호명/주소/캡션 모두 카드 가로 중앙 기준 정렬

**CSS 속성 초안**:
```css
.content-overlay {
  position: absolute;
  bottom: 0;
  width: 100%;
  padding: 40px 24px 56px;
  background: linear-gradient(to top, rgba(255,255,255,0.95) 40%, rgba(255,255,255,0) 100%);
  text-align: center;
}
.content-title {
  font-size: 64px;
  font-weight: 800;
  color: #2b6cb0;
  -webkit-text-stroke: 4px white;
}
.content-address {
  font-size: 26px;
  color: #333;
  margin-top: 8px;
}
.content-caption {
  font-size: 24px;
  color: #666;
  margin-top: 4px;
}
```

---

## 3. CTA 카드 (Follow CTA) — `cta_1.png`, `cta_2.png`

추가로 받은 레퍼런스 2장은 서로 다른 스타일. 계획서 목표(74~77번 줄: "프로필 카드 + 팔로우 버튼 스타일")에는 **`cta_2.png`(서울픽) 쪽이 정확히 일치**하므로 이걸 메인 기준으로 채택하고, `cta_1.png`(nyam)은 타이포/카피 톤 참고용으로만 사용.

### 3-1. 채택 기준: `cta_2.png` (서울픽 스타일)

- **배경**: 도시 야경 사진 + 어두운 오버레이(딤 처리)로 텍스트/카드 가독성 확보
- **상단 후킹 카피** (카드 세로 ~15%~28% 구간):
  - 2줄, 중앙 정렬, 흰색 볼드
  - 줄1(서브): "당신의 취향과 트렌드가 만나는 순간 P!CK" — 폰트 크기 ~34px, 중간 굵기
  - 줄2(메인): "서울의 트렌드를 픽해서 정리해드립니다" — 폰트 크기 ~40px, 더 굵게, 줄1보다 강조
- **중앙 프로필 카드 위젯** (카드 세로 ~40%~62% 구간, 인스타 프로필 미리보기를 그대로 재현):
  - 흰색 둥근 사각형 카드, 카드 폭의 ~85%, 내부 패딩 ~24px, 그림자로 살짝 떠 보이게
  - 좌측: 원형 프로필 아이콘, 그라데이션 링 테두리(보라→핑크), 지름 ~110px, 안에 계정 로고/이니셜
  - 중앙: 계정 핸들 텍스트 (예: "seoulpick._"), 검정 볼드, 폰트 크기 ~28px
  - 우측: "팔로우" 버튼 — 파란색(#3897F0 계열) 배경, 흰색 텍스트, 둥근 모서리(radius ~10px), 패딩 ~14px 20px
  - 버튼 위에 마우스 커서/손가락 아이콘 오버레이 → "지금 클릭하세요"를 암시하는 시각적 장치 (실제 구현 시엔 생략 가능, 있으면 클릭 유도 효과↑)
- **하단 클로징 카피** (카드 세로 ~75%~85% 구간):
  - 2줄, 중앙 정렬, 흰색 볼드, 폰트 크기 ~32px
  - "미리 팔로우 해두시면" / "필요할 때 분명 도움이 될 거예요."

**CSS 속성 초안**:
```css
.cta-hook {
  color: white;
  font-weight: 700;
  text-align: center;
  text-shadow: 0 2px 6px rgba(0,0,0,0.5);
}
.cta-hook .sub { font-size: 34px; opacity: 0.9; }
.cta-hook .main { font-size: 40px; font-weight: 800; }

.cta-profile-card {
  width: 85%;
  margin: 0 auto;
  background: white;
  border-radius: 24px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
}
.cta-profile-avatar {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  border: 4px solid transparent;
  background: linear-gradient(135deg, #d946ef, #ec4899) border-box;
}
.cta-handle { font-size: 28px; font-weight: 700; color: #111; flex: 1; }
.cta-follow-btn {
  background: #3897F0;
  color: white;
  font-weight: 700;
  font-size: 20px;
  border-radius: 10px;
  padding: 14px 20px;
}
.cta-closing {
  color: white;
  font-weight: 700;
  font-size: 32px;
  text-align: center;
}
```

### 3-2. 참고용: `cta_1.png` (nyam 스타일)

- 블러 처리된 배경 사진 + 상단에 앱 로고 배지(흰색 둥근 사각형, ~140px)
- 커버 카드와 유사한 손글씨체 느낌의 굵은 폰트로 3줄 카피, 키워드만 노란색으로 하이라이트
- 하단에 작은 워드마크 텍스트
- **채택하지 않는 이유**: 이건 "앱 설치 유도" 패턴이라 우리 목표(계정 팔로우 유도)와 어긋남. 다만 문구 안에서 핵심 단어만 색을 다르게 주는 하이라이트 기법은 콘텐츠/커버 카드에도 응용 가능

---

## 4. 다음 단계

- [ ] 이 스펙을 기준으로 `apps/card-renderer`에 `CoverCard.tsx`, `ContentCard.tsx` 컴포넌트 작성
- [ ] 실제 폰트 파일 확보 (두꺼운 라운드 고딕 - 잘난체/여기어때잘난체 등 무료 폰트 후보 확인)
- [ ] CTA 카드 레퍼런스 추가 수집 후 스펙 보완
