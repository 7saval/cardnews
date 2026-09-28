# 가게 공식 채널 찾기(channel-finder) 구현 계획

## 0. 배경

Phase 3(실사 이미지)은 2026-09-28에 **"사진을 자동으로 가져오지 않는다"**로 방향을 바꿨다
(`_docs/insta-cardnews-automation-plan.md` Phase 3 "원안 폐기" 참고). 카카오맵/네이버 지도/Google Places의
사진은 공식 사진이어도 제3자 계정에 재게시할 권리가 없고, 카카오맵은 `robots.txt`로 장소 페이지 수집 자체를
막고 있기 때문이다.

그래서 Phase 3는 세 단계가 됐다:

1. **가게 공식 채널 찾기 (자동)** ← 이 문서
2. 사용 허락 요청 (사람, DM)
3. 허락받은 사진 → 카드 반영 (자동, `apps/image-matcher/src/match.js` — 구현 완료)

현재 1단계가 없어서, 카드뉴스에 들어갈 장소 8곳의 인스타/홈페이지를 사람이 하나씩 검색해야 한다.
이 문서는 그 검색을 **공식 API + `robots.txt`를 지키는 크롤러**로 자동화하는 계획이다.

## 1. 근거 정리 (우선순위 순)

1. **허락 요청 작업량 감소(주 근거)** — 카드뉴스 1건당 장소 8곳 × 수동 검색. 후보 목록만 자동으로 나와도
   사람은 "맞는지 확인 → DM"만 하면 된다.
2. **크롤링 학습(학습 목적)** — `robots.txt` 해석, User-Agent 명시, 요청 간격 제한, HTML 파싱, 실패 처리를
   직접 구현해본다. 단 **허용된 곳만** 대상으로 한다.
3. **파이프라인 서사(포트폴리오)** — "약관·저작권을 지키면서 자동화할 수 있는 부분만 자동화한다"는 판단 과정
   자체가 설명 가능한 설계 결정이 된다.

## 2. 설계 원칙

- **사진은 절대 가져오지 않는다.** 이 모듈의 출력은 "연락할 곳(URL/계정) 후보"뿐이다.
- **플랫폼 페이지를 직접 긁지 않는다.** 카카오맵·네이버 지도·인스타그램 페이지는 요청하지 않는다
  (카카오맵은 `robots.txt` 전면 차단 확인, 인스타그램은 약관상 자동 수집 금지). 인스타 계정은
  **검색 API 결과에 이미 포함된 링크/텍스트에서만** 추출한다.
- **크롤링은 가게 자체 홈페이지에만, `robots.txt`가 허용할 때만** 한다. 확인 불가(타임아웃/5xx)도 "불허"로 취급한다.
- **자동으로 확정하지 않는다.** 결과는 신뢰도와 근거(어느 검색 결과에서 나왔는지)가 붙은 **후보**이고,
  맞는 계정인지는 사람이 판단한다. 동명 가게·체인점 오탐이 있기 때문.
- **파이프라인 필수 단계가 아니다.** 허락 요청은 사람이 하는 일이라 `npm run pipeline`에 넣지 않고 별도 명령으로 둔다.

## 3. 데이터 소스

모두 NAVER API HUB Search API (인증: `X-NCP-APIGW-API-KEY-ID` / `X-NCP-APIGW-API-KEY`,
**하루 25,000건 공통 한도** — 장소 8곳 × 소스 3개 = 24건/회라 여유 충분). 2026-09-29 공식 문서로 확인.

| 우선순위 | API | 엔드포인트 | 쓰는 방식 |
|---|---|---|---|
| 1 | 지역 검색 | `GET https://naverapihub.apigw.ntruss.com/search/v1/local` | `link` 필드 = "업체, 기관의 상세 정보 URL". 가게 홈페이지나 인스타 주소가 직접 들어 있으면 가장 확실한 근거. `roadAddress`로 카드의 주소와 대조해 **같은 가게인지 검증**. `display` 최대 5 |
| 2 | 웹 문서 검색 | `GET .../search/v1/webkr` | `"<장소명>" <구> 인스타그램`으로 검색 → `link`/`description`에서 `instagram.com/<계정>` 추출. `display` 최대 100 |
| 3 | 블로그 검색 | `GET .../search/v1/blog` | 방문 후기에 적힌 `@계정`이나 인스타 링크 추출. 신뢰도 낮음(보조) |
| 4 | 가게 홈페이지 (크롤링) | 1~2에서 찾은 자체 도메인 | `robots.txt` 허용 시 메인 페이지 1장만 받아 `<a href>` 중 인스타 링크 추출 |

