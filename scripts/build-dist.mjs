// dist/ 를 루트 소스 파일들로부터 다시 만드는 스크립트.
// 목적: "루트 파일 고치고 dist/ 복사하는 걸 깜빡해서 옛날 버전이 배포되는" 사고 방지.
//
// dist/_worker.js 와 dist/selftest.html 은 루트에 원본이 없는 dist 전용 파일이라 건드리지 않음.
// data/, vendor/ 는 전체가 아니라 실제로 브라우저에서 fetch 하는 파일만 골라서 복사함
// (data/ 안의 lotto.db, *.xlsx, ai_enrichment.json, ai_landscape.json 은 가져오기 스크립트 전용이라 제외).

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

console.log("[build] 완료. dist/_worker.js, dist/selftest.html 은 그대로 유지됨.");
