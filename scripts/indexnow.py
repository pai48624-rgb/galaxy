"""배포 후 실행: sitemap.xml + sitemap-ai.xml·sitemap-trend.xml의 모든 주소를 IndexNow로 빙(api.indexnow.org)·네이버에 알린다
(2026-10-03, industry.aigalaxy-map.com과 같은 방식). 키 파일은 루트의 <KEY>.txt →
build-dist.mjs가 dist/로 복사해 https://aigalaxy-map.com/<KEY>.txt 로 배포. 202/200 = 접수.
실행: python scripts/indexnow.py
"""
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = "aigalaxy-map.com"
KEY = "3836b201693766a26e82d00418c13d65"
LIVE_SITEMAPS = ["sitemap-ai.xml", "sitemap-trend.xml"]
ENDPOINTS = ["https://api.indexnow.org/indexnow", "https://searchadvisor.naver.com/indexnow"]


def main():
    # sitemap.xml(정적) + sitemap-ai.xml(빌드 때 생성)·sitemap-trend.xml(워커가 DB로 생성)은 실서버에서 읽음 (10/03 추가)
    urls = re.findall(r"<loc>([^<]+)</loc>", (ROOT / "sitemap.xml").read_text(encoding="utf-8"))
    for name in LIVE_SITEMAPS:
        try:
            # 파이썬 기본 User-Agent는 Cloudflare가 403으로 막음
            req = urllib.request.Request(f"https://{HOST}/{name}", headers={"User-Agent": "Mozilla/5.0 (indexnow-submitter)"})
            xml = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
            urls += re.findall(r"<loc>([^<]+)</loc>", xml)
        except Exception as e:  # 하나 못 읽어도 나머지는 보냄
            print(f"{name} 읽기 실패: {e}")
    urls = list(dict.fromkeys(urls))
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls}).encode()
    for ep in ENDPOINTS:
        req = urllib.request.Request(ep, data=body, headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            r = urllib.request.urlopen(req, timeout=30)
            print(f"{ep.split('/')[2]}: {r.status} 접수 · {len(urls)}개")
        except urllib.error.HTTPError as e:
            print(f"{ep.split('/')[2]}: 오류 {e.code} {e.read()[:200]!r}")


if __name__ == "__main__":
    main()
