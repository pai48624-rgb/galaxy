// 영어판 번역 캐시 만들기(2026-10-14) — `npm run translate`
// 빌드와 분리: 이 스크립트가 데이터 문구(한국어)를 모아 캐시에 없는 것만 번역해 src/i18n/cache/<묶음>.json(원문→번역)에 저장한다.
// 빌드(astro build)는 캐시만 읽는다(번역 호출 없음, 빌드 시간 그대로).
// 번역 경로: 이 PC의 Claude Code 구독 로그인(claude -p, 도구 없음). 유료 API 키(ANTHROPIC_API_KEY 등)가 보이면 멈춘다.
// 사용: node scripts/translate.mjs [묶음 이름...] [--dry]  (묶음: tools combos rank privacy trend trend_posts)
// trend_posts = 트렌드 글 본문(아래 2-b). `npm run translate:trend` 는 trend(목록 제목·요약) + trend_posts 만.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SITE2 = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = dirname(SITE2); // galaxy 프로젝트 뿌리
const CACHE = join(SITE2, 'src', 'i18n', 'cache');
const WORK = join(SITE2, '.translate_work'); // 빈 작업 폴더(프로젝트 설정·CLAUDE.md 안 읽히게)
mkdirSync(CACHE, { recursive: true }); mkdirSync(WORK, { recursive: true });
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const only = args.filter((a) => !a.startsWith('--'));
const CONCURRENCY = 3;
const BATCH_ITEMS = 60, BATCH_CHARS = 7000;

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const uniq = (a) => [...new Set(a.map((s) => String(s || '').trim()).filter((s) => /[가-힣]/.test(s)))];

