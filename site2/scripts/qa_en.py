# site2 영어판 QA(2026-10-14) — python -X utf8 scripts/qa_en.py http://127.0.0.1:8792
#  (a) 영어 화면 PC 1440·모바일 390 캡처(_qa/en_*.png) + 머리줄 수·머리줄 높이·가로 넘침·콘솔 오류
#  (b) 화면에 남은 한글 글자 수(렌더된 글자 기준, 허용: 언어 버튼 "한국어"·"한국어로 보기"·괄호 속 한국 지명)
#  (c) 실제 클릭: 한국어 메인 → English → /en/ → 머리줄·왼쪽 메뉴·꼬리말 링크가 전부 /en/ 로 가는지 → 한국어 클릭 시 같은 화면 한국어판
#      + 언어 기억(영어 고른 뒤 한국어 주소로 들어오면 영어판으로 넘어가는지)
#  (d) 영어 페이지 전체(dist/en/**.html)의 사이트 안 링크 전수 상태(200)
# 결과: _qa/en_result.json, _qa/en_result.md (README_영어.md 표의 원본). 브라우저는 크로미움 하나만 띄움.
import sys, os, re, json, time, glob, urllib.request
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8792").rstrip("/")
SITE2 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QA = os.path.join(SITE2, "_qa"); os.makedirs(QA, exist_ok=True)
DIST = os.path.join(SITE2, "dist")

PAGES = [
    ("home", "/en/"), ("trend", "/en/trend/"), ("ai", "/en/ai/"), ("ai-claude", "/en/ai/claude/"), ("ai-gpt", "/en/ai/gpt/"),
    ("category", "/en/category/"), ("category-foundation", "/en/category/foundation-models/"),
    ("combos", "/en/combos/"), ("combos-video", "/en/combos/video/"), ("pricing", "/en/pricing/"), ("pricing-free", "/en/pricing/free/"),
    ("rank", "/en/rank/"), ("search", "/en/search/?q=claude"), ("board", "/en/board/"), ("map", "/en/map/"),
    ("privacy", "/en/privacy"), ("404", "/en/no-such-page/"), ("korea", "/en/korea/"), ("korea-seoraksan", "/en/korea/seoraksan/"),
]
VIEWPORTS = [("pc", 1440, 900), ("mobile", 390, 844)]
EXT = re.compile(r"googletagmanager|googlesyndication|google-analytics|jsdelivr|supabase|pages\.dev/api|aigalaxy-map\.com/api|net::ERR|Failed to load resource|^HTTP 4\d\d .*/(api/|no-such-page)")

def hangul_left(text):
    t = text.replace("한국어로 보기", " ")
    t = re.sub(r"(?<![가-힣])한국어(?![가-힣])", " ", t)  # 머리줄 언어 버튼
    t = re.sub(r"\(([^()]*[가-힣][^()]*)\)", lambda m: " " if len(m.group(1)) <= 30 else m.group(0), t)  # 괄호 속 지명 병기
    words = re.findall(r"[가-힣]+", t)
    return sum(len(w) for w in words), sorted(set(words), key=words.index)[:12]

