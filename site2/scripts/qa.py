# site2 QA — Playwright(크로미움 1개만 띄움)로 PC 1440·모바일 390 캡처(_qa/), 화면마다
#   머리줄 수(header 요소) · 가로 넘침(scrollWidth > clientWidth) · 콘솔 오류 · 개발용 문구 · 내부 링크 상태(200)
# 를 재서 _qa/qa_result.md 에 표로 남긴다.
#   python -X utf8 scripts/qa.py http://127.0.0.1:8792
import sys, os, re, json, time, urllib.request, urllib.parse
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8792").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
QA = os.path.join(os.path.dirname(HERE), "_qa")
os.makedirs(QA, exist_ok=True)

PAGES = [
    ("home", "/"), ("home-a", "/home/a/"), ("home-b", "/home/b/"), ("home-c", "/home/c/"), ("trend", "/trend/"), ("ai", "/ai/"), ("ai-claude", "/ai/claude/"), ("ai-gpt", "/ai/gpt/"),
    ("category", "/category/"), ("category-foundation", "/category/foundation-models/"),
    ("korea", "/korea/"), ("korea-seoraksan", "/korea/seoraksan/"), ("korea-gwangjin", "/korea/gwangjin-beach/"),
    ("en-korea", "/en/korea/"), ("en-korea-seoraksan", "/en/korea/seoraksan/"),
    ("map", "/map/"), ("board", "/board/"), ("privacy", "/privacy"), ("404", "/no-such-page/"),
]
VIEWPORTS = [("pc", 1440, 900), ("mobile", 390, 844)]
DEV_WORDS = ["TODO", "lorem", "Lorem", "placeholder", "자리 표시", "작업명", "교차검증", "채움 문구", "undefined", "NaN", "[object Object]"]
# 외부·앵커·iframe 앱 내부 링크는 제외하고 site2 자신의 내부 링크만 상태 확인
SKIP_LINK = re.compile(r"^(https?:|mailto:|tel:|#|javascript:)|^/map/app/|^/galaxy_saas/")

def head(url):
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "Mozilla/5.0 (site2-qa)"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return str(e)[:40]

rows, links, link_status = [], set(), {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    try:
        for vname, w, h in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, locale="ko-KR")
            for name, path in PAGES:
                page = ctx.new_page()
                errors = []
                page.on("response", lambda r: errors.append(f"HTTP {r.status} {r.url}") if r.status >= 400 else None)
                page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
                page.on("pageerror", lambda e: errors.append(str(e)))
                heavy = name in ("map", "board")  # 3D 앱은 실시간 연결 때문에 networkidle 이 안 옴
                resp = page.goto(BASE + path, wait_until="load" if heavy else "networkidle", timeout=60000)
                time.sleep(6 if heavy else 0.6)
                status = resp.status if resp else None
                info = page.evaluate("""() => ({
                    headers: document.querySelectorAll('header').length,
                    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
                    title: document.title,
                    h1: document.querySelectorAll('h1').length,
                    text: document.body.innerText,
                    links: Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')),
                    iframe: !!document.querySelector('iframe'),
                })""")
                dev = [wd for wd in DEV_WORDS if wd in info["text"]]
                for href in info["links"]:
                    if href and not SKIP_LINK.search(href):
                        links.add(href.split("#")[0].split("?")[0] or "/")
                shot = os.path.join(QA, f"{name}_{vname}.png")
                page.screenshot(path=shot, full_page=(name not in ("map", "board")))
                # 외부 자원(폰트 CDN·GA·애드센스·지도 앱 외부 API)의 네트워크 실패는 빌드 결함이 아니므로 따로 분류
                ext = [e for e in errors if re.search(r"googletagmanager|googlesyndication|jsdelivr|supabase|aigalaxy-map\.com/api|net::ERR|Failed to load resource|^HTTP 4\d\d .*/(api/|no-such-page)", e)]
                own = [e for e in errors if e not in ext]
                rows.append(dict(name=name, path=path, vp=vname, status=status, headers=info["headers"], overflow=info["overflow"], sw=info["sw"], cw=info["cw"],
                                 h1=info["h1"], errors_own=own, errors_ext=ext, dev=dev, title=info["title"], iframe=info["iframe"], shot=os.path.basename(shot)))
                print(f"[{vname}] {path:28s} {status} header={info['headers']} overflow={info['overflow']} ({info['sw']}/{info['cw']}) err={len(own)}+{len(ext)} dev={dev}", flush=True)
                page.close()
            ctx.close()
    finally:
        browser.close()

for href in sorted(links):
    link_status[href] = head(BASE + href)
bad = {k: v for k, v in link_status.items() if v != 200}

md = ["# site2 QA 결과 (" + time.strftime("%Y-%m-%d %H:%M") + ", " + BASE + ")", "",
      "| 화면 | 주소 | 폭 | 상태 | header 수 | 가로 넘침 | h1 수 | 콘솔 오류(자체/외부) | 개발용 문구 | 캡처 |", "|---|---|---|---|---|---|---|---|---|---|"]
for r in rows:
    md.append(f"| {r['name']} | {r['path']} | {r['vp']} | {r['status']} | {r['headers']} | {'있음 ' + str(r['sw']) + '>' + str(r['cw']) if r['overflow'] else '없음'} | {r['h1']} | {len(r['errors_own'])}/{len(r['errors_ext'])} | {', '.join(r['dev']) or '없음'} | {r['shot']} |")
md += ["", f"## 내부 링크 상태 — 확인 {len(link_status)}개, 200 아님 {len(bad)}개", ""]
for k, v in sorted(bad.items()):
    md.append(f"- {k} → {v}")
md += ["", "## 콘솔 오류 상세", ""]
for r in rows:
    for e in r["errors_own"]:
        md.append(f"- [자체] {r['name']}/{r['vp']}: {e[:200]}")
    for e in r["errors_ext"]:
        md.append(f"- [외부] {r['name']}/{r['vp']}: {e[:200]}")
open(os.path.join(QA, "qa_result.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
json.dump(dict(rows=rows, links=link_status), open(os.path.join(QA, "qa_result.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\n".join(md))
