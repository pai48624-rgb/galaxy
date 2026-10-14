# -*- coding: utf-8 -*-
"""2단계 최종 보고서(HTML) — tools.jsonl·fetch.jsonl·mismatch/changed/failed.csv·notes_quality.tsv 로 숫자를 다시 세서 만듦.
  python report2.py <출력 html 경로>"""
import csv
import html
import json
import os
import re
import sys
from collections import Counter

H = os.path.dirname(os.path.abspath(__file__))
E = lambda s: html.escape(str(s if s is not None else ""))
tools = [json.loads(l) for l in open(os.path.join(H, "tools.jsonl"), encoding="utf-8")]
fetch = {json.loads(l)["slug"]: json.loads(l) for l in open(os.path.join(H, "fetch.jsonl"), encoding="utf-8")}
inp = {t["slug"]: t for t in json.load(open(os.path.join(H, "input_tools.json"), encoding="utf-8"))}
rd = lambda n: list(csv.DictReader(open(os.path.join(H, n), encoding="utf-8-sig")))
mism, chg, failed = rd("mismatch.csv"), rd("changed.csv"), rd("failed.csv")
notes = [l.rstrip("\n").split("\t", 1) for l in open(os.path.join(H, "notes_quality.tsv"), encoding="utf-8") if "\t" in l]
log = open(os.path.join(H, "fetch2_log.txt"), encoding="utf-8").read()
t0 = re.search(r"시작 (\S+ \S+)", log).group(1)
t1 = re.search(r"끝 (\S+ \S+)", log).group(1)

N = len(tools)
st = Counter(fetch[t["slug"]]["status"] for t in tools)
empty_pr = lambda p: (p or {}).get("free_tier") in (None, "불명") and not (p or {}).get("plans")
priced = [t for t in tools if not empty_pr(t.get("pricing"))]
direct = [t for t in priced if (t["pricing"].get("scope") or "직접") == "직접"]
ko = Counter(t.get("korean_support") or "불명" for t in tools)
bot = [t for t in tools if t.get("status_note")]
ext = sum(1 for t in tools if os.path.exists(os.path.join(H, "extracted", t["slug"] + ".json")))
reqs = sum(fetch[t["slug"]].get("requests", 0) for t in tools)
# 분류 재검토 후보(같은 기준): 기존 분류에 '유료/구독/종량'이 있는데 공식 페이지에 요금제가 없고 오픈소스 근거가 있음
review = [t for t in tools if re.search(r"유료|구독|종량|프리미엄", inp.get(t["slug"], {}).get("pricing_policy") or "")
          and not (t.get("pricing") or {}).get("plans") and t.get("open_source")]
unknown = [t for t in tools if empty_pr(t.get("pricing"))]
reason = Counter()
for t in unknown:
    r = (t.get("pricing") or {}).get("pricing_unknown_reason") or ""
    k = ("홈 접속 안 됨·막힘" if r.startswith("홈 접속") else "홈에 요금 링크 없음(추측 주소도 없음)" if "링크 없음" in r or "404" in r
         else "요금 페이지에 가격 숫자 없음" if "가격 숫자 없음" in r else "robots 금지" if "robots" in r else "정리에서 근거 못 찾음/기타")
    reason[k] += 1


def pl(p):
    out = []
    for x in (p or {}).get("plans") or []:
        pr = x.get("price")
        out.append("%s %s" % (x.get("name") or "", "" if pr is None else "%s %s" % (pr, x.get("currency") or "")))
    return " · ".join(out)[:160]


rows = []
for t in sorted(tools, key=lambda x: x["name_en"].lower()):
    p = t.get("pricing") or {}
    s = fetch[t["slug"]]["status"]
    flags = []
    if any(m["slug"] == t["slug"] for m in mism): flags.append("mismatch")
    if any(c["slug"] == t["slug"] for c in chg): flags.append("changed")
    if t.get("status_note"): flags.append("봇·로그인 화면")
    if p.get("scope", "").startswith("확인 필요"): flags.append("요금=상위 제품?")
    rows.append("<tr data-q='%s'><td><b>%s</b><div class='sub'>%s</div></td><td><span class='pill %s'>%s</span></td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td class='sub'>%s</td><td class='sub'>%s</td></tr>" % (
        E((t["name_en"] + " " + t["slug"]).lower()), E(t["name_en"]), E(t.get("one_liner_ko") or ""),
        "ok" if s in ("ok", "redirect") else "bad", E(s), E(p.get("free_tier") or "불명"), E(pl(p) or "—"),
        E(t.get("korean_support") or "불명"), E(t.get("open_source") or "—"), E(", ".join(flags)),
        E(inp.get(t["slug"], {}).get("pricing_policy") or "")))

