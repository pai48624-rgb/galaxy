# 영어 트렌드 글(/en/trend/<id>/) QA(2026-10-14) — python -X utf8 scripts/qa_en_trend.py http://127.0.0.1:8792
#  (a) 번역된 글마다 PC 1440·모바일 390 캡처(_qa/en_trend_<id>_<pc|mobile>.png) + 머리줄 수·가로 넘침·콘솔 오류·남은 한글
#  (b) 글 틀 비교: 한국어 원문(/trend/<id>, 워커 화면)과 영어 글의 본문 요소 수(태그별·class 붙은 요소·표 칸)가 같은지
#  (c) 실제 클릭: /en/trend/ 카드 → 영어 글 도착 / 메인 /en/ 트렌드 칩·카드 → 영어 글 / 영어 글 머리줄 "한국어" → /trend/<id> / "Read the Korean original" → /trend/<id>
#  (d) 영어 글 안 사이트 링크 전부 상태 200
# 결과: _qa/en_trend_result.json, _qa/en_trend_result.md. 브라우저는 크로미움 하나만.
import sys, os, re, json, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8792").rstrip("/")
SITE2 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QA = os.path.join(SITE2, "_qa"); os.makedirs(QA, exist_ok=True)
CACHE = json.load(open(os.path.join(SITE2, "src", "i18n", "cache", "trend_posts.json"), encoding="utf8"))
IDS = sorted(CACHE.keys(), key=int)
VIEWPORTS = [("pc", 1440, 900), ("mobile", 390, 844)]
EXT = re.compile(r"googletagmanager|googlesyndication|google-analytics|jsdelivr|fonts\.g|supabase|net::ERR|Failed to load resource")

def hangul_left(text):
    t = re.sub(r"(?<![가-힣])한국어(?![가-힣])", " ", text)  # 머리줄 언어 버튼
    t = re.sub(r"\(([^()]*[가-힣][^()]*)\)", lambda m: " " if len(m.group(1)) <= 30 else m.group(0), t)  # 괄호 속 고유명사 병기
    words = re.findall(r"[가-힣]+", t)
    return sum(len(w) for w in words), sorted(set(words), key=words.index)[:12]

