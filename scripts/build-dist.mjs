// dist/ 를 루트 소스 파일들로부터 다시 만드는 스크립트.
// 목적: "루트 파일 고치고 dist/ 복사하는 걸 깜빡해서 옛날 버전이 배포되는" 사고 방지.
//
// dist/_worker.js 와 dist/selftest.html 은 루트에 원본이 없는 dist 전용 파일이라 건드리지 않음.
// data/, vendor/ 는 전체가 아니라 실제로 브라우저에서 fetch 하는 파일만 골라서 복사함
// (data/ 안의 lotto.db, *.xlsx, ai_enrichment.json, ai_landscape.json 은 가져오기 스크립트 전용이라 제외).

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSeoPages } from "./gen-seo-pages.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, "dist");

const ROOT_FILES = [
  "index.html",
  "privacy.html",
  "ads.txt",
  "sitemap.xml",
  "robots.txt",
  "naver11527827ffc572c4fc7337b69af3d8a9.html",
  "naverf7a773b489c1dab0e775a86c8ababb3a.html",
  "manifest.webmanifest",
  "galaxy-sw.js",
  "3836b201693766a26e82d00418c13d65.txt", // IndexNow 키 파일(scripts/indexnow.py, 2026-10-03)
];

const DATA_FILES = [
  "affiliate_suns.json",
  "ai_combos.json",
  "ai_top10_relations.json",
  "ai_top_rank.json",
  "constellations_88.json",
  "deepsky_textures.json",
  "planet_textures.json",
  "world_countries.json",
];

function copyIfExists(srcPath, destPath) {
  if (!existsSync(srcPath)) {
    console.warn(`  (건너뜀 — 소스에 없음) ${srcPath}`);
    return;
  }
  mkdirSync(dirname(destPath), { recursive: true });
  copyFileSync(srcPath, destPath);
  console.log(`  ${srcPath.replace(ROOT + "\\", "").replace(ROOT + "/", "")} -> dist/`);
}

function copyDirRecursive(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const s = join(srcDir, entry);
    const d = join(destDir, entry);
    if (statSync(s).isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

console.log("[build] 루트 파일 -> dist/");
for (const f of ROOT_FILES) copyIfExists(join(ROOT, f), join(DIST, f));

console.log("[build] data/*.json -> dist/data/");
for (const f of DATA_FILES) copyIfExists(join(ROOT, "data", f), join(DIST, "data", f));
copyDirRecursive(join(ROOT, "data", "models"), join(DIST, "data", "models"));

console.log("[build] vendor/ -> dist/vendor/ (전체 복사)");
copyDirRecursive(join(ROOT, "vendor"), join(DIST, "vendor"));

console.log("[build] galaxy_saas/ -> dist/galaxy_saas/ (전체 복사, /galaxy_saas/ 경로로 배포됨)");
copyDirRecursive(join(ROOT, "galaxy_saas"), join(DIST, "galaxy_saas"));

// ---- rss.xml 생성 (2026-10-03 "aigalaxy-map.com RSS 등록하게 만들어" - 네이버 서치어드바이저 제출용)
// 원래 /rss.xml 은 파일이 없어서 메인 HTML이 대신 나가고 있었음. sitemap.xml 에 있는 페이지를
// 그대로 항목으로 쓰고(개인정보처리방침 같은 안내 페이지는 제외), 제목·설명은 각 페이지의
// <title>·meta description 에서 읽음 → 페이지를 늘리면 sitemap 만 고쳐도 RSS가 따라감.
// 날짜는 그 파일의 마지막 git 커밋 시각(없으면 파일 수정 시각).
const SITE = "https://aigalaxy-map.com";
const RSS_EXCLUDE = new Set(["/privacy"]);

function sourceFor(path) {
  if (path === "/") return "index.html";
  if (path.endsWith("/")) return join(path.slice(1), "index.html");
  return path.slice(1) + ".html";
}

function xmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlUnescape(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function lastChanged(file) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${file}"`, { cwd: ROOT }).toString().trim();
    if (iso) return new Date(iso);
  } catch (e) { /* git 없으면 아래로 */ }
  return statSync(join(ROOT, file)).mtime;
}

console.log("[build] sitemap.xml -> dist/rss.xml");
const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
const items = [];
for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const path = loc.replace(SITE, "") || "/";
  if (RSS_EXCLUDE.has(path)) continue;
  const file = sourceFor(path);
  if (!existsSync(join(ROOT, file))) {
    console.warn(`  (RSS 건너뜀 — 소스 없음) ${file}`);
    continue;
  }
  const html = readFileSync(join(ROOT, file), "utf8");
  const title = htmlUnescape((html.match(/<title>([^<]*)<\/title>/) || [, path])[1].trim());
  const desc = htmlUnescape((html.match(/<meta name="description" content="([^"]*)"/) || [, ""])[1].trim());
  items.push({ loc, title, desc, date: lastChanged(file) });
}
const newest = items.reduce((a, b) => (a > b.date ? a : b.date), new Date(0));
const rss =
  '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>' +
  `<title>AI 성단 지도</title><link>${SITE}/</link>` +
  "<description>731개+ AI 서비스를 용도별 은하계로 탐색하는 AI 관계형 지도와 무료 AI 도구 모음</description>" +
  `<language>ko</language><lastBuildDate>${newest.toUTCString()}</lastBuildDate>` +
  items.map((i) =>
    `<item><title>${xmlEscape(i.title)}</title><link>${i.loc}</link><guid isPermaLink="true">${i.loc}</guid>` +
    `<description>${xmlEscape(i.desc)}</description><pubDate>${i.date.toUTCString()}</pubDate></item>`
  ).join("") +
  "</channel></rss>\n";
writeFileSync(join(DIST, "rss.xml"), rss);
console.log(`  rss.xml 항목 ${items.length}개`);

console.log("[build] 검색용 페이지 생성(/ai/, /category/, sitemap-ai.xml) — Supabase 읽기 실패하면 빌드 중단");
console.log("[build]", await generateSeoPages());

console.log("[build] 완료. dist/_worker.js, dist/selftest.html 은 그대로 유지됨.");
