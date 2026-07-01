# 배포 가이드

웹앱(`web/`)은 **빌드가 필요 없는 정적 사이트**입니다 (`index.html` + `style.css` + `app.js` + `data.json`).
아무 정적 호스팅에나 `web/` 폴더만 올리면 됩니다. 데이터 갱신은 파이프라인을 다시 돌려 `web/data.json`을 교체합니다.

---

## A. GitHub Pages (추천 · 자동화 포함)

이 저장소에는 두 개의 GitHub Actions 워크플로가 포함되어 있습니다.
- `.github/workflows/deploy-pages.yml` — `web/` 를 GitHub Pages로 배포 (push 시 자동)
- `.github/workflows/refresh-data.yml` — 매일 06:00(KST) NRF를 다시 수집해 `web/data.json` 갱신

**최초 1회 설정:**

```bash
# 0) (미인증 시) GitHub 로그인
gh auth login

# 1) 원격 저장소 생성 + 푸시  (공개 저장소 예시)
gh repo create nrf-grants --public --source=. --remote=origin --push
```

2. GitHub 저장소 → **Settings → Pages → Build and deployment → Source = "GitHub Actions"** 선택
3. **Settings → Actions → General → Workflow permissions = "Read and write"** (refresh 워크플로가 커밋하려면 필요)

이후 `main` 에 push 하면 자동 배포되고, 사이트는 `https://<사용자>.github.io/nrf-grants/` 에 뜹니다.
앱은 `data.json` 을 상대경로로 읽으므로 하위경로 배포에서도 동작합니다.

> 수동 배포/갱신: 저장소 **Actions** 탭에서 각 워크플로를 `Run workflow` 로 즉시 실행할 수 있습니다.

---

## B. Vercel

정적 사이트로 배포 (루트 디렉터리를 `web/` 로 지정). 저장소에 `vercel.json` 포함.

```bash
npm i -g vercel
vercel            # 최초: 프로젝트 연결
vercel --prod     # 배포
```

---

## C. Netlify

```bash
npm i -g netlify-cli
netlify deploy --dir=web --prod
```
또는 Netlify 대시보드에서 저장소 연결 후 **Publish directory = `web`**.

---

## D. 로컬 실행

```bash
npm run web       # http://localhost:8123
```

---

## 데이터 갱신 파이프라인 (수동 전체 갱신)

접수기간·상태 등 HTML 기반 정보는 위 refresh 워크플로가 자동 갱신합니다.
**연구기간·전임/비전임**(PDF/HWP 공고문 추출) 까지 포함한 전체 재생성은 로컬에서:

```bash
npm run collect                               # 목록·상세
./.venv/bin/python src/pdf_extract.py         # PDF 공고문 -> data/pdf_text/
./.venv/bin/python src/hwp_extract.py         # HWP 공고문 -> data/hwp_text/
#   -> (다중 에이전트 추출 워크플로우 실행) -> data/pdf_fields/*.json
npm run merge                                 # -> announcements_enriched.json
npm run web:data                              # -> web/data.json
git add -A && git commit -m "data refresh" && git push
```