def status(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return str(e)[:40]

# 본문 구조 지문: 글 틀(.gx) 또는 옛 글(.paper) 안 요소를 태그별·class별로 센다(글자는 안 봄)
SHAPE_JS = """() => { const root = document.querySelector('.trend-post .gx') || document.querySelector('.trend-post .paper');
  if (!root) return null; const els = [...root.querySelectorAll('*')].filter(e => e.tagName !== 'STYLE');
  const by = {}; els.forEach(e => { const k = e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : ''); by[k] = (by[k] || 0) + 1; });
  return { kind: root.classList.contains('gx') ? 'gx' : 'paper', total: els.length, classed: els.filter(e => e.className).length,
    tables: root.querySelectorAll('table').length, cells: root.querySelectorAll('td,th').length, links: root.querySelectorAll('a').length, by }; }"""

rows, shapes, clicks = [], [], []
with sync_playwright() as p:
    browser = p.chromium.launch()
    try:
        for vname, w, h in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, locale="en-US")
            for i in IDS:
                page = ctx.new_page(); errs = []
                page.on("response", lambda r: errs.append(f"HTTP {r.status} {r.url}") if r.status >= 400 else None)
                page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
                page.on("pageerror", lambda e: errs.append(str(e)))
                resp = page.goto(f"{BASE}/en/trend/{i}/", wait_until="networkidle", timeout=60000); time.sleep(0.8)
                info = page.evaluate("""() => ({ url: location.pathname, lang: document.documentElement.lang, headers: [...document.querySelectorAll('header')].filter(h => h.getBoundingClientRect().height > 0).length,  /* 보이는 머리줄(채팅 창의 숨은 header 제외) */
                  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, sw: document.documentElement.scrollWidth,
                  text: document.body.innerText, title: document.title, desc: (document.querySelector('meta[name=description]')||{}).content || '' })""")
                n, words = hangul_left(info["text"] + "\n" + info["title"] + "\n" + info["desc"])
                shot = f"en_trend_{i}_{vname}.png"
                page.screenshot(path=os.path.join(QA, shot), full_page=True)
                ext = [e for e in errs if EXT.search(e)]; own = [e for e in errs if e not in ext]
                rows.append(dict(id=i, vp=vname, status=resp.status if resp else None, final=info["url"], lang=info["lang"], headers=info["headers"], overflow=info["overflow"], sw=info["sw"], own=own, ext=ext, hangul=n, words=words, shot=shot))
                print(f"[{vname}] /en/trend/{i}/ {rows[-1]['status']} lang={info['lang']} header={info['headers']} overflow={info['overflow']} err={len(own)}+{len(ext)} 한글={n} {' '.join(words[:6])}", flush=True)
                if vname == "pc":
                    en_shape = page.evaluate(SHAPE_JS)
                    ko = ctx.new_page(); ko.goto(f"{BASE}/trend/{i}", wait_until="networkidle", timeout=60000); time.sleep(0.5)
                    ko_shape = ko.evaluate(SHAPE_JS); ko.close()
                    diff = {k: (ko_shape["by"].get(k, 0), en_shape["by"].get(k, 0)) for k in set(ko_shape["by"]) | set(en_shape["by"]) if ko_shape["by"].get(k, 0) != en_shape["by"].get(k, 0)} if ko_shape and en_shape else {"?": "본문 못 찾음"}
                    shapes.append(dict(id=i, kind=(en_shape or {}).get("kind"), ko={k: v for k, v in (ko_shape or {}).items() if k != "by"}, en={k: v for k, v in (en_shape or {}).items() if k != "by"}, diff=diff))
                    print(f"   틀 비교 {i}: ko={shapes[-1]['ko']} en={shapes[-1]['en']} 차이={diff}", flush=True)
                page.close()
            ctx.close()

        def log(step, ok, detail=""):
            clicks.append(dict(step=step, ok=bool(ok), detail=detail)); print(("OK  " if ok else "FAIL") + f" {step} {detail}", flush=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-US")
        page = ctx.new_page()
        # 영어 목록 카드 → 영어 글
        for i in IDS:
            page.goto(f"{BASE}/en/trend/", wait_until="networkidle")
            loc = page.locator(f'trend-list a[href="/en/trend/{i}/"]').first
            if not loc.count():
                log(f"/en/trend/ 카드 {i}", False, "카드 없음"); continue
            title = loc.locator("b").inner_text()
            loc.click(); page.wait_for_load_state("networkidle"); time.sleep(0.3)
            land = page.evaluate("location.pathname"); lang = page.evaluate("document.documentElement.lang")
            log(f"/en/trend/ 카드 '{title[:50]}' 클릭", land == f"/en/trend/{i}/" and lang == "en", f"→ {land} lang={lang}")
        # 메인 영어판 트렌드 링크(칩·카드)
        page.goto(f"{BASE}/en/", wait_until="networkidle")
        home_links = page.evaluate("""() => [...document.querySelectorAll('a[href*="/trend/"]')].map(a => a.getAttribute('href')).filter(h => /\\/trend\\/\\d+/.test(h))""")
        bad = [h for h in home_links if not (h.startswith("/en/trend/") or re.sub(r"\D", "", h) not in IDS)]
        log("메인 /en/ 의 트렌드 글 링크가 번역된 글이면 /en/trend/<id>/", not bad and bool(home_links), f"{len(home_links)}개 {sorted(set(home_links))} 틀린 것 {bad}")
        first = page.locator('a[href^="/en/trend/"][href$="/"]:not([href="/en/trend/"])').first
        if first.count():
            href = first.get_attribute("href"); first.click(); page.wait_for_load_state("networkidle")
            log("메인 /en/ 트렌드 링크 클릭", page.evaluate("location.pathname") == href, f"{href} → {page.evaluate('location.pathname')}")
        # 영어 글 → 한국어
        for i in IDS:
            page.goto(f"{BASE}/en/trend/{i}/", wait_until="networkidle")
            page.click('header a[data-lang="ko"]'); page.wait_for_load_state("networkidle"); time.sleep(0.4)
            land = page.evaluate("location.pathname")
            log(f"/en/trend/{i}/ 머리줄 '한국어' 클릭", land.rstrip("/") == f"/trend/{i}", f"→ {land} lang={page.evaluate('document.documentElement.lang')}")
            page.evaluate("localStorage.setItem('galaxyLang','en')")  # 한국어를 누르면 언어 기억이 ko 가 되어 영어 주소가 한국어로 넘어가므로 되돌림
            page.goto(f"{BASE}/en/trend/{i}/", wait_until="networkidle")
            page.click(".tr-note a"); page.wait_for_load_state("networkidle"); time.sleep(0.3)
            land = page.evaluate("location.pathname")
            log(f"/en/trend/{i}/ 'Read the Korean original' 클릭", land.rstrip("/") == f"/trend/{i}", f"→ {land}")
            page.evaluate("localStorage.setItem('galaxyLang','en')")
        ctx.close()
    finally:
        browser.close()

# (d) 영어 글 안 사이트 링크
hrefs = set()
for i in IDS:
    html = open(os.path.join(SITE2, "dist", "en", "trend", i, "index.html"), encoding="utf8").read()
    for h in re.findall(r'href="(/[^"#]*)', html):
        if not h.startswith("/_astro"):
            hrefs.add(h)
link_bad = {h: s for h in sorted(hrefs) if (s := status(BASE + h)) != 200}
print(f"영어 글 안 사이트 링크 {len(hrefs)}개, 200 아님 {len(link_bad)}개 {link_bad}")

json.dump(dict(rows=rows, shapes=shapes, clicks=clicks, links=len(hrefs), link_bad=link_bad), open(os.path.join(QA, "en_trend_result.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
md = ["| 글 | 화면 | 상태 | 머리줄 | 넘침 | 오류(자체+외부) | 남은 한글 |", "|---|---|---|---|---|---|---|"]
md += [f"| /en/trend/{r['id']}/ | {r['vp']} | {r['status']} | {r['headers']} | {'있음' if r['overflow'] else '0'} | {len(r['own'])}+{len(r['ext'])} | {r['hangul']} |" for r in rows]
md += ["", "| 글 | 틀 | 요소 수 ko→en | class 요소 ko→en | 표 칸 ko→en | 링크 ko→en | 다른 곳 |", "|---|---|---|---|---|---|---|"]
md += [f"| {s['id']} | {s['kind']} | {s['ko'].get('total')}→{s['en'].get('total')} | {s['ko'].get('classed')}→{s['en'].get('classed')} | {s['ko'].get('cells')}→{s['en'].get('cells')} | {s['ko'].get('links')}→{s['en'].get('links')} | {s['diff'] or '없음'} |" for s in shapes]
md += ["", f"클릭 {sum(c['ok'] for c in clicks)}/{len(clicks)} 통과", ""] + [f"- {'OK' if c['ok'] else 'FAIL'} {c['step']} {c['detail']}" for c in clicks]
md += ["", f"영어 글 안 사이트 링크 {len(hrefs)}개, 200 아님 {len(link_bad)}개 {link_bad or ''}"]
open(os.path.join(QA, "en_trend_result.md"), "w", encoding="utf8").write("\n".join(md) + "\n")
