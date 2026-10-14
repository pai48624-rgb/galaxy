# -*- coding: utf-8 -*-
"""[galaxy] AI 도구 공식 자료 수집 (2026-10-14 지시서) — 1단계: 공식 페이지 받기(자료만, 글 안 씀).

도구마다 공식 페이지만: 홈 + 요금 + 소개/문서 1곳 + (있으면) GitHub — 최대 4페이지.
예의: robots.txt 지킴, 같은 도메인 3초 간격, 동시 4개 이하, 로그인·유료벽·캡차 안 넘음(막히면 blocked 기록).
글자가 거의 없는 자바스크립트 화면은 진짜 크롬(보이지 않게)으로 읽기만. 정직한 이름(UA)으로 접속.
결과: raw/<slug>.txt (페이지 본문, 도구당 30KB 이내) · fetch.jsonl (상태·최종 주소·받은 페이지·GitHub 수치)
2단계(도구별 정리 tools.jsonl)는 extract.py — 근거 인용이 raw 본문에 실제로 있는지 검사.
  python collect.py fetch [slug ...]   (없으면 747개 전부, 이미 받은 slug 건너뜀)
  python collect.py status"""
import concurrent.futures as cf
import html
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
FETCH = os.path.join(HERE, "fetch.jsonl")
INPUT = os.path.join(HERE, "input_tools.json")
UA = "AIGalaxyMap-research/1.0 (+https://aigalaxy-map.com; official-page reader)"
GAP = 3.0
MAX_RAW = 30000
WORKERS = 4
KIND = [("pricing", r"pricing|/plans?\b|/price|요금|가격|subscribe|/premium|/upgrade"),
        ("about", r"/about|/features?|/product|/docs?\b|documentation|/overview|/platform|/how-it-works|소개|기능")]
BLOCK_HINT = r"captcha|cf-chl|cloudflare ray id|access denied|attention required|are you a robot|verify you are human|enable javascript and cookies"

PRICE_RE = re.compile(r"(US\$|\$|₩|€|£|¥)\s?\d|\d[\d,.]*\s?(원|USD|KRW|EUR|달러)")
PRICE_JS = r"(US\$|\$|₩|€|£|¥)\s?\d|\d[\d,.]*\s?(원|USD|KRW|EUR)"
PRICE_WAIT_JS = "t => new RegExp(t).test(document.body.innerText.replace(/US\\$\\s*-/g, ''))"
# 2단계 보완 1: 큰 회사 아래 모델은 그 회사 공식 요금 문서(어디서 찾았는지 pages[].src 와 pricing_url 에 남김)
PRICING_OVERRIDE = {"gemma": "https://ai.google.dev/gemini-api/docs/pricing",
                    "google-veo": "https://ai.google.dev/gemini-api/docs/pricing"}
COMPANY_PRICING = [(r"(^|\.)deepmind\.google$", "https://ai.google.dev/gemini-api/docs/pricing")]
GUESS_PATHS = ["/pricing", "/ko/pricing", "/plans", "/pricing/ko"]
LANG_WORDS = ["한국어", "Korean", "English", "日本語", "中文", "简体中文", "繁體中文", "Español", "Français", "Deutsch", "Português",
              "Italiano", "Русский", "Tiếng Việt", "ภาษาไทย", "Bahasa Indonesia", "हिन्दी", "Türkçe", "Polski", "Nederlands", "العربية"]

_dom_lock = threading.Lock()
_dom_last = {}
_robots = {}
_write = threading.Lock()


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def host(u):
    return (urllib.parse.urlsplit(u).hostname or "").lower()


def root_dom(h):
    p = h.split(".")
    return ".".join(p[-3:]) if len(p) > 2 and p[-2] in ("co", "or", "ac", "com", "go") else ".".join(p[-2:])


def wait_domain(u):
    d = root_dom(host(u))
    while True:
        with _dom_lock:
            t = time.time() - _dom_last.get(d, 0)
            if t >= GAP:
                _dom_last[d] = time.time()
                return
        time.sleep(GAP - t + 0.05)


