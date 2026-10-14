# -*- coding: utf-8 -*-
"""2단계: extracted/<slug>.json(공식 페이지 본문 raw/<slug>.txt 를 읽고 만든 도구별 정리) → 검사 → tools.jsonl · mismatch.csv · changed.csv · failed.csv.
검사(추측 막기): 모든 값은 evidence 에 근거가 있어야 하고, 근거 quote 는 raw 본문에 실제로 있는 글이어야 함(공백 무시 비교).
근거가 본문에 없는 값은 null/"불명"으로 되돌리고 dropped 에 기록. quote 는 200자 이내로 자름.
2단계(10/14 데스크톱 검토) 추가: korean_support 4구분, plans[].currency·page_lang, plan_change → changed.csv,
pricing_src(요금 주소를 어디서 찾았나: 홈 링크·회사 공식 요금 문서·추측 주소), 요금 불명 이유(pricing_unknown_reason).
  python extract.py build"""
import csv
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
EXT = os.path.join(HERE, "extracted")
FIELDS = ["company", "one_liner_ko", "what_it_does_ko", "key_features", "use_cases_ko", "pricing", "open_source", "api",
          "platforms", "korean_support"]
KO4 = ("UI 한국어", "한국어 입력·출력", "없음(영어 등만)", "불명")
EMPTY = {"company": None, "one_liner_ko": None, "what_it_does_ko": None, "key_features": [], "use_cases_ko": [],
         "pricing": {"free_tier": "불명", "plans": [], "pricing_url": None}, "open_source": None, "api": "불명",
         "platforms": [], "korean_support": "불명"}


def squash(s):
    return re.sub(r"\s+", "", s or "").lower()


def is_empty(f, v):
    if f == "pricing":
        v = v or {}
        return (v.get("free_tier") in (None, "불명")) and not v.get("plans")
    return v in (None, "불명", [], {})


def unknown_reason(fr):
    pp = [p for p in fr.get("pages", []) if p["kind"].startswith("pricing")]
    if fr.get("status") in ("blocked", "dead"):
        return "홈 접속 안 됨(%s)" % fr.get("status")
    if not pp:
        return "홈에 요금 링크 없음"
    bits = []
    for p in pp:
        if p.get("skip"):
            bits.append("%s robots 금지" % p["url"])
        elif p.get("http") not in (200,):
            bits.append("%s HTTP %s" % (p["url"], p.get("http")))
        elif not p.get("has_price"):
            bits.append("%s 가격 숫자 없음" % p["url"])
    return "; ".join(bits) or "요금 페이지는 받았으나 정리에서 근거 못 찾음"


def build():
    fetch = {}
    for l in open(os.path.join(HERE, "fetch.jsonl"), encoding="utf-8"):
        r = json.loads(l)
        fetch[r["slug"]] = r
    inp = {t["slug"]: t for t in json.load(open(os.path.join(HERE, "input_tools.json"), encoding="utf-8"))}
    out, mism, chg, failed = [], [], [], []
    st = {"정리 있음": 0, "되돌림": 0}
    for slug, fr in fetch.items():
        if fr["status"] in ("blocked", "dead"):
            failed.append({"slug": slug, "name_en": fr["name_en"], "status": fr["status"], "url": fr.get("final_url"),
                           "reason": fr.get("reason", "")})
        p = os.path.join(EXT, slug + ".json")
        rp = os.path.join(RAW, slug + ".txt")
        rawq = squash(open(rp, encoding="utf-8").read()) if os.path.exists(rp) else ""
        rec = {"slug": slug, "name_en": fr["name_en"], "checked_at": fr["checked_at"],
               "status": "%s %s" % (fr["status"], fr.get("final_url") or "")}
        e = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
        ev_ok, dropped = [], []
        for ev in e.get("evidence") or []:
            q = (ev.get("quote") or "")[:200]
            if q and squash(q) and squash(q) in rawq:
                ev_ok.append({"field": ev.get("field"), "url": ev.get("url"), "quote": q})
            else:
                dropped.append({"field": ev.get("field"), "quote": q[:80], "why": "근거 글이 받은 본문에 없음"})
        have = {(ev["field"] or "").split(".")[0].split("[")[0] for ev in ev_ok}
        for f in FIELDS:
            v = e.get(f, EMPTY[f])
            if f == "korean_support" and v not in KO4:
                dropped.append({"field": f, "why": "4구분 밖 값 '%s' → 불명" % v})
                v = "불명"
            if f not in have and not is_empty(f, v):
                dropped.append({"field": f, "why": "근거 없음 → 불명"})
                v = EMPTY[f]
            rec[f] = v
        pr_pages = [x for x in fr.get("pages", []) if x["kind"].startswith("pricing") and x.get("has_price")]
        if isinstance(rec.get("pricing"), dict):
            rec["pricing"]["확인일"] = fr["checked_at"][:10]
            rec["pricing"]["pricing_src"] = "; ".join("%s ← %s" % (x["url"], x.get("src") or "") for x in pr_pages) or None
            if is_empty("pricing", rec["pricing"]):
                rec["pricing"]["pricing_unknown_reason"] = unknown_reason(fr)
        gh = fr.get("github")
        rec["github"] = {"stars": gh.get("stars"), "license": gh.get("license"), "last_commit": gh.get("last_commit")} if gh and gh.get("stars") is not None else None
        if rec["github"] and not rec.get("open_source") and gh.get("license") and gh["license"] != "NOASSERTION":
            rec["open_source"] = gh["license"]
            ev_ok.append({"field": "open_source", "url": gh.get("url"), "quote": "GitHub API license.spdx_id=%s" % gh["license"]})
        rec["evidence"] = ev_ok
        rec["dropped"] = dropped
        st["되돌림"] += len(dropped)
        st["정리 있음"] += bool(e)
        pol = (inp.get(slug) or {}).get("pricing_policy")
        for m in e.get("mismatch") or []:
            mism.append({"slug": slug, "name_en": fr["name_en"], "기존_pricing_policy": pol,
                         "공식_페이지": m.get("official"), "차이": m.get("diff"), "근거_url": m.get("url")})
        for m in e.get("plan_change") or []:
            chg.append({"slug": slug, "name_en": fr["name_en"], "기존_pricing_policy": pol,
                        "달라진_점": m.get("diff"), "공식_요금제": m.get("official"), "근거_url": m.get("url")})
        out.append(rec)
    with open(os.path.join(HERE, "tools.jsonl"), "w", encoding="utf-8") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    for name, rows, cols in [("mismatch.csv", mism, ["slug", "name_en", "기존_pricing_policy", "공식_페이지", "차이", "근거_url"]),
                             ("changed.csv", chg, ["slug", "name_en", "기존_pricing_policy", "달라진_점", "공식_요금제", "근거_url"]),
                             ("failed.csv", failed, ["slug", "name_en", "status", "url", "reason"])]:
        with open(os.path.join(HERE, name), "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(rows)
    ko = {k: sum(1 for r in out if r.get("korean_support") == k) for k in KO4}
    priced = sum(1 for r in out if not is_empty("pricing", r.get("pricing")))
    print("도구 %d · 정리 있음 %d · 요금 확인 %d · 한국어 %s · mismatch %d · changed %d · failed %d · 되돌린 값 %d"
          % (len(out), st["정리 있음"], priced, ko, len(mism), len(chg), len(failed), st["되돌림"]))


if __name__ == "__main__":
    build()
