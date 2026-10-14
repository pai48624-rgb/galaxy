# -*- coding: utf-8 -*-
"""2단계: extracted/<slug>.json(공식 페이지 본문 raw/<slug>.txt 를 읽고 만든 도구별 정리) → 검사 → tools.jsonl · mismatch.csv · failed.csv.
검사(추측 막기): 모든 값은 evidence 에 근거가 있어야 하고, 근거 quote 는 raw 본문에 실제로 있는 글이어야 함(공백 무시 비교).
근거가 본문에 없는 값은 null/"불명"으로 되돌리고 dropped 에 기록. quote 는 200자 이내로 자름.
  python extract.py build"""
import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
EXT = os.path.join(HERE, "extracted")
FIELDS = ["company", "one_liner_ko", "what_it_does_ko", "key_features", "use_cases_ko", "pricing", "open_source", "api",
          "platforms", "korean_support"]
EMPTY = {"company": None, "one_liner_ko": None, "what_it_does_ko": None, "key_features": [], "use_cases_ko": [],
         "pricing": {"free_tier": "불명", "plans": [], "pricing_url": None}, "open_source": None, "api": "불명",
         "platforms": [], "korean_support": "불명"}


def squash(s):
    return re.sub(r"\s+", "", s or "").lower()


def build():
    fetch = {}
    for l in open(os.path.join(HERE, "fetch.jsonl"), encoding="utf-8"):
        r = json.loads(l)
        fetch[r["slug"]] = r
    inp = {t["slug"]: t for t in json.load(open(os.path.join(HERE, "input_tools.json"), encoding="utf-8"))}
    out, mism, failed, stats = [], [], [], {"ok": 0, "dropped": 0}
    for slug, fr in fetch.items():
        if fr["status"] in ("blocked", "dead"):
            failed.append({"slug": slug, "name_en": fr["name_en"], "status": fr["status"], "url": fr.get("final_url"),
                           "reason": fr.get("reason", "")})
        p = os.path.join(EXT, slug + ".json")
        raw = open(os.path.join(RAW, slug + ".txt"), encoding="utf-8").read() if os.path.exists(os.path.join(RAW, slug + ".txt")) else ""
        rawq = squash(raw)
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
        have = {(ev["field"] or "").split(".")[0] for ev in ev_ok}
        for f in FIELDS:
            v = e.get(f, EMPTY[f])
            if f not in have and v not in (None, "불명", [], {}, EMPTY[f]):
                dropped.append({"field": f, "why": "근거 없음 → 불명"})
                v = EMPTY[f]
            rec[f] = v
        gh = fr.get("github")
        rec["github"] = {"stars": gh.get("stars"), "license": gh.get("license"), "last_commit": gh.get("last_commit")} if gh and gh.get("stars") is not None else None
        if rec["github"] and not rec.get("open_source") and gh.get("license") and gh["license"] != "NOASSERTION":
            rec["open_source"] = gh["license"]
            ev_ok.append({"field": "open_source", "url": gh.get("url"), "quote": "GitHub API license.spdx_id=%s" % gh["license"]})
        if isinstance(rec.get("pricing"), dict):
            rec["pricing"]["확인일"] = fr["checked_at"][:10]
        rec["evidence"] = ev_ok
        rec["dropped"] = dropped
        stats["dropped"] += len(dropped)
        if e:
            stats["ok"] += 1
        for m in e.get("mismatch") or []:
            mism.append({"slug": slug, "name_en": fr["name_en"], "기존_pricing_policy": (inp.get(slug) or {}).get("pricing_policy"),
                         "공식_페이지": m.get("official"), "차이": m.get("diff"), "근거_url": m.get("url")})
        out.append(rec)
    with open(os.path.join(HERE, "tools.jsonl"), "w", encoding="utf-8") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    for name, rows, cols in [("mismatch.csv", mism, ["slug", "name_en", "기존_pricing_policy", "공식_페이지", "차이", "근거_url"]),
                             ("failed.csv", failed, ["slug", "name_en", "status", "url", "reason"])]:
        with open(os.path.join(HERE, name), "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(rows)
    print("정리 %d · 정리 파일 있음 %d · 근거 없어 되돌린 값 %d · mismatch %d · failed %d" % (len(out), stats["ok"], stats["dropped"], len(mism), len(failed)))


if __name__ == "__main__":
    build()