def allowed(u):
    h = urllib.parse.urlsplit(u)
    base = "%s://%s" % (h.scheme or "https", h.netloc)
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            wait_domain(base)
            req = urllib.request.Request(base + "/robots.txt", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15, context=CTX) as r:
                rp.parse(r.read(200000).decode("utf-8", "replace").splitlines())
        except urllib.error.HTTPError as e:
            rp.parse([] if e.code in (404, 410) else ["User-agent: *", "Disallow: /"] if e.code in (401, 403) else [])
        except Exception:
            rp.parse([])
        _robots[base] = rp
    return _robots[base].can_fetch(UA, u)


def text_of(h):
    h = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr|section)>", "\n", h)
    t = html.unescape(re.sub(r"<[^>]+>", " ", h))
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()


try:
    import certifi, ssl
    CTX = ssl.create_default_context(cafile=certifi.where())   # 윈도 기본 인증서 묶음에 없는 중간 인증서 때문에 생기는 검증 실패 방지
except Exception:
    CTX = None


def get(u):
    wait_domain(u)
    req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "text/html,*/*;q=0.5", "Accept-Language": "ko,en;q=0.8",
                                           "Accept-Encoding": "gzip, identity"})
    try:
        with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
            raw = r.read(3_000_000)
            ce = (r.headers.get("Content-Encoding") or "").lower()
            if "gzip" in ce or raw[:2] == bytes([0x1f, 0x8b]):   # 압축된 응답 풀기(10/14 gemma·google-veo 본문 깨짐 고침)
                import gzip
                raw = gzip.decompress(raw)
            elif "br" in ce:
                try:
                    import brotli
                    raw = brotli.decompress(raw)
                except Exception:
                    pass
            cs = re.search(r"charset=([\w-]+)", r.headers.get("Content-Type", "")) or re.search(rb'charset=["\']?([\w-]+)', raw[:3000])
            enc = cs.group(1) if cs else "utf-8"
            enc = enc.decode() if isinstance(enc, bytes) else enc
            try:
                body = raw.decode(enc, "replace")
            except LookupError:
                body = raw.decode("utf-8", "replace")
            return r.status, r.geturl(), body
    except urllib.error.HTTPError as e:
        return e.code, u, ""
    except Exception as e:
        return 0, u, "ERR " + str(e)[:150]


class Browser:
    """자바스크립트 화면용 — 크롬을 보이지 않게 띄워 읽기만(작업마다 하나)."""

    def __init__(self):
        self.p = self.b = None

    def get(self, u, wait_price=False):
        if self.b is None:
            from playwright.sync_api import sync_playwright
            self.p = sync_playwright().start()
            self.b = self.p.chromium.launch(channel="chrome", headless=True)
        wait_domain(u)
        pg = self.b.new_page(user_agent=UA, locale="ko-KR")
        try:
            r = pg.goto(u, timeout=30000, wait_until="domcontentloaded")
            try:
                pg.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            if wait_price:   # 2단계 보완 2: 앱형 요금 화면 — 가격 숫자가 나타날 때까지 최대 10초
                try:
                    pg.wait_for_function(PRICE_WAIT_JS, arg=PRICE_JS, timeout=10000)
                except Exception:
                    pass
            return (r.status if r else 0), pg.url, pg.content()
        except Exception as e:
            return 0, u, "ERR " + str(e)[:150]
        finally:
            pg.close()

    def close(self):
        try:
            if self.b:
                self.b.close()
            if self.p:
                self.p.stop()
        except Exception:
            pass


def has_price(t):
    return bool(PRICE_RE.search(re.sub(r"US\$\s*-", "", t or "")))


def lang_meta(body):
    """페이지 언어 정보(인용할 수 있게 raw 에도 적음): html lang · hreflang 목록 · 화면에 보이는 언어 이름 · 한국어판 주소."""
    body = body or ""
    m = re.search(r'(?is)<html[^>]*\blang=["\']?([\w-]+)', body)
    hl = sorted(set(x.lower() for x in re.findall(r'(?is)hreflang=["\']([\w-]+)["\']', body)))
    txt = text_of(body)
    words = [w for w in LANG_WORDS if w in txt]
    ko = None
    for tag in re.findall(r"(?is)<link[^>]+>", body):
        if re.search(r'hreflang=["\']ko', tag, re.I):
            h = re.search(r'href=["\']([^"\']+)', tag)
            ko = h.group(1) if h else None
            break
    return {"html_lang": m.group(1) if m else None, "hreflang": hl, "lang_words": words, "ko_href": ko}