def status(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (site2-qa)"}), timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return str(e)[:40]

rows, clicks = [], []
with sync_playwright() as p:
    browser = p.chromium.launch()
    try:
        # ---- (a)(b) 캡처·측정 ----
        for vname, w, h in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, locale="en-US")
            for name, path in PAGES:
                page = ctx.new_page()
                errs = []
                page.on("response", lambda r: errs.append(f"HTTP {r.status} {r.url}") if r.status >= 400 else None)
                page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
                page.on("pageerror", lambda e: errs.append(str(e)))
                heavy = name in ("map", "board")
                resp = page.goto(BASE + path, wait_until="load" if heavy else "networkidle", timeout=60000)
                time.sleep(5 if heavy else 0.8)
                info = page.evaluate("""() => { const hd = document.querySelector('header');
                  return { url: location.pathname, lang: document.documentElement.lang, headers: document.querySelectorAll('header').length,
                    headerH: hd ? Math.round(hd.getBoundingClientRect().height) : 0,
                    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
                    h1: document.querySelectorAll('h1').length, text: document.body.innerText, title: document.title }; }""")
                n, words = hangul_left(info["text"] + "\n" + info["title"])
                shot = f"en_{name}_{vname}.png"
                page.screenshot(path=os.path.join(QA, shot), full_page=not heavy)
                ext = [e for e in errs if EXT.search(e)]
                own = [e for e in errs if e not in ext]
                rows.append(dict(name=name, path=path, vp=vname, status=resp.status if resp else None, final=info["url"], lang=info["lang"], headers=info["headers"], headerH=info["headerH"],
                                 overflow=info["overflow"], sw=info["sw"], cw=info["cw"], h1=info["h1"], own=own, ext=ext, hangul=n, words=words, shot=shot))
                print(f"[{vname}] {path:32s} {rows[-1]['status']} lang={info['lang']} header={info['headers']}/{info['headerH']}px overflow={info['overflow']} err={len(own)}+{len(ext)} 한글={n} {' '.join(words[:6])}", flush=True)
                page.close()
            ctx.close()

        # ---- (c) 실제 클릭 ----
        def log(step, ok, detail=""):
            clicks.append(dict(step=step, ok=bool(ok), detail=detail)); print(("OK  " if ok else "FAIL") + f" {step} {detail}", flush=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR")
        page = ctx.new_page()
        page.goto(BASE + "/", wait_until="networkidle")
        log("한국어 메인 열림", page.evaluate("document.documentElement.lang") == "ko", page.url)
        page.click('header a[data-lang="en"]'); page.wait_for_load_state("networkidle"); time.sleep(0.5)
        log("English 클릭 → /en/ 도착", page.evaluate("location.pathname") == "/en/" and page.evaluate("document.documentElement.lang") == "en", page.url)
        # 머리줄·왼쪽 메뉴·꼬리말의 링크 모으기(영어 화면 기준)
        links = page.evaluate("""() => { const pick = (sel) => [...document.querySelectorAll(sel)].map(a => ({ text: a.innerText.trim().replace(/\\s+/g,' '), href: a.getAttribute('href') }));
          return { header: pick('header nav a'), logo: pick('header a:has(svg)').slice(0,1), side: pick('aside[aria-label] a'), footer: pick('footer a'), tabs: pick('mobile-tabs a') }; }""")
        for group, items in links.items():
            for it in items:
                href = it["href"] or ""
                if href.startswith("#"):
                    log(f"[{group}] {it['text']} (#login 그 자리)", True, href); continue
                if href.startswith("http") or href.endswith(".xml"):
                    log(f"[{group}] {it['text']} (RSS·사이트맵·바깥, 언어 없음)", True, href); continue
                if href == "/korea/":
                    log(f"[{group}] {it['text']} (한국어판 여행 목록 — 일부러 한국어)", True, href); continue
                okh = href.startswith("/en/")
                # 실제로 눌러서 도착 주소·언어 확인
                page.goto(BASE + "/en/", wait_until="domcontentloaded")
                sel = {"header": "header nav a", "logo": "header a:has(svg)", "side": "aside[aria-label] a", "footer": "footer a", "tabs": "mobile-tabs a"}[group]
                loc = page.locator(f'{sel}[href="{href}"]').first
                try:
                    if group == "tabs":
                        page.goto(BASE + href, wait_until="domcontentloaded")  # 하단 탭은 PC 폭에서 숨김 → 주소로 이동해 확인
                    else:
                        loc.click(timeout=5000)
                    page.wait_for_load_state("domcontentloaded"); time.sleep(0.4)
                    land, lang = page.evaluate("location.pathname"), page.evaluate("document.documentElement.lang")
                    log(f"[{group}] {it['text']}", okh and land.startswith("/en/") and lang == "en", f"{href} → {land} lang={lang}")
                except Exception as e:
                    log(f"[{group}] {it['text']}", False, f"{href} 클릭 실패 {str(e)[:80]}")
        # 영어 도구 화면에서 한국어 클릭 → 같은 화면 한국어판
        for en_path, ko_path in [("/en/ai/claude/", "/ai/claude/"), ("/en/combos/video/", "/combos/video/"), ("/en/pricing/free/", "/pricing/free/"), ("/en/", "/")]:
            page.goto(BASE + en_path, wait_until="networkidle")
            page.click('header a[data-lang="ko"]'); page.wait_for_load_state("networkidle"); time.sleep(0.4)
            land = page.evaluate("location.pathname")
            log(f"{en_path} 에서 한국어 클릭", land == ko_path and page.evaluate("document.documentElement.lang") == "ko", f"→ {land}")
        # 언어 기억: 영어 고른 뒤 한국어 주소로 직접 들어오면 영어판으로
        page.goto(BASE + "/ai/claude/", wait_until="networkidle")
        page.click('header a[data-lang="en"]'); page.wait_for_load_state("networkidle"); time.sleep(0.4)
        page.goto(BASE + "/category/", wait_until="networkidle"); time.sleep(0.6)
        log("영어 기억 상태에서 /category/ 직접 열기 → /en/category/", page.evaluate("location.pathname") == "/en/category/", page.url)
        page.goto(BASE + "/search/?q=gemini", wait_until="networkidle"); time.sleep(0.6)
        log("영어 기억 상태에서 /search/?q=gemini → 검색어 유지한 채 /en/search/", page.evaluate("location.pathname + location.search") == "/en/search/?q=gemini", page.url)
        n_res = page.locator("[data-results] li").count()
        log("영어 검색 결과 표시(gemini)", n_res > 0, f"{n_res}개, 첫 줄: {page.locator('[data-results] li').first.inner_text()[:80] if n_res else ''}")
        page.goto(BASE + "/en/", wait_until="networkidle")
        page.fill('header input[type="search"]', "clau"); time.sleep(0.8)
        sug = page.locator('header ai-search ul[role="listbox"] a').first
        sug_href = sug.get_attribute("href") if sug.count() else None
        log("머리줄 검색 자동완성(영어) 제안 주소가 /en/", bool(sug_href and sug_href.startswith("/en/")), f"{sug_href} · {sug.inner_text() if sug.count() else ''}")
        page.click('header a[data-lang="ko"]'); page.wait_for_load_state("networkidle")
        page.goto(BASE + "/en/rank/", wait_until="networkidle"); time.sleep(0.6)
        log("한국어 기억 상태에서 /en/rank/ 열기 → /rank/", page.evaluate("location.pathname") == "/rank/", page.url)
        ctx.close()
    finally:
        browser.close()

# ---- (d) 영어 페이지 전체의 사이트 안 링크 ----
hrefs = set()
en_files = glob.glob(os.path.join(DIST, "en", "**", "*.html"), recursive=True)
for f in en_files:
    for h in re.findall(r'href="(/[^"#]*)', open(f, encoding="utf-8").read()):
        if h.startswith(("/map/app/", "/galaxy_saas/")): continue
        hrefs.add(h.split("?")[0] or "/")
link_status = {h: status(BASE + h) for h in sorted(hrefs)}
bad = {k: v for k, v in link_status.items() if v != 200}
en_links = [h for h in hrefs if h.startswith("/en/")]
ko_links = sorted(h for h in hrefs if not h.startswith("/en/"))

json.dump(dict(rows=rows, clicks=clicks, links=link_status, en_pages=len(en_files)), open(os.path.join(QA, "en_result.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
md = [f"# 영어판 QA ({time.strftime('%Y-%m-%d %H:%M')}, {BASE})", "",
      "| 화면 | 주소 | 폭 | 상태 | lang | header 수/높이 | 가로 넘침 | h1 | 콘솔 오류(자체/외부) | 남은 한글(자) | 남은 한글 예 | 캡처 |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
for r in rows:
    md.append(f"| {r['name']} | {r['path']} | {r['vp']} | {r['status']} | {r['lang']} | {r['headers']}/{r['headerH']}px | {'있음 ' + str(r['sw']) + '>' + str(r['cw']) if r['overflow'] else '없음'} | {r['h1']} | {len(r['own'])}/{len(r['ext'])} | {r['hangul']} | {' '.join(r['words'][:6])} | {r['shot']} |")
md += ["", f"## 클릭 시험 — {sum(c['ok'] for c in clicks)}/{len(clicks)} 통과", ""] + [f"- {'통과' if c['ok'] else '실패'} · {c['step']} · {c['detail']}" for c in clicks]
md += ["", f"## 링크 — 영어 페이지 {len(en_files)}개에서 사이트 안 주소 {len(link_status)}개(/en/ {len(en_links)}개 · 그 밖 {len(ko_links)}개) 확인, 200 아님 {len(bad)}개", ""]
md += [f"- {k} → {v}" for k, v in bad.items()]
md += ["", "영어 페이지에서 /en/ 이 아닌 사이트 안 링크: " + ", ".join(ko_links[:40]) + (" …" if len(ko_links) > 40 else "")]
md += ["", "## 콘솔 오류 상세", ""] + [f"- [자체] {r['name']}/{r['vp']}: {e[:180]}" for r in rows for e in r["own"]] + [f"- [외부] {r['name']}/{r['vp']}: {e[:180]}" for r in rows for e in r["ext"]]
open(os.path.join(QA, "en_result.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
print("\n".join(md[-60:]))
