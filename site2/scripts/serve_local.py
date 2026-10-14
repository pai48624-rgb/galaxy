# site2/dist 를 로컬에서 Cloudflare Pages 와 비슷하게 띄우는 정적 서버(확인용).
#   python -X utf8 scripts/serve_local.py 8792
# - /privacy → privacy.html, /ai/claude/ → ai/claude/index.html, /ai/claude → 같은 파일(Pages 는 301, 여기선 바로)
# - 없는 주소 → 404.html(상태 404)
# - public/_redirects 의 한 줄 규칙(/en/ → /en/korea/)도 흉내냄
import http.server, os, sys, socketserver, urllib.parse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8792
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")
REDIRECTS = {}
rp = os.path.join(ROOT, "_redirects")
if os.path.exists(rp):
    for line in open(rp, encoding="utf-8"):
        parts = line.split()
        if len(parts) >= 2 and not line.startswith("#"):
            REDIRECTS[parts[0]] = (parts[1], int(parts[2]) if len(parts) > 2 else 302)


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def resolve(self, path):
        p = urllib.parse.unquote(path.split("?")[0].split("#")[0])
        cands = []
        if p.endswith("/"):
            cands = [p + "index.html"]
        else:
            cands = [p, p + ".html", p + "/index.html"]
        for c in cands:
            f = os.path.join(ROOT, c.lstrip("/").replace("/", os.sep))
            if os.path.isfile(f):
                return f, 200
        # Cloudflare Pages 처럼 가장 가까운 상위 폴더의 404.html (예: /en/없는주소 → en/404.html) — 2026-10-14 영어판
        parts = [x for x in p.split("/") if x][:-1] if not p.endswith("/") else [x for x in p.split("/") if x]
        while parts:
            f = os.path.join(ROOT, *parts, "404.html")
            if os.path.isfile(f):
                return f, 404
            parts.pop()
        return os.path.join(ROOT, "404.html"), 404

    def do_GET(self):
        p = self.path.split("?")[0]
        if p in REDIRECTS:
            to, code = REDIRECTS[p]
            self.send_response(code); self.send_header("Location", to); self.end_headers(); return
        f, code = self.resolve(self.path)
        try:
            data = open(f, "rb").read()
        except OSError:
            self.send_response(404); self.end_headers(); return
        self.send_response(code)
        self.send_header("Content-Type", self.guess_type(f))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with S(("127.0.0.1", PORT), H) as s:
        print(f"site2 로컬 서버: http://127.0.0.1:{PORT}/  (폴더 {ROOT})", flush=True)
        s.serve_forever()