def links(body, base):
    out = []
    for href, label in re.findall(r'(?is)<a[^>]+href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', body):
        u = urllib.parse.urljoin(base, href.strip())
        if not u.startswith("http") or root_dom(host(u)) != root_dom(host(base)):
            continue
        out.append((u.split("#")[0], text_of(label)[:60]))
    return out


def github_info(gh_url):
    m = re.search(r"github\.com/([^/\s]+)/([^/\s#?]+)", gh_url or "")
    if not m:
        return None
    o, r = m.group(1), re.sub(r"\.git$", "", m.group(2))
    try:
        j = json.loads(subprocess.run(["gh", "api", "repos/%s/%s" % (o, r)], capture_output=True, text=True, encoding="utf-8",
                                      timeout=60).stdout or "{}")
        if not j.get("full_name"):
            return {"repo": "%s/%s" % (o, r), "status": "못 찾음"}
        c = json.loads(subprocess.run(["gh", "api", "repos/%s/%s/commits?per_page=1" % (o, r)], capture_output=True, text=True,
                                      encoding="utf-8", timeout=60).stdout or "[]")
        last = c[0]["commit"]["committer"]["date"] if isinstance(c, list) and c else j.get("pushed_at")
        readme = subprocess.run(["gh", "api", "repos/%s/%s/readme" % (o, r), "-H", "Accept: application/vnd.github.raw"],
                                capture_output=True, text=True, encoding="utf-8", timeout=60).stdout or ""
        return {"repo": j["full_name"], "url": j.get("html_url"), "stars": j.get("stargazers_count"),
                "license": (j.get("license") or {}).get("spdx_id"), "last_commit": last, "archived": j.get("archived"),
                "description": j.get("description"), "readme": readme[:12000]}
    except Exception as e:
        return {"repo": "%s/%s" % (o, r), "status": "오류 " + str(e)[:80]}


def fetch_page(rec, parts, br, kind, u, src, need_price=False):
    """한 페이지 받기(robots 지킴). 요금 쪽은 가격이 비면 크롬으로 열고 숫자가 뜰 때까지 최대 10초(보완 2). 받으면 True."""
    if not allowed(u):
        rec["pages"].append({"kind": kind, "url": u, "http": None, "skip": "robots", "src": src})
        return False
    s3, f3, b3 = get(u)
    rec["requests"] += 1
    is_price = kind.startswith("pricing")
    t3 = text_of(b3)
    weak = s3 in (0, 403) or (s3 == 200 and (len(t3) < 800 or (is_price and not has_price(t3))))
    used = False
    if weak:
        s4, f4, b4 = br.get(u, wait_price=is_price)
        rec["requests"] += 1
        t4 = text_of(b4)
        if s4 and (len(t4) > len(t3) or (is_price and has_price(t4) and not has_price(t3))):
            s3, f3, b3, t3, used = s4, f4, b4, t4, True
    lm = lang_meta(b3)
    rec["pages"].append({"kind": kind, "url": f3, "http": s3, "chars": len(t3), "browser": used, "src": src,
                         "lang": lm["html_lang"], "ko_href": lm["ko_href"], "has_price": has_price(t3) if is_price else None})
    if s3 == 200 and t3:
        parts.append((kind, f3, t3, lm["html_lang"]))
    return s3 == 200 and bool(t3) and (not need_price or has_price(t3))


