# 정렬 점검(2026-10-14): 모든 화면에서 왼쪽 메뉴와 본문 시작 간격이 같은지 — python -X utf8 scripts/qa_align.py 1440
import sys
from playwright.sync_api import sync_playwright
B="http://127.0.0.1:8792"
pages=["/","/trend/","/ai/","/ai/claude/","/category/","/category/foundation-models/","/combos/","/combos/image/","/pricing/","/pricing/free/","/rank/","/search/","/korea/","/korea/seoraksan/","/board/","/privacy","/no-such-x","/en/","/en/ai/","/en/combos/","/en/korea/","/trend/27","/trend/24","/en/trend/","/en/trend/27/","/en/board/"]
JS="""(()=>{const a=document.querySelector('main aside');if(!a)return null;const col=a.parentElement.children[1];
const h=[...col.querySelectorAll('h1,h2,p,section,article,ul,div')].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(e.textContent||'').trim().length>0});
const ar=a.getBoundingClientRect(),cr=col.getBoundingClientRect(),hr=h?h.getBoundingClientRect():null;
return {asideL:Math.round(ar.left),asideR:Math.round(ar.right),colL:Math.round(cr.left),textL:hr?Math.round(hr.left):null,gap:hr?Math.round(hr.left-ar.right):null,colW:Math.round(cr.width)}})()"""
with sync_playwright() as p:
    b=p.chromium.launch(args=["--disable-dev-shm-usage"]); pg=b.new_page(viewport={"width":int(sys.argv[1]) if len(sys.argv)>1 else 1440,"height":900})
    for u in pages:
        pg.goto(B+u,timeout=60000); pg.wait_for_timeout(500); print(f"{u:32}", pg.evaluate(JS))
    b.close()
