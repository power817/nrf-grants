# NRF 연구비 공고 수집기 (nrf-grants)

한국연구재단(NRF) **신규사업공모** 공고를 긁어와 구조화된 JSON으로 만드는 수집기입니다.
최종 목표는 "내 정보를 넣으면 나에게 맞는 공고를 추천해주는 웹앱"이며, **현재 단계는 데이터 수집(전체 수집)** 입니다.

- 데이터 출처: <https://www.nrf.re.kr/page/362?menuNo=362&bizNotGubn=guide> (신규사업공모)

## 빠른 시작

```bash
# 1) 목록·상세 수집 (Node)
npm install
npm run collect            # 올해 공고 전체(목록+상세) 수집 -> data/announcements.json
npm test                   # 파서 회귀 테스트 (오프라인 fixture)

# 2) 공고문 PDF 다운로드·텍스트화 (Python venv)
python3 -m venv .venv
./.venv/bin/pip install pdfplumber pypdf requests
./.venv/bin/python src/pdf_extract.py         # PDF 공고문 -> data/pdf_text/*.txt

# 3) 연구기간·전임/비전임 등 필드 추출은 다중 에이전트 워크플로우로 수행
#    -> data/pdf_fields/<postNo>.json

# 4) 추출 필드를 병합
node src/merge_fields.js                       # -> data/announcements_enriched.json

# 5) 웹앱 실행 (내 정보 입력 -> 맞춤 공고 조회)
npm run web:data                               # enriched -> web/data.json (프론트엔드용)
npm run web                                    # http://localhost:8123 정적 서버
```

### 웹앱

`web/` 는 **서버 없이 배포 가능한 정적 SPA** 입니다 (데이터는 `web/data.json` 하나만 읽음).
신분(전임/비전임/학생/기관)·관심 키워드·사업 분야·연구비 규모로 필터링하고 **추천 매칭순**으로 정렬하며,
각 공고를 **연구비 · 연구기간 · 신청기간 · 전임/비전임 · 서식/공고문 다운로드 링크** 카드로 보여줍니다.
데스크톱·모바일 반응형. GitHub Pages/Vercel 등에 `web/` 폴더만 올리면 공유 가능하고, 데이터는 위 파이프라인을 주기적으로 돌려 갱신합니다.

> Python 의존성은 **프로젝트 로컬 `.venv`** 에만 설치합니다(전역 오염 없음). Node 의존성은 `node_modules` 로 이미 격리됩니다.

### 옵션

```bash
node src/collect.js --years 2026,2025     # 특정 연도들
node src/collect.js --from 2023 --to 2026 # 연도 범위
node src/collect.js --list-only           # 상세 생략(빠름)
node src/collect.js --limit 5             # 상세 수집 개수 제한(테스트)
node src/collect.js --concurrency 6       # 동시 요청 수
node src/collect.js --out data/foo.json   # 출력 경로
```

## 동작 원리

NRF 목록은 자바스크립트가 그리는 게 아니라, **날짜 필터가 채워진 GET 요청에 대해 서버가 HTML을 렌더**합니다.
따라서 헤드리스 브라우저 없이 `fetch` + `cheerio`만으로 가볍고 안정적으로 수집합니다.

- **목록:** `GET /page/362?...&bizSearchRegDttmAllYn=Y&searchRegYearDttm=<연도>&pageSize=100&pageNum=<n>`
  → `div.public-notice-block` 단위로 파싱 (제목·분류·접수기간·상태·postNo)
- **상세:** `GET /biz/notice/view?ac=view&postNo=<postNo>&menuNo=362&bizNo=<bizNo>`
  → 사업금액·신청기간·등록정보·첨부파일·본문 파싱
- **첨부:** `a.omks--file-name[data-attach_no]` → `GET /download/post/loading/<attachNo>`

## 수집 데이터 스키마 (`data/announcements.json`)