def one(tool, br):
    slug, url = tool["slug"], tool["url"]
    rec = {"slug": slug, "name_en": tool["name_en"], "checked_at": now(), "input_url": url, "pages": [], "requests": 0}
    parts = []
    gh = tool.get("github") or (url if "github.com" in (url or "") else None)
    if url and "github.com" not in url:
        if not allowed(url):
            rec.update(status="blocked", final_url=url, reason="robots.txt 금지")
            return rec, parts
        st, final, body = get(url)
        rec["requests"] += 2
        used_browser = False
        if (st == 0 or st == 403 or (st == 200 and len(text_of(body)) < 800)) and not body.startswith("ERR getaddrinfo"):
            st2, final2, body2 = br.get(url)
            rec["requests"] += 1
            if st2 and len(text_of(body2)) > len(text_of(body)):
                st, final, body, used_browser = st2, final2, body2, True
        t = text_of(body)
        if st == 0 or (st >= 400 and st not in (403,)):
            rec.update(status="dead", final_url=final, reason="HTTP %s %s" % (st, body[:100] if body.startswith("ERR") else ""))
        elif st == 403 or re.search(BLOCK_HINT, t[:3000], re.I) and len(t) < 3000:
            rec.update(status="blocked", final_url=final, reason="접근 거부·캡차·봇 확인 화면(넘지 않음)")
        else:
            rec.update(status="redirect" if host(final) != host(url) else "ok", final_url=final)
            rec["pages"].append({"kind": "home", "url": final, "http": st, "chars": len(t), "browser": used_browser})
            parts.append(("home", final, t, lang_meta(body)["html_lang"]))
            rec["home_lang"] = lang_meta(body)
            cand = links(body, final)
            extra_pricing = None
            for kind, pat in KIND:
                by_url = sorted({u.rstrip("/") + "/" for u, lab in cand if re.search(pat, u, re.I)}, key=lambda u: (len(urllib.parse.urlsplit(u).path), u))
                pick = (by_url[0] if by_url else None) or next((u for u, lab in cand if re.search(pat, lab, re.I)), None)
                src = "홈 링크"
                if kind == "pricing" and len(by_url) > 1 and slug not in PRICING_OVERRIDE:
                    extra_pricing = by_url[1]   # 두 번째 요금 페이지(요금 찾기 시도 3회 안에서)
                if kind == "pricing" and slug in PRICING_OVERRIDE:
                    pick, src = PRICING_OVERRIDE[slug], "회사 공식 요금 문서"
                if not pick or pick.rstrip("/") == final.rstrip("/") or any(p["url"] == pick for p in rec["pages"]):
                    continue
                fetch_page(rec, parts, br, kind, pick, src)
            if extra_pricing and not any(p["url"].rstrip("/") == extra_pricing.rstrip("/") for p in rec["pages"]):
                fetch_page(rec, parts, br, "pricing2", extra_pricing, "홈 링크(두 번째 요금 페이지)")
            if not any(p["kind"] == "pricing" and p.get("has_price") for p in rec["pages"]):
                # 보완 1: 요금 링크가 없거나 가격이 없으면 회사 공식 요금 문서 → 같은 도메인 추측 주소(따로 3회까지)
                tries = [(u, "회사 공식 요금 문서") for pat, u in COMPANY_PRICING if re.search(pat, host(final))]
                sp = urllib.parse.urlsplit(final)
                tries += [("%s://%s%s" % (sp.scheme, sp.netloc, g), "추측 주소 " + g) for g in GUESS_PATHS]
                n_try = 0
                for u, src in tries:
                    if n_try >= 3:
                        break
                    if any(p["url"].rstrip("/") == u.rstrip("/") for p in rec["pages"]):
                        continue
                    n_try += 1
                    if fetch_page(rec, parts, br, "pricing", u, src, need_price=True):
                        break
            pr = next((p for p in rec["pages"] if p["kind"] == "pricing" and p.get("has_price")), None) or \
                 next((p for p in rec["pages"] if p["kind"] == "pricing" and p.get("chars")), None)
            if pr and (pr.get("lang") or "")[:2] != "ko" and pr.get("ko_href"):
                # 보완 4: 한국어 요금 페이지(원화)가 따로 있으면 같이 받기(둘 다 남김)
                fetch_page(rec, parts, br, "pricing_ko", urllib.parse.urljoin(pr["url"], pr["ko_href"]), "요금 페이지의 한국어판(hreflang)")
            hm = rec["home_lang"]
            parts.append(("meta", final, "html lang: %s\nhreflang: %s\n화면에 보이는 언어 이름: %s" % (
                hm["html_lang"] or "없음", ", ".join(hm["hreflang"]) or "없음", ", ".join(hm["lang_words"]) or "없음"), None))
    if gh:
        g = github_info(gh)
        rec["requests"] += 3
        rec["github"] = {k: v for k, v in (g or {}).items() if k != "readme"}
        if g and g.get("readme"):
            parts.append(("github", g.get("url") or gh, g["readme"], None))
            rec["pages"].append({"kind": "github", "url": g.get("url") or gh, "http": 200, "chars": len(g["readme"])})
        if "status" not in rec:
            rec.update(status="ok" if g and g.get("stars") is not None else "dead", final_url=g.get("url") if g else gh)
    return rec, parts


