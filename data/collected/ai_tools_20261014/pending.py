# -*- coding: utf-8 -*-
"""받았지만 아직 정리(extracted/<slug>.json) 안 된 도구를 10개씩 묶어 출력. 본문이 비면(막힘·종료) 정리 대상에서 빼고 따로 셈."""
import json, os, sys
H = os.path.dirname(os.path.abspath(__file__))
claimed = set(open(os.path.join(H, "claimed.txt"), encoding="utf-8").read().split()) if os.path.exists(os.path.join(H, "claimed.txt")) else set()
todo, empty = [], []
for l in open(os.path.join(H, "fetch.jsonl"), encoding="utf-8"):
    s = json.loads(l)["slug"]
    if os.path.exists(os.path.join(H, "extracted", s + ".json")) or s in claimed:
        continue
    rp = os.path.join(H, "raw", s + ".txt")
    (todo if os.path.exists(rp) and os.path.getsize(rp) > 200 else empty).append(s)
n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
print("정리 대기 %d · 본문 없음 %d" % (len(todo), len(empty)))
for i in range(0, len(todo) - len(todo) % n if "--full" in sys.argv else len(todo), n):
    print(" ".join(todo[i:i + n]))
