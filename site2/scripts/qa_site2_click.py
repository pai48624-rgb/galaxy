# -*- coding: utf-8 -*-
"""site2 전 기능 클릭 시험. 사용법: python -X utf8 qa_site2_click.py http://127.0.0.1:8792 [http://127.0.0.1:8794(워커 포함)]
항목: 머리줄 링크 전부, 왼쪽 메뉴 전부, 꼬리말 링크, 언어 전환, 검색창 자동완성→이동, 메인 카드(순위 칩·오늘의 흐름·여행·분야·도구), 조합/요금제/순위/검색 페이지 링크,
게시판 로그인 버튼→구글, 지도 iframe(캔버스·검색·앱 안 중복 링크 숨김), 모바일(햄버거·하단 탭), 트렌드 글(워커 주소 있으면)."""
import sys, json, re, requests, pathlib
from playwright.sync_api import sync_playwright
B = sys.argv[1].rstrip("/"); W = sys.argv[2].rstrip("/") if len(sys.argv) > 2 else None
OUT = pathlib.Path("qa2"); OUT.mkdir(exist_ok=True); R = {}; fails = []
def ok(name, cond, info=""):
    R[name] = {"ok": bool(cond), "info": str(info)[:160]}
    if not cond: fails.append((name, str(info)[:160]))