> 네이버 지역검색은 원래 "카카오 로컬과 기능 중복"으로 보류했던 API인데(계획서 체크리스트), `link` 필드
> 때문에 이 용도에서는 카카오 로컬에 없는 정보를 준다. **API HUB에서 지역/웹문서/블로그 검색 이용 신청 필요**
> (현재는 검색어트렌드만 신청된 상태).

## 4. 아키텍처

```
apps/image-matcher/
├── src/match.js              # (기존) 허락받은 사진 → 카드 반영
├── src/find-channels.js      # 신규 CLI: npm run find-channels -- --data <카드 JSON>
└── src/lib/
    ├── naver-search.js       # local / webkr / blog 호출 (research-collector의 fetch 패턴 재사용)
    ├── extract.js            # URL·텍스트에서 인스타 계정/홈페이지 후보 추출 + 정규화
    ├── robots.js             # robots.txt 파서 (학습 목적으로 직접 구현)
    └── polite-fetch.js       # UA 명시, 호스트당 요청 간격, 타임아웃, 크기 제한
```

**처리 흐름 (장소 1곳 기준)**

```
카드 JSON의 cards[] (place_name, address)
  1. 지역검색: query = "<장소명> <주소의 구>"
     → items 중 roadAddress가 카드 주소와 일치하는 항목 선택 (없으면 이 소스는 결과 없음)
     → link 분류: instagram.com → 인스타 후보(높음) / 자체 도메인 → 홈페이지 후보(높음)
                  / 네이버·카카오 등 플랫폼 도메인 → 무시
  2. 웹문서 검색 → 인스타 계정 추출 (중간)
  3. 블로그 검색 → 인스타 계정/@멘션 추출 (낮음)
  4. 홈페이지 후보가 있으면: robots.txt 확인 → 허용 시 메인 1장 fetch → 인스타 링크 추출 (높음)
  5. 같은 계정이 여러 소스에서 나오면 합쳐서 신뢰도 상향, 근거 URL 전부 보존
```

**추출 규칙 (extract.js)**

- `instagram.com/<계정>`만 계정으로 인정. `p/`, `reel/`, `reels/`, `explore/`, `stories/`, `accounts/` 등 경로는 제외
- 계정명 정규화: 소문자, 쿼리스트링·끝 슬래시 제거, 인스타 계정 규칙(영문/숫자/`.`/`_`, 30자 이하) 검증
- 블로그 본문의 `@계정`은 이메일 주소와 구분 (`@` 앞이 공백/문장 시작일 때만)
- 검색 결과의 `<b>` 태그·HTML 엔티티 제거 후 처리

**크롤링 에티켓 (polite-fetch.js / robots.js)**

- User-Agent: `cardnews-channel-finder/0.1 (+https://github.com/7saval/cardnews)` — 누가 왜 요청하는지 밝힘
- `robots.txt`: 우리 UA 그룹 → 없으면 `*` 그룹 적용, Allow/Disallow는 가장 긴 매칭 우선. 호스트별 캐시(1회 실행 동안)
- `robots.txt`가 404면 허용, 타임아웃/5xx면 불허 (보수적으로)
- 같은 호스트에 1초 이상 간격, 요청 타임아웃 10초, 응답 2MB 초과 시 중단, `text/html`만 파싱
- 홈페이지당 메인 페이지 1장만 (링크를 따라 내려가지 않음)

## 5. 출력

`apps/image-matcher/output/<카드 JSON 이름>-channels.json` — 기계용 (근거 전체 보존)