// ---- 1. 번역할 원문 모으기(화면에 실제 나오는 필드만) ----
const slugify = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'ai';
function collectTools() {
  const L = readJson('data/ai_landscape.json'), E = readJson('data/ai_enrichment.json');
  const pages = new Set(existsSync(join(ROOT, 'dist/data/ai_pages.json')) ? readJson('dist/data/ai_pages.json') : []);
  const used = new Set(); const pageNames = new Set();
  for (const r of L) { const b = slugify(r.name_en || r.name_ko); let s = b; for (let i = 2; used.has(s); i++) s = `${b}-${i}`; used.add(s); if (pages.has(s)) pageNames.add(r.name_en); }
  return uniq([
    ...E.filter((e) => pageNames.has(e.name_en)).map((e) => e.long_desc_ko), // 안내 페이지(74)에서만 보임
    ...E.flatMap((e) => e.key_features || []),
    ...E.map((e) => e.pricing_detail), ...E.map((e) => e.pricing_policy), ...E.map((e) => e.info_confidence),
    ...L.filter((r) => !r.desc_en).map((r) => r.desc_ko), // 영어 설명이 없을 때만
    ...L.filter((r) => !r.category_en).map((r) => r.category),
    ...L.filter((r) => r.subcategory && !r.subcategory_en).map((r) => r.subcategory),
  ]);
}
function collectCombos() {
  const C = readJson('data/ai_combos.json');
  return uniq([...C.map((c) => c.title_ko), ...C.map((c) => c.workflow_ko), ...C.map((c) => c.pricing_summary_ko), ...C.flatMap((c) => [c.brain, ...(c.executors || [])])]); // 도구 이름에 한글이 섞인 것(예: Gemini 이미지 생성)도
}
function collectRank() {
  const R = readJson('data/ai_top_rank.json'), T = readJson('data/ai_top10_relations.json');
  return uniq([...R.map((r) => r.reason), ...T.flatMap((x) => (x.groups || []).map((g) => g.category_ko)), ...T.flatMap((x) => (x.groups || []).flatMap((g) => (g.items || []).map((i) => i.reason_ko))), ...T.flatMap((x) => (x.groups || []).flatMap((g) => (g.items || []).map((i) => i.name)))]);
}
// 개인정보: 한국어 본문(<hr> 앞)을 덩어리(h1·p·h2·ul) 단위로. 빌드도 같은 규칙으로 쪼갠다(src/i18n/tr.ts privacyBlocks).
export function privacyBlocks(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1].split(/<hr[^>]*>/)[0];
  return (body.match(/<(h1|h2|p|ul)[\s\S]*?<\/\1>/g) || []).map((s) => s.replace(/\s+/g, ' ').trim());
}
function collectPrivacy() { return uniq(privacyBlocks(readFileSync(join(ROOT, 'privacy.html'), 'utf8'))); }
async function collectTrend() {
  const UP = 'https://urflispegkzouclljxzg.supabase.co', KEY = 'sb_publishable_MtDGFqdSWe09vUXg2ALtqw_5p1gZVCr';
  const r = await fetch(`${UP}/rest/v1/board_posts?select=id,title,body,tags,created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=100`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error('트렌드 글 읽기 실패 ' + r.status);
  const rows = await r.json();
  const summary = (b, n) => { const s = String(b || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  return uniq([...rows.map((p) => p.title), ...rows.map((p) => summary(p.body, 120))]);
}
const GROUPS = { tools: collectTools, combos: collectCombos, rank: collectRank, privacy: collectPrivacy, trend: collectTrend };

// ---- 2. 번역 규칙(프롬프트) ----
const RULES = `You translate Korean UI/data text for "AI Galaxy Map" (aigalaxy-map.com), a 3D relationship map of AI tools, into natural English for an international audience.
Rules:
- Natural, plain English. Keep the meaning; do not add claims, do not exaggerate, do not summarize or drop details.
- Keep proper nouns, product/tool/company names, model names, numbers, prices, units, dates, URLs and code exactly as written (e.g. ChatGPT, Claude, n8n; "$20/월" becomes "$20/month").
- If a tool or company name is written in Korean (e.g. 지피티, 클로드, 노션), write its usual English name instead.
- Korean place names: use the Korea Tourism Organization romanization (e.g. 설악산 = Seoraksan, 북한산 = Bukhansan, 경포해수욕장 = Gyeongpo Beach).
- Preserve every HTML tag and attribute exactly (<b>, <a href=...>, <code>, <li> ...); translate only the text between tags. In Google URLs change hl=ko to hl=en.
- Site terms: 두뇌(도구) = "brain (tool)", 실행 도구 = "executor tools", 성단 = "cluster", 영향도 = "impact", 조합 = "combo", 분야 = "field", 요금 = "pricing", 종량제 = "pay-as-you-go", 프리미엄 = "freemium", 구독 = "subscription", 엔터프라이즈 = "enterprise".
- Short labels stay short. Output must contain no Korean characters.
- Return exactly one output per input id "i", same ids, field "en". No notes.`;
const SCHEMA = JSON.stringify({ type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer' }, en: { type: 'string' } }, required: ['i', 'en'] } } }, required: ['items'] });

function claudeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('CLAUDE')) env[k] = v; // 중첩 실행 차단 회피(common_prj frames.py 와 같음)
  return env;
}
function runClaude(input) {
  return new Promise((resolve, reject) => {
    const cmd = ['-p', '--setting-sources', 'project', '--model', 'sonnet', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence', '--disable-slash-commands', '--json-schema', SCHEMA];
    const p = spawn('claude', cmd, { cwd: WORK, env: claudeEnv(), shell: false, windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill(); reject(new Error('시간 초과(600초)')); }, 600000);
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude 종료 코드 ${code}: ${(err || out).slice(-300)}`));
      try {
        const j = JSON.parse(out);
        if (j.is_error) return reject(new Error('claude 오류 응답: ' + String(j.result).slice(0, 200)));
        resolve(j.structured_output || JSON.parse(String(j.result).replace(/^```(json)?|```$/g, '')));
      } catch (e) { reject(new Error('응답 해석 실패: ' + out.slice(0, 300))); }
    });
    p.stdin.end(input, 'utf8');
  });
}

// 번역 검사: 태그 수가 원문과 같아야 하고, 한글이 남으면 안 됨
const tagCount = (s) => (s.match(/<\/?[a-z][^>]*>/gi) || []).length;
function check(ko, en) {
  if (!en || !en.trim()) return '빈 번역';
  if (/[가-힣]/.test(en)) return '한글 남음';
  if (tagCount(ko) !== tagCount(en)) return `태그 수 다름 ${tagCount(ko)}→${tagCount(en)}`;
  return '';
}

async function translateGroup(name) {
  const file = join(CACHE, `${name}.json`);
  const cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const src = await GROUPS[name]();
  const todo = src.filter((s) => !cache[s]);
  console.log(`[translate] ${name}: 원문 ${src.length}개(${src.reduce((n, s) => n + s.length, 0)}자), 캐시 ${src.length - todo.length}개, 번역할 것 ${todo.length}개`);
  if (DRY || !todo.length) return { name, total: src.length, done: 0, failed: 0 };
  const batches = []; let cur = [], chars = 0;
  for (const s of todo) { if (cur.length && (cur.length >= BATCH_ITEMS || chars + s.length > BATCH_CHARS)) { batches.push(cur); cur = []; chars = 0; } cur.push(s); chars += s.length; }
  if (cur.length) batches.push(cur);
  let done = 0, failed = 0, bi = 0;
  const save = () => writeFileSync(file, JSON.stringify(cache, null, 1) + '\n', 'utf8');
  async function worker() {
    while (bi < batches.length) {
      const myIdx = bi++; let b = batches[myIdx];
      for (let attempt = 1; attempt <= 3 && b.length; attempt++) {
        const t0 = Date.now();
        try {
          const input = RULES + '\n\nInput (JSON):\n' + JSON.stringify(b.map((ko, i) => ({ i, ko })));
          const res = await runClaude(input);
          const got = new Map((res.items || []).map((x) => [x.i, x.en]));
          const bad = [];
          b.forEach((ko, i) => { const en = String(got.get(i) || '').trim(); const p = check(ko, en); if (p) bad.push(`${i}:${p}`); else { cache[ko] = en; done++; } });
          save();
          console.log(`[translate] ${name} 묶음 ${myIdx + 1}/${batches.length} ${b.length}개 → 저장 ${b.length - bad.length}개 (${Math.round((Date.now() - t0) / 1000)}초)${bad.length ? ' 문제 ' + bad.join(' ') : ''}`);
          b = b.filter((ko) => !cache[ko]);
        } catch (e) {
          console.warn(`[translate] ${name} 묶음 ${myIdx + 1} ${attempt}차 실패: ${e.message}`);
        }
      }
      failed += b.length;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return { name, total: src.length, done, failed };
}

// ---- 2-b. 트렌드 글 본문(2026-10-14) — 묶음 이름 trend_posts ----
// 공개 글(board_posts, board=ai_trend, hidden=false)을 워커 API(같은 /api/rest/v1 프록시, 읽기만)로 받아
// 제목·본문(body_html)·태그를 영어로 옮겨 src/i18n/cache/trend_posts.json 에 {id: {title, body_html, tags, src_hash, translated_at}} 로 저장.
// - 원문(제목+본문+태그) 해시가 같으면 건너뜀, 달라지면 다시 번역. 공개에서 빠진 글은 캐시에서 지움(빌드가 영어판을 안 만들게).
// - HTML은 통째로 맡기지 않는다: 태그 사이 글자 덩어리(굵게·링크 같은 줄 안 태그 포함)만 뽑아 옮기고 다시 끼움 → 블록 태그·class·<style>(.gx 글 틀)은 원문 그대로.
// - 링크(href)는 원문 그대로 저장. 영어판 주소로 바꾸는 건 빌드(src/pages/en/trend/[id]/index.astro)가 lp 규칙(R)으로 한다.
// 글 읽는 곳: 로컬 서버(.env 의 LOCAL_SITE_URL) → 안 되면 본 사이트(PUBLIC_SITE_URL) 프록시. 둘 다 같은 워커 경로, 읽기만.
const SB_PUBLIC_KEY = 'sb_publishable_MtDGFqdSWe09vUXg2ALtqw_5p1gZVCr'; // 공개(읽기 전용) 키 — 화면 코드(src/lib/data.ts)와 같은 값
function envFile() {
  const f = join(SITE2, '.env'); const o = {};
  if (existsSync(f)) for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) o[m[1]] = m[2]; }
  return o;
}
async function fetchTrendRows() {
  const E = { ...envFile(), ...process.env };
  const bases = [E.LOCAL_SITE_URL, E.PUBLIC_SITE_URL].filter(Boolean);
  const q = '/api/rest/v1/board_posts?select=id,title,body,body_html,tags,created_at&board=eq.ai_trend&hidden=eq.false&order=created_at.desc&limit=200';
  let last = '';
  for (const b of bases) {
    try {
      const r = await fetch(b.replace(/\/$/, '') + q, { headers: { apikey: SB_PUBLIC_KEY, Authorization: `Bearer ${SB_PUBLIC_KEY}` } });
      if (!r.ok) { last = `${b} ${r.status}`; continue; }
      const rows = await r.json();
      console.log(`[translate] trend_posts: ${b} 에서 공개 글 ${rows.length}편 읽음`);
      return rows;
    } catch (e) { last = `${b} ${e.message}`; }
  }
  throw new Error('트렌드 글 읽기 실패: ' + last);
}
const INLINE = new Set(['a', 'b', 'strong', 'i', 'em', 'small', 'br', 'code', 'span', 'q', 'sup', 'sub', 'mark', 'u', 's', 'abbr', 'wbr']);
const ATTR_TR = /(\s(?:alt|title|aria-label|placeholder)=")([^"]*[가-힣][^"]*)(")/g;
// HTML → 조각 목록(그대로 둘 것 / 옮길 덩어리 번호). joinHtml 로 다시 합친다.
export function segmentHtml(html) {
  const parts = []; const units = []; let run = '';
  const addUnit = (s) => { units.push(s); return { u: units.length - 1 }; };
  const rawTag = (t) => { // 블록 태그의 alt·title 등 한글 속성도 옮김
    const segs = []; let last = 0; let m; ATTR_TR.lastIndex = 0;
    while ((m = ATTR_TR.exec(t))) { segs.push(t.slice(last, m.index) + m[1]); segs.push(addUnit(m[2])); last = m.index + m[0].length - 1; }
    segs.push(t.slice(last)); return segs;
  };
  const flush = () => {
    if (!run) return;
    if (/[가-힣]/.test(run)) {
      const lead = run.match(/^\s*/)[0], trail = run.match(/\s*$/)[0];
      parts.push(lead, addUnit(run.slice(lead.length, run.length - trail.length)), trail);
    } else parts.push(run);
    run = '';
  };
  const re = /<!--[\s\S]*?-->|<(style|script)\b[\s\S]*?<\/\1\s*>|<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|[^<]+|</g;
  let m;
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (m[1] || tok.startsWith('<!--')) { flush(); parts.push(tok); }
    else if (m[2]) { if (INLINE.has(m[2].toLowerCase())) run += tok; else { flush(); parts.push(...rawTag(tok)); } }
    else run += tok;
  }
  flush();
  return { parts, units };
}
export const joinHtml = (parts, tr) => parts.map((p) => (typeof p === 'string' ? p : tr[p.u])).join('');
const POST_RULES = `${RULES}
Extra rules for this job: the inputs are consecutive fragments of ONE blog article (in reading order), split at block-level HTML tags.
- Translate each fragment on its own, but keep terminology consistent across fragments. A fragment may be a heading, a table cell, a label, an image alt text or a full paragraph.
- Keep inline HTML tags (<b>, <a href="...">, <span class="...">, <q>, <br>, <small>, <code>) exactly, same count and order; translate only the text. Keep HTML entities such as &#34; or &amp;.
- Korean money amounts: "30달러" = "$30", "월 30달러" = "$30/month", "1만 원" = "KRW 10,000".
- Korean names of companies/products: use the official English name (앤스로픽 = Anthropic, 그록 = Grok, 코히어 = Cohere).`;
function hashOf(p) { return createHash('sha256').update(JSON.stringify([p.title, p.body_html || p.body || '', p.tags || []])).digest('hex').slice(0, 16); }

async function translateTrendPosts() {
  const file = join(CACHE, 'trend_posts.json');
  const cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const rows = await fetchTrendRows();
  const live = new Set(rows.map((p) => String(p.id)));
  let removed = 0;
  for (const id of Object.keys(cache)) if (!live.has(id)) { delete cache[id]; removed++; }
  const todo = rows.filter((p) => cache[p.id]?.src_hash !== hashOf(p));
  console.log(`[translate] trend_posts: 공개 ${rows.length}편, 그대로 ${rows.length - todo.length}편, 번역할 것 ${todo.length}편${removed ? `, 비공개로 빠져 지움 ${removed}편` : ''}`);
  const save = () => writeFileSync(file, JSON.stringify(cache, null, 1) + '\n', 'utf8');
  if (removed && !DRY) save();
  if (DRY || !todo.length) return { name: 'trend_posts', total: rows.length, done: 0, failed: 0 };
  // 글마다 조각을 뽑아 묶음으로(한 묶음은 한 글 안에서만 — 앞뒤 문맥 유지)
  const jobs = []; const state = new Map();
  for (const p of todo) {
    const body = p.body_html || `<div style="white-space:pre-wrap">${String(p.body || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</div>`;
    const seg = segmentHtml(body);
    const tags = (p.tags || []).map(String);
    const all = [p.title, ...tags, ...seg.units]; // 0=제목, 1..=태그, 그 뒤=본문 조각
    const out = all.map((s) => (/[가-힣]/.test(s) ? null : s));
    state.set(p.id, { p, seg, tags, all, out, t0: Date.now() });
    let cur = [], chars = 0;
    all.forEach((s, i) => {
      if (out[i] !== null) return;
      if (cur.length && (cur.length >= BATCH_ITEMS || chars + s.length > BATCH_CHARS)) { jobs.push({ id: p.id, idx: cur }); cur = []; chars = 0; }
      cur.push(i); chars += s.length;
    });
    if (cur.length) jobs.push({ id: p.id, idx: cur });
  }
  console.log(`[translate] trend_posts: 조각 ${[...state.values()].reduce((n, s) => n + s.out.filter((x) => x === null).length, 0)}개 → 묶음 ${jobs.length}개`);
  let ji = 0;
  async function worker() {
    while (ji < jobs.length) {
      const k = ji++; const job = jobs[k]; const st = state.get(job.id);
      let idx = job.idx;
      for (let attempt = 1; attempt <= 3 && idx.length; attempt++) {
        const t0 = Date.now();
        try {
          const input = POST_RULES + `\n\nArticle title (for context): ${st.p.title}\n\nInput (JSON):\n` + JSON.stringify(idx.map((i) => ({ i, ko: st.all[i] })));
          const res = await runClaude(input);
          const got = new Map((res.items || []).map((x) => [x.i, x.en]));
          const bad = [];
          for (const i of idx) { const en = String(got.get(i) || '').trim(); const pr = check(st.all[i], en); if (pr) bad.push(`${i}:${pr}`); else st.out[i] = en; }
          console.log(`[translate] trend_posts 글 ${job.id} 묶음 ${k + 1}/${jobs.length} ${idx.length}개 → 저장 ${idx.length - bad.length}개 (${Math.round((Date.now() - t0) / 1000)}초)${bad.length ? ' 문제 ' + bad.join(' ') : ''}`);
          idx = idx.filter((i) => st.out[i] === null);
        } catch (e) { console.warn(`[translate] trend_posts 글 ${job.id} 묶음 ${k + 1} ${attempt}차 실패: ${e.message}`); }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  let done = 0, failed = 0;
  for (const st of state.values()) {
    if (st.out.some((x) => x === null)) { failed++; console.warn(`[translate] trend_posts 글 ${st.p.id}: 못 옮긴 조각 ${st.out.filter((x) => x === null).length}개 — 저장 안 함(다음 실행 때 다시)`); continue; }
    const nT = st.tags.length;
    cache[st.p.id] = {
      title: st.out[0], tags: st.out.slice(1, 1 + nT), body_html: joinHtml(st.seg.parts, st.out.slice(1 + nT)),
      created_at: st.p.created_at, src_hash: hashOf(st.p), translated_at: new Date().toISOString(),
      seconds: Math.round((Date.now() - st.t0) / 1000),
    };
    done++;
  }
  save();
  return { name: 'trend_posts', total: rows.length, done, failed };
}

// ---- 3. 실행 전 점검: 구독 로그인, 과금 환경변수 ----
for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) {
  if (process.env[k]) { console.error(`[translate] 과금 경로 환경변수 ${k} 가 있어 멈춤(구독 로그인만 씀)`); process.exit(2); }
}
if (!DRY) {
  try {
    const st = JSON.parse(execFileSync('claude', ['auth', 'status'], { env: claudeEnv(), encoding: 'utf8' }));
    if (!st.loggedIn || st.authMethod !== 'claude.ai') { console.error('[translate] claude.ai 구독 로그인이 아님 — 멈춤', st.authMethod); process.exit(2); }
    console.log(`[translate] 구독 로그인 확인: ${st.subscriptionType || ''}`);
  } catch (e) { console.error('[translate] claude auth status 확인 실패 — 멈춤:', e.message); process.exit(2); }
}
const t0 = Date.now();
const names = only.length ? only : [...Object.keys(GROUPS), 'trend_posts'];
const results = [];
for (const n of names) results.push(n === 'trend_posts' ? await translateTrendPosts() : await translateGroup(n));
console.log(`[translate] 끝(${Math.round((Date.now() - t0) / 1000)}초):`, results.map((r) => `${r.name} 원문${r.total}/새로${r.done}/실패${r.failed}`).join(' · '));
