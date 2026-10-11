"""한국 여행 글 다음 후보(2026-10-11) — galaxy_pick 여행 데이터 랩(data/lab/places.json)에서 자료가 충분한 곳만 골라
하루 2곳씩 공개일을 매긴 목록을 content/korea/_queue.json 에 씀. 글(ko.html·en.html·meta.json)은 이 목록 순서로 따로 씀.

자료가 충분한 곳 = 사진 + 주차장 3곳 이상 + 응급실 + 숙소(3km) 가 모두 있고, 바다는 수질 검사 기록, 산은 국립공원(코스 자료) 있는 곳.
점수: 이용객 자료(+3)·무료 주차 2km(+1)·숙소 수·종류 다양 — 종류를 돌아가며, 같은 시도가 연달아 나오지 않게 섞음.
python -X utf8 scripts/korea_queue.py [시작일 YYYY-MM-DD]  (기본: 이미 쓴 글의 마지막 공개일 다음 날)
"""
import json, sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEV = ROOT.parents[1]
paths = json.loads((DEV / "paths.json").read_text(encoding="utf-8"))
LAB = DEV / paths.get("galaxy_pick", "10_projects/galaxy_pick") / "data" / "lab" / "places.json"
CONTENT = ROOT / "content" / "korea"
PER_DAY = 2


def main():
    d = json.loads(LAB.read_text(encoding="utf-8"))
    done = {}
    for m in CONTENT.glob("*/meta.json"):
        j = json.loads(m.read_text(encoding="utf-8"))
        done[j["slug"]] = j["publish"]
    last = max(done.values()) if done else date.today().isoformat()
    start = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.fromisoformat(last) + timedelta(days=1)
    used = set()  # 이미 쓴 곳 빼기(글 meta.json의 place — 글 공장이 쓴 글·직접 쓴 글 모두 들어 있음)
    for m in CONTENT.glob("*/meta.json"):
        pl = json.loads(m.read_text(encoding="utf-8")).get("place")
        if pl:
            used.add(pl["slug"])
    cands = []
    for x in d["places"]:
        if x["slug"] in used or not x.get("photo") or len(x["parking"]) < 3 or not x["emergency"] or not x["lodging"]["n"]:
            continue
        if x["kind"] == "beach" and not (x.get("quality") or {}).get("n"):
            continue
        score = 3 * bool(x.get("visitors")) + x["free_parking_2km"] + min(x["lodging"]["n"], 60) / 20 + len(x["lodging"]["groups"]) / 2
        score += {"mountain": 2, "island": 1.5}.get(x["kind"], 0)  # 산(코스 자료)·섬(배편)은 글거리가 많아 가산
        cands.append((round(score, 2), x))
    cands.sort(key=lambda t: -t[0])
    # 섞기: 종류를 돌아가며(바다→산→계곡…) 고르고, 같은 종류 안에선 바로 앞과 다른 시도를 먼저
    by = {}
    for s, x in cands:
        by.setdefault(x["kind"], []).append((s, x))
    order = [k for k in ("beach", "mountain", "valley", "island") if k in by]
    out, last_sido, turn = [], None, 0
    while any(by.values()):
        k = order[turn % len(order)]
        turn += 1
        if not by.get(k):
            continue
        lst = by[k]
        i = next((n for n, (_, x) in enumerate(lst) if x.get("sido") != last_sido), 0)
        s, x = lst.pop(i)
        out.append((s, x))
        last_sido = x.get("sido")
    queue = [{"publish": (start + timedelta(days=i // PER_DAY)).isoformat(), "kind": x["kind"], "place_slug": x["slug"], "name": x["name"],
              "region": f"{x.get('sido', '')} {x.get('sgg', '')}".strip(), "score": s, "has_visitors": bool(x.get("visitors"))} for i, (s, x) in enumerate(out)]
    (CONTENT / "_queue.json").write_text(json.dumps({"made": date.today().isoformat(), "per_day": PER_DAY, "rule": __doc__.split("\n")[3], "queue": queue},
                                                    ensure_ascii=False, indent=1), encoding="utf-8")
    from collections import Counter
    print(f"후보 {len(queue)}곳 · {Counter(q['kind'] for q in queue)} · {queue[0]['publish']} ~ {queue[-1]['publish']}")
    for q in queue[:10]:
        print(q["publish"], q["kind"], q["name"], q["region"], q["score"])


if __name__ == "__main__":
    main()