GL = ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--disable-dev-shm-usage"]); ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:80]))
    pg.goto(B + "/", timeout=60000); pg.wait_for_timeout(800)
    # 1 머리줄 링크 전부 클릭
    hdr = pg.evaluate("[...document.querySelectorAll('header nav a')].map(a=>[a.textContent.trim(),a.getAttribute('href')])")
    for text, href in hdr:
        pg.goto(B + "/", timeout=60000); pg.wait_for_timeout(300); pg.click(f"header nav a[href='{href}']"); pg.wait_for_timeout(900)
        ok(f"머리줄:{text}", pg.url.replace(B, "").startswith(href.split("#")[0]) and pg.evaluate("document.querySelectorAll('header').length===1"), pg.url.replace(B, ""))
    # 2 왼쪽 메뉴 전부
    pg.goto(B + "/", timeout=60000); pg.wait_for_timeout(500)
    side = pg.evaluate("[...document.querySelectorAll('main aside a')].map(a=>[a.textContent.trim(),a.getAttribute('href')])")
    dup = [t for t, h in side if h in [x[1] for x in hdr] and not t.startswith("+")]  # "+N개 더"(분야 더 보기)는 의도된 링크
    ok("왼쪽 메뉴에 머리줄 중복 없음", len(dup) == 0, dup)
    for text, href in side:
        if href.endswith(".xml"): continue
        pg.goto(B + "/", timeout=60000); pg.wait_for_timeout(300); pg.click(f"main aside a[href='{href}']"); pg.wait_for_timeout(900)
        ok(f"왼쪽:{text}", pg.url.replace(B, "").startswith(href.split("#")[0]) and pg.evaluate("document.querySelectorAll('main aside').length>=1"), pg.url.replace(B, ""))
    # 3 꼬리말 링크 상태
    pg.goto(B + "/", timeout=60000); pg.wait_for_timeout(300)
    foot = pg.evaluate("[...document.querySelectorAll('footer a[href^=\"/\"]')].map(a=>a.getAttribute('href'))")
    bad = [h for h in set(foot) if requests.get(B + h.split("#")[0]).status_code != 200]
    ok("꼬리말 링크 전부 200", not bad, bad)
    # 4 언어 전환 유지
    pg.click("a[data-lang=en]"); pg.wait_for_timeout(1000); pg.goto(B + "/trend/", timeout=60000); pg.wait_for_timeout(600)
    ok("영어 선택 뒤 다른 메뉴에서도 영어", pg.evaluate("document.querySelector('header nav a')?.textContent.trim()") == "3D Galaxy Map" and pg.evaluate("[...document.querySelectorAll('main aside span[data-en]')].every(e=>e.textContent===e.getAttribute('data-en'))"))
    pg.click("a[data-lang=ko]"); pg.wait_for_timeout(800); ok("한국어 복귀", pg.evaluate("document.querySelector('header nav a')?.textContent.trim()") == "3D 성단 지도")
    # 5 검색 자동완성 → 이동
    pg.goto(B + "/", timeout=60000); pg.wait_for_timeout(500); pg.fill("header input[type=search]", "클로"); pg.wait_for_timeout(700)
    sug = pg.evaluate("[...document.querySelectorAll('header a[href^=\"/ai/\"], header a[href^=\"/map/\"]')].filter(a=>/클로|claude/i.test(a.textContent)).map(a=>a.getAttribute('href'))")
    ok("검색 자동완성 '클로'", "/ai/claude/" in sug, sug[:3])
    if "/ai/claude/" in sug: pg.click("header a[href='/ai/claude/']"); pg.wait_for_timeout(800); ok("자동완성 클릭 이동", "/ai/claude/" in pg.url)
    # 6 메인 카드들
    pg.goto(B + "/", timeout=60000); pg.wait_for_timeout(500)
    for name, sel in (("순위 칩 1위", "#rank a"), ("오늘의 흐름 카드", "#latest a"), ("한국 여행 카드", "#korea a"), ("분야 칩", "#category a"), ("도구 카드", "#tools a[href^='/ai/'], #tools a[href^='/map/']")):
        pg.goto(B + "/", timeout=60000); pg.wait_for_timeout(300); el = pg.query_selector(sel)
        if not el: ok(name, False, "요소 없음"); continue
        href = el.get_attribute("href"); el.click(); pg.wait_for_timeout(1200)
        ok(name, pg.url.replace(B, "").startswith(href.replace("https://aigalaxy-map.com", "").split("#")[0]) or href.startswith("http"), f"{href} → {pg.url.replace(B,'')[:40]}")
    # 7 데이터 화면 안 링크 3개씩
    for path, sel in (("/combos/", "main a[href^='/combos/']"), ("/pricing/", "main a[href^='/pricing/']"), ("/rank/", "main a[href^='/ai/']"), ("/category/", "main a[href^='/category/']")):
        pg.goto(B + path, timeout=60000); pg.wait_for_timeout(500); hrefs = pg.evaluate(f"[...document.querySelectorAll(\"{sel}\")].map(a=>a.getAttribute('href')).slice(0,3)")
        ok(f"{path} 안 링크", hrefs and all(requests.get(B + h).status_code == 200 for h in hrefs), hrefs)
    pg.goto(B + "/search/?q=claude", timeout=60000); pg.wait_for_timeout(1200); ok("검색 페이지 결과", pg.evaluate("document.querySelectorAll('main a[href^=\"/ai/\"], main a[href^=\"/map/\"]').length") >= 5)
    pg.fill("main input", "제미나이"); pg.wait_for_timeout(600); ok("검색 한글 입력", pg.evaluate("document.querySelectorAll('main a[href^=\"/ai/\"], main a[href^=\"/map/\"]').length") >= 1)
    # 8 게시판
    pg.goto(B + "/board/", timeout=60000); pg.wait_for_timeout(2500)
    ok("게시판 틀·목록 요청", pg.evaluate("document.querySelectorAll('header').length===1 && document.querySelectorAll('main aside').length>=1") and pg.evaluate("/글이 없어요|제목/.test(document.body.innerText)"))
    ok("로그인 전 글쓰기 숨김", pg.evaluate("(e=>!e||e.offsetParent===null)(document.getElementById('boardWriteOpen'))"))
    pg.click("#siteAuth button[data-provider=google]")  # 로그인은 머리줄 한 곳(10/14); pg.wait_for_timeout(3500)
    ok("구글 로그인 버튼 → 구글", "accounts.google.com" in pg.url, pg.url[:60])
    # 9 모바일
    mp = ctx.new_page(); mp.set_viewport_size({"width": 390, "height": 860}); mp.goto(B + "/", timeout=60000); mp.wait_for_timeout(800)
    mp.click("header button[aria-label], header [data-aw-toggle-menu]"); mp.wait_for_timeout(600)
    ok("모바일 햄버거 메뉴 열림", mp.evaluate("[...document.querySelectorAll('header nav a')].some(a=>a.offsetParent!==null)"))
    ok("모바일 하단 탭", mp.evaluate("!!document.querySelector('[data-mobile-tab], nav.fixed, .mobile-tabbar, nav[aria-label*=하단], nav[aria-label*=bottom]')") or mp.evaluate("[...document.querySelectorAll('nav a')].some(a=>getComputedStyle(a.closest('nav')).position==='fixed')"))
    ok("모바일 가로 넘침 없음", not mp.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth")); mp.close()
    pg.close(); b.close()
    # 10 지도 iframe
    b = p.chromium.launch(args=GL); pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.goto(B + "/map/?q=claude", timeout=90000, wait_until="domcontentloaded"); pg.wait_for_timeout(7000)
    fr = pg.frames[1] if len(pg.frames) > 1 else None
    if fr:
        st = fr.evaluate("(()=>{const v=e=>!!e&&e.offsetParent!==null;return {canvas:!!document.querySelector('#graph canvas'),fatal:!document.getElementById('fatal')?.hidden,oldTop:v(document.getElementById('topbar')),dupLinks:[document.getElementById('boardOpenBtn'),document.querySelector('.side-trend'),document.querySelector('.side-ailist')].filter(v).length,q:document.getElementById('search')?.value}})()")
        ok("지도 캔버스", st["canvas"] and not st["fatal"], st); ok("지도 앱 안 중복 링크 숨김", st["dupLinks"] == 0, st["dupLinks"]); ok("지도 검색어 전달(?q=)", st["q"] == "claude", st["q"])
    else: ok("지도 iframe", False, "iframe 없음")
    pg.close(); b.close()
    # 11 트렌드 글(워커 포함 서버)
    if W:
        b = p.chromium.launch(args=["--disable-dev-shm-usage"]); pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.goto(W + "/trend/24", timeout=60000); pg.wait_for_timeout(1500)
        ok("트렌드 글 새 틀", pg.evaluate("document.querySelectorAll('header').length===1 && !!document.querySelector('main aside') && !!document.querySelector('.gx') && !/__(BODY|TITLE)__/.test(document.documentElement.outerHTML)"))
        pg.click(".trend-side a[href^='/trend/']"); pg.wait_for_timeout(1200); ok("함께 보면 좋은 글 클릭", "/trend/" in pg.url and pg.evaluate("document.querySelectorAll('header').length===1"), pg.url.replace(W, ""))
        pg.close(); b.close()
json.dump(R, open(OUT / "click.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"통과 {sum(1 for v in R.values() if v['ok'])}/{len(R)}"); [print("실패:", n, i) for n, i in fails]
