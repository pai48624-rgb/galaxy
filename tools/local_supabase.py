"""내 컴퓨터용 DB(2026-10-21, 사용자: "DB만 로컬에 만들어서 데이터 가져와서 테스트하면 되는 거 아니야").
실제 Supabase 대신 로컬 AI 성단 지도(wrangler, site2/.dev.vars 의 SUPABASE_URL)가 보는 작은 서버 — 실제 DB와 같은 주소 형식(/rest/v1/…)으로 답함.
- 저장: data/local_supabase.db(SQLite, git 안 올림). 실제 DB는 처음 seed 때 공개 글만 '읽기'로 복사 — 실제 DB에 쓰지 않음.
- 표: board_posts(AI 트렌드·게시판) · site_pages(한국 여행 옛 저장 화면) · korea_articles(한국 여행 doc) · factory_tokens · admins
- 함수: factory_post·factory_post_doc·factory_page·factory_korea(scripts/migrate_*.sql 과 같은 규칙) · check_signup_ip_ok
- 로그인·실시간 채팅은 로컬에서 안 됨(400/404로 답함).
실행:
  python -X utf8 tools/local_supabase.py seed          # 표 만들기 + 실제 공개 글 복사 + 공장 토큰 등록
  python -X utf8 tools/local_supabase.py serve [포트]   # 기본 54321
"""
import hashlib
import json
import re
import sqlite3
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "local_supabase.db"
LIVE = "https://urflispegkzouclljxzg.supabase.co"  # 읽기만(seed) — 워커 UPSTREAM 기본값과 같은 곳
ANON = "sb_publishable_MtDGFqdSWe09vUXg2ALtqw_5p1gZVCr"  # 공개 키(워커·화면에도 들어 있음)
JSON_COLS = {"tags", "doc", "sources"}
BOOL_COLS = {"hidden"}
SCHEMA = """
create table if not exists board_posts(id integer primary key autoincrement, user_id text, author_name text, title text not null, body text not null,
  created_at text not null, report_count integer default 0, hidden integer default 0, board text default 'free', external_id text unique,
  body_html text, tags text default '[]', menu_code text, cat_code text, design_code text, doc text);
create table if not exists site_pages(path text primary key, html text not null, content_type text default 'text/html; charset=utf-8', source text, updated_at text);
create table if not exists korea_articles(slug text not null, lang text not null, title text not null, doc text not null, menu_code text, cat_code text,
  design_code text, publish_date text not null, sources text default '[]', created_at text, updated_at text, primary key(slug, lang));
create table if not exists factory_tokens(token_hash text primary key, label text, created_at text);
create table if not exists admins(user_id text primary key);
"""


def now():
    return datetime.now(timezone.utc).isoformat()


def con():
    DB.parent.mkdir(exist_ok=True)
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    return c


# ---------- seed: 실제 공개 글 읽기만 ----------
def _live(path):
    req = urllib.request.Request(f"{LIVE}/rest/v1/{path}", headers={"apikey": ANON, "Authorization": "Bearer " + ANON})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def _factory_token():
    """공장이 쓰는 글 보내기 토큰(common_prj/.env GALAXY_POST_TOKEN) — 값은 출력하지 않고 해시만 저장"""
    paths = json.loads((ROOT.parents[1] / "paths.json").read_text(encoding="utf-8"))
    envf = ROOT.parents[1] / paths["common_prj"] / ".env"
    for line in envf.read_text(encoding="utf-8").splitlines():
        if line.startswith("GALAXY_POST_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def seed():
    c = con()
    posts = _live("board_posts?select=*&order=id.asc&limit=10000")
    pages = _live("site_pages?select=*&limit=10000")
    c.execute("delete from board_posts")
    c.execute("delete from site_pages")
    for p in posts:
        c.execute("insert into board_posts(id,user_id,author_name,title,body,created_at,report_count,hidden,board,external_id,body_html,tags,menu_code,cat_code,design_code,doc)"
                  " values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (p["id"], p.get("user_id"), p.get("author_name"), p["title"], p["body"], p["created_at"], p.get("report_count") or 0, 1 if p.get("hidden") else 0,
                   p.get("board") or "free", p.get("external_id"), p.get("body_html"), json.dumps(p.get("tags") or [], ensure_ascii=False),
                   p.get("menu_code"), p.get("cat_code"), p.get("design_code"), json.dumps(p["doc"], ensure_ascii=False) if p.get("doc") else None))
    for p in pages:
        c.execute("insert into site_pages values(?,?,?,?,?)", (p["path"], p["html"], p.get("content_type"), p.get("source"), p.get("updated_at")))
    tok = _factory_token()
    if tok:
        c.execute("insert or replace into factory_tokens values(?,?,?)", (hashlib.sha256(tok.encode()).hexdigest(), "공장(로컬)", now()))
    c.execute("insert or ignore into admins values('local-admin')")
    c.commit()
    print(f"로컬 DB {DB}: board_posts {len(posts)} · site_pages {len(pages)} · 공장 토큰 {'등록' if tok else '없음(.env GALAXY_POST_TOKEN)'} · 실제 DB엔 안 씀")


