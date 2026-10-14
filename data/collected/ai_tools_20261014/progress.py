# -*- coding: utf-8 -*-
"""README 맨 위 진행 표 갱신(100개마다) — 받기·정리 건수, 시각, 온도는 인자로."""
import json, os, re, sys
from datetime import datetime
H = os.path.dirname(os.path.abspath(__file__))
recs = [json.loads(l) for l in open(os.path.join(H, "fetch.jsonl"), encoding="utf-8")]
from collections import Counter
c = Counter(r["status"] for r in recs)
ext = len([f for f in os.listdir(os.path.join(H, "extracted")) if f.endswith(".json")])
req = sum(r.get("requests", 0) for r in recs)
temp = sys.argv[1] if len(sys.argv) > 1 else "미측정"
tbl = ("<!-- PROGRESS -->\n## 2단계 진행 (%s 갱신)\n\n| 받기 | ok | redirect | blocked | dead | 정리(extracted) | 요청 수 | 온도 |\n|---|---|---|---|---|---|---|---|\n"
       "| %d/747 | %d | %d | %d | %d | %d | %d | %s |\n<!-- /PROGRESS -->\n") % (
    datetime.now().strftime("%m-%d %H:%M"), len(recs), c["ok"], c["redirect"], c["blocked"], c["dead"], ext, req, temp)
p = os.path.join(H, "README.md")
s = open(p, encoding="utf-8").read()
s = re.sub(r"<!-- PROGRESS -->.*?<!-- /PROGRESS -->\n", "", s, flags=re.S)
s = s.replace("\n", "\n\n" + tbl, 1) if s.startswith("#") else tbl + s
open(p, "w", encoding="utf-8").write(s)
print(tbl)
