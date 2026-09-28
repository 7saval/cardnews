# image-matcher

카드뉴스 JSON의 장소별로 **허락받은 사진**을 찾아 카드 배경(`image_url`)과 출처(`image_credit`)를
채우는 CLI. Phase 3 담당 — 파이프라인에서 `content-generator`와 `card-renderer` 사이에 들어간다.

## 원칙: 사진을 자동으로 "가져오지" 않는다

카카오맵/네이버 지도/Google Places의 사진은 가게 사장님이 올린 "공식 사진"이어도 **그 플랫폼 안에서
보여주라고 올린 것**이라, 우리 계정에 재게시할 권리가 없다 (카카오맵 `robots.txt`는 장소 페이지
수집 자체도 막고 있고, Google Places 정책은 사진 저장을 금지함 — 상세: `_docs/insta-cardnews-automation-plan.md`
Phase 3). 그래서 사진 확보는 사람이 한다:

1. 가게 공식 채널(인스타/홈페이지)에 DM으로 사진 사용 허락 요청 — 또는 직접 방문해서 촬영
2. 허락받은 사진을 `images/<장소명>/`에 넣고, `credit.txt` 첫 줄에 출처(`@가게계정`, 직접 촬영이면 내 계정) 기록
3. 이 스크립트가 카드에 연결 — **`credit.txt`가 비어 있으면 사진이 있어도 쓰지 않는다** (출처 표기 누락 방지)

`images/`는 `.gitignore` 처리 — 사용 허락이지 재배포 허락이 아니라서 저장소에 올리지 않는다.

## 사용법

```bash
# 1) 카드 JSON의 장소별 빈 폴더 + credit.txt 생성 (_cover, _cta 포함, 기존 폴더는 그대로 둠)
npm run match -- --data ../content-generator/output/<이름>.json --init

# 2) 사진/출처를 채운 뒤 매칭 → JSON의 image_url / image_credit 갱신 (파일을 제자리에서 수정)
npm run match -- --data ../content-generator/output/<이름>.json
```

```
  ✔ 신미식당 ← 1.jpg (@shinmi_official)
  - 춘식당 가로수길본점: 사진 없음
  - 보물섬: credit.txt 비어 있음 → 사용 안 함
  ✔ 커버: 첫 매칭 장소 사진 사용
  - CTA: 사진 없음
```

루트의 `npm run pipeline`은 이 단계를 자동으로 거친다. 사진이 하나도 없어도 실패하지 않고, 매칭 안 된
카드는 placeholder 배경으로 렌더링된다. 사진을 넣은 뒤에는 LLM을 다시 부를 필요 없이 이 스크립트 →
`card-renderer`의 `npm run render`만 다시 돌리면 된다.

## 폴더 규칙

```
images/
├── 신미식당/
│   ├── credit.txt        # 첫 줄: @shinmi_official
│   └── 1.jpg             # 파일명 순 첫 장을 배경으로 사용 (jpg/jpeg/png/webp)
├── 춘식당 가로수길본점/    # 장소명 매칭은 공백·하이픈 등을 무시 ("춘식당-가로수길본점"도 매칭)
├── _cover/               # (선택) 커버 전용 사진. 없으면 첫 매칭 장소 사진을 씀
└── _cta/                 # (선택) CTA 카드 전용 사진
```

## 이미지 전달 방식

`image_url`은 `/__images/<폴더>/<파일>` 형태로 채워지고, `card-renderer`의 개발 서버(`vite.config.ts`)가
이 경로를 `images/`의 실제 파일로 서빙한다. 미리보기(`npm run dev`)와 PNG 렌더링(`npm run render`) 모두
같은 서버를 쓰므로 둘 다 그대로 동작한다. 카드에는 좌상단 워터마크 아래에 `📸 <출처>`가 표시된다.

## 다음 작업

- [ ] 가게 공식 채널(인스타/홈페이지) 후보 찾기 자동화 — 허락 요청 대상 목록 생성. `robots.txt`를
  지키는 크롤러로 구현 (학습 목적 겸)