pct = lambda a: "%d (%.0f%%)" % (a, 100 * a / max(1, N))
undone = [
    "요금 불명 %d개 — 이유: %s" % (len(unknown), ", ".join("%s %d" % kv for kv in reason.most_common())),
    "한국어 '불명' %d개 — 대부분 GitHub 본문만 받아 언어 정보([meta])가 없는 곳" % ko["불명"],
    "막힘 %d개(robots·접근 거부, 넘지 않음) · 종료·접속 안 됨 %d개 · 홈이 봇 확인·로그인 화면 %d개" % (st["blocked"], st["dead"], len(bot)),
    "요금이 상위·관련 제품 것일 수 있음(요금 페이지에 도구 이름 없음) %d개 — 사람 확인" % sum(1 for t in priced if (t['pricing'].get('scope') or '').startswith('확인 필요')),
    "mismatch 판단이 정리 묶음마다 조금 다름(‘유료 플랜 언급 없음’을 반대로 본 묶음/안 본 묶음) → 아래 '분류 재검토 후보'를 같은 기준으로 다시 셈 %d개" % len(review),
    "사람 확인 메모 %d건(주소 이동·인수·서비스 종료·다른 제품 등)" % len(notes),
    "텔레그램 보고 못 함(노트북에 봇 키 없음)",
]
nt = "".join("<tr><td><b>%s</b></td><td>%s</td></tr>" % (E(a), E(b)) for a, b in notes)
mm = "".join("<tr><td><b>%s</b></td><td class='sub'>%s</td><td>%s</td></tr>" % (E(m["name_en"]), E(m["기존_pricing_policy"]), E(m["차이"])) for m in mism)
cc = "".join("<tr><td><b>%s</b></td><td>%s</td></tr>" % (E(c["name_en"]), E(c["달라진_점"])) for c in chg)
uk = "".join("<tr><td>%s</td><td class='sub'>%s</td></tr>" % (E(t["name_en"]), E((t.get("pricing") or {}).get("pricing_unknown_reason") or "")) for t in sorted(unknown, key=lambda x: x["name_en"].lower()))
rv = ", ".join(E(t["name_en"]) for t in review)