```jsonc
{
  "source": "https://www.nrf.re.kr/page/362?...",
  "collectedYears": [2026],
  "count": 262,
  "announcements": [
    {
      "postNo": "263147",
      "bizNo": "116",
      "year": 2026,
      "title": "2026년도 해외우수연구기관 협력허브 구축사업 ...",
      "category": "국제협력사업 > 동북아 R&D 허브 기반구축 > ...",
      "categoryPath": ["국제협력사업", "동북아 R&D 허브 기반구축", "..."],
      "status": "접수중 | 접수대기 | 접수마감",
      "applyStart": "2026-02-10 09:00",   // 신청(접수) 시작
      "applyEnd":   "2026-04-20 18:00",   // 신청(접수) 마감
      "modified": false,                   // 수정공고 여부
      "amountRaw": "600,000,000 원",       // 사업 금액(연구비 규모, 원문)
      "amountKRW": 600000000,              // 숫자화
      "registrant": "성세희",
      "regDate": "2026-02-10 17:54:01",
      "views": 15372,
      "attachments": [                     // 서식·공고문 등 첨부파일
        { "name": "[서식1] 연구개발계획서 양식.zip",
          "attachNo": "146588",
          "url": "https://www.nrf.re.kr/download/post/loading/146588" }
      ],
      "bodyText": "공고내용 ...",           // 상세 페이지 본문 텍스트
      "detailUrl": "https://www.nrf.re.kr/biz/notice/view?ac=view&postNo=263147&...",
      "detailFetched": true
    }
  ]
}
```

## 요청 항목 커버리지

| 항목 | 상태 | 비고 |
|---|---|---|
| 제목 / 사업분류 / 상태 | ✅ | 목록·상세 HTML |
| 신청기간(접수일자) | ✅ | 목록·상세 HTML |
| 연구비 규모(사업 금액) | ✅ | 상세 HTML의 "사업 금액". 일부 사업은 0/미표기 |
| 서식·관련 링크(첨부) | ✅ | 상세 HTML의 첨부 다운로드 URL |
| **연구기간** | 🔶 | 공고문 **PDF**에서 추출 (PDF 있는 128건 대상). HWP-only 132건은 미커버 |
| **전임/비전임 구분·세부 자격** | 🔶 | 공고문 **PDF** 텍스트 → LLM 추출 (`data/pdf_fields/`). HWP-only는 미커버 |

> ⚠️ **PDF 커버리지:** 262건 중 PDF 첨부가 있는 공고는 **128건(49%)** 뿐이고, 나머지 **132건은 HWP만** 제공합니다. 현재 연구기간·전임/비전임 추출은 **PDF 있는 공고**만 대상입니다. 전체 커버는 HWP(X) 파싱 추가가 필요합니다.

## 로드맵

1. **[완료] 전체 수집** — 목록·상세·첨부 링크를 구조화 JSON으로 (262건)
2. **[완료] PDF 문서 파싱** — 공고문 PDF(128건) → 텍스트화 → 연구기간·연구비·전임/비전임·자격을 다중 에이전트로 추출·검증
3. **[완료] 웹앱(뷰어+기본 추천)** — 신분·키워드·분야·연구비로 필터/매칭 정렬, 카드 표시 (`web/`)
4. **[예정] HWP-only 132건 커버** — .hwpx(zip+XML)·.hwp(pyhwp) 파싱으로 연구기간·전임여부 전체 커버
5. **[예정] 고도화 추천** — 프로필 기반 LLM 스코어링, 저장/알림, 다년도 수집, 정기 배치·배포

## 구조

```
src/
  http.js           # fetch(UA/referer/retry), 동시성 제한, 목록 URL 빌더
  parse.js          # parseList / parseLastPage / parseDetail
  collect.js        # 목록·상세 수집 오케스트레이터 (CLI, Node)
  pdf_extract.py    # 공고문 PDF 다운로드 + 텍스트 추출 (Python/venv)
  merge_fields.js   # data/pdf_fields/*.json -> announcements_enriched.json
  build_web_data.js # enriched -> web/data.json (프론트엔드용 compact)
web/
  index.html · style.css · app.js  # 정적 SPA (내 정보 -> 맞춤 공고)
  data.json                        # 프론트엔드 데이터 (빌드 산출)
server.js           # web/ 정적 서버 (npm run web)
tests/
  parse.test.js
  fixtures/       # 오프라인 파서 테스트용 저장 HTML
data/
  announcements.json          # 목록+상세 (Node 수집)
  pdf_text/<postNo>.txt        # 공고문 PDF에서 추출한 텍스트
  pdf_fields/<postNo>.json     # 연구기간·전임/비전임 등 추출 필드 (워크플로우 산출)
  pdf_index.json               # PDF 대상 공고 인덱스
  announcements_enriched.json  # 위를 병합한 최종 데이터
.venv/                         # Python 가상환경 (git 제외)
```