def focus(t, name, n):
    """긴 요금 문서(회사 공통 요금 문서 등)에서 도구 이름이 나오는 곳 둘레를 남김 — 앞부분만 자르면 해당 도구 요금이 잘림(10/14 Gemma·Veo)."""
    key = re.sub(r"^(google|meta|microsoft|openai|amazon|aws)\s+", "", name.strip(), flags=re.I)
    hits = [m.start() for m in re.finditer(re.escape(key), t, re.I)] if len(key) >= 3 else []
    if not hits:
        return t
    keep, spans = [t[:800]], []
    for h in hits:
        a, b = max(0, h - 600), min(len(t), h + 1800)
        if spans and a <= spans[-1][1]:
            spans[-1] = (spans[-1][0], b)
        else:
            spans.append((a, b))
    for a, b in spans:
        keep.append("…\n" + t[a:b])
        if sum(map(len, keep)) > n:
            break
    return "\n".join(keep)


def save(rec, parts):
    share = {"home": 0.25, "pricing": 0.22, "pricing2": 0.12, "pricing_ko": 0.12, "about": 0.12, "github": 0.14, "meta": 0.03}
    out = []
    for p in parts:
        kind, u, t = p[0], p[1], p[2]
        lang = p[3] if len(p) > 3 else None
        n = int(MAX_RAW * share.get(kind, 0.12))
        if kind.startswith("pricing") and len(t) > n:
            t = focus(t, rec.get("name_en") or "", n)
        out.append("=== [%s] %s%s\n%s\n" % (kind, u, " (lang=%s)" % lang if lang else "", t[:n]))
    body = "\n".join(out)[:MAX_RAW]
    with open(os.path.join(RAW, rec["slug"] + ".txt"), "w", encoding="utf-8") as f:
        f.write(body)
    with _write:
        with open(FETCH, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def done_slugs():
    if not os.path.exists(FETCH):
        return set()
    return {json.loads(l)["slug"] for l in open(FETCH, encoding="utf-8") if l.strip()}


def fetch(only=None):
    os.makedirs(RAW, exist_ok=True)
    tools = json.load(open(INPUT, encoding="utf-8"))
    if only:
        want = {s.lower() for s in only}
        tools = [t for t in tools if t["slug"].lower() in want]
    skip = done_slugs()
    todo = [t for t in tools if t["slug"] not in skip]
    print("대상 %d · 이미 받음 %d · 이번 %d  (%s)" % (len(tools), len(tools) - len(todo), len(todo), now()), flush=True)
    local = threading.local()
    browsers = []

    def work(t):
        if not hasattr(local, "br"):
            local.br = Browser()
            browsers.append(local.br)
        try:
            rec, parts = one(t, local.br)
        except Exception as e:
            rec, parts = {"slug": t["slug"], "name_en": t["name_en"], "checked_at": now(), "status": "dead",
                          "final_url": t["url"], "reason": "수집 오류 " + str(e)[:120], "pages": [], "requests": 0}, []
        save(rec, parts)
        return rec

    n = 0
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        for rec in ex.map(work, todo):
            n += 1
            print("[%d/%d] %s %s %s 페이지%d" % (n, len(todo), rec["slug"], rec["status"], rec.get("final_url", ""),
                                               len([p for p in rec["pages"] if p.get("chars")])), flush=True)
    for b in browsers:
        b.close()
    status()


def status():
    recs = [json.loads(l) for l in open(FETCH, encoding="utf-8")] if os.path.exists(FETCH) else []
    from collections import Counter
    print("받은 도구 %d · 상태 %s · 요청 %d" % (len(recs), dict(Counter(r["status"] for r in recs)), sum(r.get("requests", 0) for r in recs)))


if __name__ == "__main__":
    if sys.argv[1] == "fetch":
        fetch(sys.argv[2:] or None)
    elif sys.argv[1] == "refetch":   # 2단계: 지정 slug 를 fetch.jsonl 에서 빼고 다시 받기
        want = set(sys.argv[2:])
        keep = [l for l in open(FETCH, encoding="utf-8") if json.loads(l)["slug"] not in want]
        open(FETCH, "w", encoding="utf-8").writelines(keep)
        fetch(list(want))
    else:
        status()