page = """<title>AI 도구 공식 자료 2단계</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
/* 판단용 보고서: 못 한 것 → 숫자 → 판단할 것 → 다른 점 → 도구별 표(검색) */
:root{--bg:#f6f7fa;--panel:#fff;--fg:#1b2030;--mute:#5f6779;--line:#dde1ea;--accent:#3a55c8;--ok:#1d7a4f;--warn:#a26200;--bad:#b3302c;
--f-body:"IBM Plex Sans KR","Malgun Gothic",system-ui,sans-serif;--f-mono:"IBM Plex Mono",Consolas,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#11141c;--panel:#181c27;--fg:#e6e9f2;--mute:#9aa3b7;--line:#2a3142;--accent:#8da2ff;--ok:#5cc792;--warn:#e0a54a;--bad:#ef7b76;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#11141c;--panel:#181c27;--fg:#e6e9f2;--mute:#9aa3b7;--line:#2a3142;--accent:#8da2ff;--ok:#5cc792;--warn:#e0a54a;--bad:#ef7b76;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.6 var(--f-body)}
.wrap{max-width:1200px;margin:0 auto;padding-inline:16px;padding-block:28px 60px;display:grid;gap:22px}
h1{font-size:1.6rem;margin:0;text-wrap:balance}h2{font-size:1.12rem;margin:0 0 10px}
.lead{color:var(--mute);max-width:72ch;margin:4px 0 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px 14px}
.tile .v{font:500 1.4rem var(--f-mono);font-variant-numeric:tabular-nums}.tile .k{color:var(--mute);font-size:.84rem}
section{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:18px;min-width:0}
.warn-box{border-color:var(--warn)}
.scroll{overflow-x:auto;max-height:70vh;overflow-y:auto}table{border-collapse:collapse;width:100%%;font-size:.86rem}
.wide{min-width:1000px}th,td{border-bottom:1px solid var(--line);padding:7px 8px;vertical-align:top;text-align:left}
th{color:var(--mute);font-weight:500;font-size:.8rem;position:sticky;top:0;background:var(--panel)}
.sub{color:var(--mute);font-size:.8rem}.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.78rem;border:1px solid currentColor}
.ok{color:var(--ok)}.bad{color:var(--bad)}a{color:var(--accent)}ul{margin:0;padding-left:20px;display:grid;gap:6px}
input{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);width:min(360px,100%%)}
</style>
<div class="wrap">
<header><h1>AI 도구 공식 자료 수집 — 2단계 (747개)</h1>
<p class="lead">aigalaxy-map.com AI 도구 747개의 공식 페이지(홈·요금·소개·GitHub)만 받아, 본문에 실제로 있는 인용으로 근거를 붙여 정리했습니다. 데스크톱 검토 보완 4가지(요금 주소 찾기·앱형 화면 기다리기·한국어 4구분/changed·통화와 페이지 언어)를 넣었습니다. 사이트·Supabase는 건드리지 않았습니다.</p></header>
<section class="warn-box"><h2>못 한 것 · 부족한 것</h2><ul>%(undone)s</ul></section>
<div class="tiles">
<div class="tile"><div class="v">%(okc)s</div><div class="k">받기 성공(ok+redirect)</div></div>
<div class="tile"><div class="v">%(blk)d · %(dead)d</div><div class="k">막힘 · 종료/접속 안 됨</div></div>
<div class="tile"><div class="v">%(pr)s</div><div class="k">요금 확인(그중 직접 %(direct)d)</div></div>
<div class="tile"><div class="v">%(ko1)d · %(ko2)d · %(ko3)d · %(ko4)d</div><div class="k">UI 한국어 · 입력·출력 · 없음(영어 등만) · 불명</div></div>
<div class="tile"><div class="v">%(mm)d</div><div class="k">mismatch(기존 분류와 반대)</div></div>
<div class="tile"><div class="v">%(cg)d</div><div class="k">changed(요금 구조 크게 다름)</div></div>
<div class="tile"><div class="v">%(rq)d</div><div class="k">요청 수</div></div>
<div class="tile"><div class="v">%(t0)s~%(t1)s</div><div class="k">받기 시각(+정리 하위 작업 48묶음)</div></div>
</div>
<section><h2>데스크톱에서 판단할 것</h2><ul>
<li><b>mismatch %(mm)d · changed %(cg)d 를 사이트 요금 표기에 반영할지</b> — 근거 주소와 함께 mismatch.csv·changed.csv.</li>
<li><b>분류 재검토 후보 %(rvn)d개</b>(같은 기준: 기존 분류에 유료·구독·종량이 있는데 공식 페이지에 요금제가 없고 오픈소스 근거만 있음): <span class="sub">%(rv)s</span></li>
<li><b>사람 확인 메모 %(ntn)d건</b> — 주소가 다른 회사로 넘어감(인수)·서비스 종료·다른 제품·입력 주소 오류. 사이트 링크·목록 정리에 바로 쓰는 정보.</li>
<li><b>요금이 상위 제품 것일 수 있는 곳</b> — 모델 페이지에 ChatGPT·Gemini 요금이 붙은 경우 등('요금=상위 제품?' 표시).</li>
</ul></section>
<section><h2>사람 확인 메모 (%(ntn)d)</h2><div class="scroll"><table><tbody>%(nt)s</tbody></table></div></section>
<section><h2>기존 요금 분류와 반대 (mismatch %(mm)d)</h2><div class="scroll"><table><thead><tr><th>도구</th><th>기존 분류</th><th>공식 페이지와 다른 점</th></tr></thead><tbody>%(mmr)s</tbody></table></div></section>
<section><h2>요금 구조가 크게 다름 (changed %(cg)d)</h2><div class="scroll"><table><tbody>%(ccr)s</tbody></table></div></section>
<section><h2>요금 불명 (%(ukn)d) — 이유</h2><div class="scroll"><table><tbody>%(uk)s</tbody></table></div></section>
<section><h2>도구별 결과 (%(n)d)</h2><p><input id="q" type="search" placeholder="도구 이름으로 찾기" aria-label="도구 이름으로 찾기"></p>
<div class="scroll"><table class="wide"><thead><tr><th>도구 · 한 줄 요약</th><th>상태</th><th>무료</th><th>요금제</th><th>한국어</th><th>오픈소스</th><th>표시</th><th>기존 pricing_policy</th></tr></thead><tbody id="tb">%(rows)s</tbody></table></div></section>
<section><h2>파일</h2><ul><li>galaxy 가지 <code>collect/ai-tools-20261014</code> → <code>data/collected/ai_tools_20261014/</code>: tools.jsonl · mismatch.csv · changed.csv · failed.csv · notes_quality.tsv · raw/ · extracted/ · README.md</li>
<li>다시 만들기: <code>python extract.py build</code> → <code>python report2.py 보고서.html</code></li></ul></section>
</div>
<script>
const q=document.getElementById('q'),rows=[...document.querySelectorAll('#tb tr')];
q.addEventListener('input',()=>{const v=q.value.trim().toLowerCase();rows.forEach(r=>{r.hidden=v&&!r.dataset.q.includes(v)})});
</script>""" % dict(undone="".join("<li>%s</li>" % E(u) for u in undone), okc=pct(st["ok"] + st["redirect"]), blk=st["blocked"], dead=st["dead"],
                   pr=pct(len(priced)), direct=len(direct), ko1=ko["UI 한국어"], ko2=ko["한국어 입력·출력"], ko3=ko["없음(영어 등만)"], ko4=ko["불명"],
                   mm=len(mism), cg=len(chg), rq=reqs, t0=t0[11:16], t1=t1[11:16], rvn=len(review), rv=rv, ntn=len(notes), nt=nt, mmr=mm, ccr=cc,
                   ukn=len(unknown), uk=uk, n=N, rows="".join(rows))
open(sys.argv[1], "w", encoding="utf-8").write(page)
print("보고서", sys.argv[1], len(page) // 1024, "KB · 정리 파일", ext, "/", N)
print(undone)