# ---------- PostgREST 흉내(쓰는 만큼만) ----------
class PgError(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


def _row(r):
    d = dict(r)
    for k in list(d):
        if k in JSON_COLS and isinstance(d[k], str):
            try:
                d[k] = json.loads(d[k])
            except ValueError:
                pass
        if k in BOOL_COLS and d[k] is not None:
            d[k] = bool(d[k])
    return d


def _cols(c, table):
    cols = [r[1] for r in c.execute(f"pragma table_info({table})")]
    if not cols:
        raise PgError(f'relation "public.{table}" does not exist', 404)
    return cols


def _val(col, v):
    if col in BOOL_COLS:
        return 1 if v == "true" else 0 if v == "false" else v
    return v


def _where(q, cols):
    sql, args = [], []
    ops = {"eq": "=", "neq": "!=", "lt": "<", "lte": "<=", "gt": ">", "gte": ">=", "like": "like", "ilike": "like"}
    for k, vs in q.items():
        if k in ("select", "order", "limit", "offset", "on_conflict") or k not in cols:
            continue
        for v in vs:
            op, _, val = v.partition(".")
            if op == "is":
                sql.append(f"{k} is {'null' if val == 'null' else ('1' if val == 'true' else '0')}" if val != "null" else f"{k} is null")
            elif op == "in":
                items = [x.strip().strip('"') for x in val.strip("()").split(",") if x.strip()]
                sql.append(f"{k} in ({','.join('?' * len(items))})")
                args += [_val(k, x) for x in items]
            elif op in ops:
                sql.append(f"{k} {ops[op]} ?")
                args.append(_val(k, val.replace("*", "%")))
    return (" where " + " and ".join(sql)) if sql else "", args


def select(table, q):
    c = con()
    cols = _cols(c, table)
    want = [x.strip() for x in (q.get("select", ["*"])[0]).split(",") if x.strip()]
    sel = cols if want == ["*"] else [x for x in want if x in cols]
    if not sel:
        sel = cols
    w, a = _where(q, cols)
    order = ""
    if q.get("order"):
        parts = []
        for o in q["order"][0].split(","):
            col, _, d = o.partition(".")
            if col in cols:
                parts.append(f"{col} {'desc' if d.startswith('desc') else 'asc'}")
        order = (" order by " + ",".join(parts)) if parts else ""
    lim = f" limit {int(q['limit'][0])}" if q.get("limit") else ""
    off = f" offset {int(q['offset'][0])}" if q.get("offset") else ""
    return [_row(r) for r in c.execute(f"select {','.join(sel)} from {table}{w}{order}{lim}{off}", a)]


def patch(table, q, body):
    c = con()
    cols = _cols(c, table)
    w, a = _where(q, cols)
    sets = {k: (json.dumps(v, ensure_ascii=False) if k in JSON_COLS and v is not None else (1 if v is True else 0 if v is False else v)) for k, v in body.items() if k in cols}
    if not sets or not w:
        raise PgError("nothing to update")
    c.execute(f"update {table} set {', '.join(k + '=?' for k in sets)}{w}", [*sets.values(), *a])
    c.commit()


def _token_ok(c, tok):
    return bool(tok) and c.execute("select 1 from factory_tokens where token_hash=?", (hashlib.sha256(str(tok).encode()).hexdigest(),)).fetchone()


def rpc(fn, a):
    c = con()
    if fn == "check_signup_ip_ok":
        return True
    if fn in ("factory_post", "factory_post_doc", "factory_page", "factory_korea") and not _token_ok(c, a.get("p_token")):
        raise PgError("bad_token")
    nz = lambda v: (str(v).strip() or None) if v is not None else None  # noqa: E731 — nullif(btrim(x), '')
    if fn in ("factory_post", "factory_post_doc"):
        doc = a.get("p_doc")
        if doc is not None and not isinstance(doc, dict):
            raise PgError("bad_doc")
        if a.get("p_external_id"):
            r = c.execute("select id from board_posts where external_id=?", (a["p_external_id"],)).fetchone()
            if r:
                return {"id": r[0], "dup": True}
        body = str(a.get("p_body") or "").strip()
        if not 1 <= len(body) <= 20000:
            raise PgError('new row violates check constraint "board_posts_body_len"')
        cur = c.execute("insert into board_posts(user_id,author_name,title,body,body_html,tags,board,external_id,menu_code,cat_code,design_code,doc,created_at)"
                        " values('local-admin','AI 성단 지도',?,?,?,?,'ai_trend',?,?,?,?,?,?)",
                        (str(a.get("p_title") or "").strip(), body, a.get("p_body_html"), json.dumps(a.get("p_tags") or [], ensure_ascii=False), a.get("p_external_id"),
                         nz(a.get("p_menu_code")), nz(a.get("p_cat_code")), nz(a.get("p_design_code")), json.dumps(doc, ensure_ascii=False) if doc else None, now()))
        c.commit()
        return {"id": cur.lastrowid, "dup": False}
    if fn == "factory_page":
        p, html = str(a.get("p_path") or ""), a.get("p_html")
        if not re.fullmatch(r"/(en/)?korea/([a-z0-9][a-z0-9-]{0,80}/)?", p) and p != "/sitemap-korea.xml":
            raise PgError("bad_path")
        if html is None or not 200 <= len(html) <= 3_000_000:
            raise PgError("bad_size")
        c.execute("insert into site_pages values(?,?,?,?,?) on conflict(path) do update set html=excluded.html, content_type=excluded.content_type,"
                  " source=excluded.source, updated_at=excluded.updated_at", (p, html, a.get("p_content_type") or "text/html; charset=utf-8", a.get("p_source"), now()))
        c.commit()
        return {"ok": True, "path": p}
    if fn == "factory_korea":
        doc = a.get("p_doc")
        if not isinstance(doc, dict):
            raise PgError("bad_doc")
        if not a.get("p_publish_date"):
            raise PgError("bad_publish_date")
        old = c.execute("select 1 from korea_articles where slug=? and lang=?", (a.get("p_slug"), a.get("p_lang"))).fetchone()
        c.execute("insert into korea_articles values(?,?,?,?,?,?,?,?,?,?,?) on conflict(slug,lang) do update set title=excluded.title, doc=excluded.doc,"
                  " menu_code=excluded.menu_code, cat_code=excluded.cat_code, design_code=excluded.design_code, publish_date=excluded.publish_date,"
                  " sources=excluded.sources, updated_at=excluded.updated_at",
                  (a.get("p_slug"), a.get("p_lang"), str(a.get("p_title") or "").strip(), json.dumps(doc, ensure_ascii=False), nz(a.get("p_menu_code")),
                   nz(a.get("p_cat_code")), nz(a.get("p_design_code")), a["p_publish_date"], json.dumps(a.get("p_sources") or [], ensure_ascii=False), now(), now()))
        c.commit()
        return {"ok": True, "slug": a.get("p_slug"), "lang": a.get("p_lang"), "updated": bool(old)}
    raise PgError(f"function {fn} not found(로컬 DB에 없음)", 404)


class H(BaseHTTPRequestHandler):
    def _send(self, status, obj=None):
        b = b"" if obj is None else json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _route(self, method):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query, keep_blank_values=True)
        try:
            if not u.path.startswith("/rest/v1/"):
                return self._send(400, {"message": "로컬 DB: 로그인·실시간은 안 됨", "path": u.path})
            name = u.path[len("/rest/v1/"):]
            body = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"null") if method in ("POST", "PATCH") else None
            if name.startswith("rpc/"):
                return self._send(200, rpc(name[4:], body or {}))
            if method == "GET":
                return self._send(200, select(name, q))
            if method == "PATCH":
                patch(name, q, body or {})
                return self._send(204)
            return self._send(405, {"message": "로컬 DB: 이 요청은 안 됨"})
        except PgError as e:
            return self._send(e.status, {"code": "P0001", "message": str(e)})

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def do_PATCH(self):
        self._route("PATCH")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "*")
        self.send_header("access-control-allow-methods", "GET,POST,PATCH,OPTIONS")
        self.end_headers()

    def log_message(self, *a):
        pass


def serve(port=54321):
    con()
    print(f"로컬 DB 서버 http://127.0.0.1:{port} (data/local_supabase.db)")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if cmd == "seed":
        seed()
    else:
        serve(int(sys.argv[2]) if len(sys.argv) > 2 else 54321)
