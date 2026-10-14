// 영어판 남은 한글 세기(빠른 정적 검사, 2026-10-14) — node scripts/count_hangul_en.mjs [--all]
// dist/en/**/*.html 의 화면 글자(스크립트·스타일·주석·태그 속성 제외)에서 [가-힣] 글자 수를 센다.
// 허용(세지 않음): 언어 전환 버튼 "한국어", 한국 지명 괄호 병기(예: Seoraksan (설악산)).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const DIST = join(dirname(dirname(fileURLToPath(import.meta.url))), 'dist', 'en');
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.html')) files.push(p); } })(DIST);
export function visibleText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<a [^>]*data-lang="ko"[^>]*>한국어<\/a>/g, ' ')
    .replace(/>\s*한국어로 보기\s*</g, '><') // 한국 여행 글 끝의 한국어판 전환 링크
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
}
export function hangulLeft(text) {
  const t = text.replace(/\(([^()]*[가-힣][^()]*)\)/g, (m, k) => (k.length <= 30 ? ' ' : m)); // 지명 괄호 병기 허용(예: Daedongmun Course (대동문코스))
  const m = t.match(/[가-힣]+/g) || [];
  return { n: m.join('').length, words: [...new Set(m)] };
}
const rows = files.map((p) => { const r = hangulLeft(visibleText(readFileSync(p, 'utf8'))); return { page: p.slice(DIST.length).replace(/\\/g, '/'), ...r }; }).sort((a, b) => b.n - a.n);
const bad = rows.filter((r) => r.n);
console.log(`영어 페이지 ${rows.length}개, 한글 남은 페이지 ${bad.length}개, 남은 한글 합계 ${bad.reduce((s, r) => s + r.n, 0)}자`);
for (const r of process.argv.includes('--all') ? rows : bad.slice(0, 40)) console.log(`/en${r.page} | ${r.n} | ${r.words.slice(0, 10).join(' ')}`);