```json
{
  "place_name": "신미식당",
  "address": "서울 강남구 압구정로 214",
  "candidates": [
    {
      "type": "instagram",
      "value": "shinmi_official",
      "confidence": "high",
      "sources": [
        { "via": "local.link", "url": "https://www.instagram.com/shinmi_official" },
        { "via": "webkr", "url": "https://..." }
      ]
    }
  ],
  "skipped": [{ "url": "https://example.com", "reason": "robots.txt disallow" }]
}
```

`apps/image-matcher/output/<이름>-channels.md` — 사람용 체크리스트

```markdown
## 신미식당 (서울 강남구 압구정로 214)
- [ ] 인스타 @shinmi_official (높음 · 지역검색, 웹문서)
- 홈페이지: 없음
```

확인 후 DM → 허락받으면 `npm run match -- --init`으로 만든 폴더에 사진과 `credit.txt`를 넣는 기존 흐름으로 이어진다.

**DM 템플릿 (체크리스트 하단에 포함)**

> 안녕하세요, 맛집 카드뉴스 계정 @matsoozip 입니다. 이번에 <주제> 카드뉴스에 <가게명>을 소개하고 싶은데,
> 계정에 올려주신 사진 1장을 사용해도 될까요? 카드에 @<가게계정> 출처를 표기하고 게시 후 링크도 공유드리겠습니다.

## 6. 구현 체크리스트

- [ ] NAVER API HUB에서 지역 검색 / 웹 문서 검색 / 블로그 검색 이용 신청 (사람 작업)
- [ ] `apps/image-matcher`에 `dotenv` 추가, `.env.example`에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- [ ] `lib/naver-search.js` — 3개 엔드포인트 호출, 에러 시 상태코드·본문 포함한 메시지
- [ ] 지역검색 스모크 테스트로 **`link`가 실제로 무엇을 주는지 확인** (홈페이지/인스타/빈 값 비율) — 결과에 따라 소스 우선순위 재조정
- [ ] `lib/extract.js` + 단위 테스트 (인스타 경로 제외 규칙, 이메일 오탐, `<b>` 태그 제거)
- [ ] `lib/robots.js` + 단위 테스트 (UA 그룹 선택, 가장 긴 매칭, Allow/Disallow 충돌, 빈 Disallow, 404/5xx 처리)
- [ ] `lib/polite-fetch.js` — UA, 호스트별 간격, 타임아웃, 크기 제한, content-type 확인
- [ ] `src/find-channels.js` — 흐름 조립, 주소 대조, 후보 병합·신뢰도, JSON/MD 출력
- [ ] `pipeline-test.json`(강남 야장 8곳)으로 실행해서 수동 검색 결과와 비교 — 정확도 기록
- [ ] `apps/image-matcher/README.md`, 계획서 Phase 3 체크리스트, 루트 README 갱신

## 7. 완료 기준

- `npm run find-channels -- --data <카드 JSON>` 한 번으로 장소별 인스타/홈페이지 후보가 근거와 함께 나온다
- 카카오맵·네이버 지도·인스타그램 페이지에는 요청을 한 번도 보내지 않는다 (로그로 확인 가능해야 함)
- `robots.txt`가 막은 홈페이지는 건너뛰고, 건너뛴 이유가 출력에 남는다
- 강남 야장 8곳 기준으로 절반 이상에서 맞는 계정이 후보 1순위에 오른다 (미달이면 소스/쿼리 조정)

## 8. 열린 질문

- **지역검색 `link`의 실제 내용** — 문서상 "상세 정보 URL"이라 가게 홈페이지일 수도, 네이버 플레이스 주소일 수도
  있다. 스모크 테스트 결과를 보고 1순위 유지 여부를 정한다.
- **체인점 처리** — "영동소금구이 논현본점"처럼 지점명이 붙은 경우 본점 계정과 지점 계정이 다를 수 있다.
  우선은 후보를 모두 보여주고 사람이 고르게 한다.
- **`robots.txt` 파서 직접 구현 vs 라이브러리** — 학습 목적으로 직접 구현하되, 단위 테스트로 표준 동작(RFC 9309)과
  맞는지 검증한다. 테스트가 과하게 복잡해지면 `robots-parser` 패키지로 교체 검토.
