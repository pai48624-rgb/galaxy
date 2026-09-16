// 공용 AI 툴 정보 조회 스크립트.
// galaxy_saas 페이지들은 각자 하드코딩된 CSV/데이터로 AI 툴 이름을 표시하는데,
// 이 스크립트는 그 이름 옆에 메인 사이트(Supabase ai_tools, 731개)에서 실제 가격/공식링크를
// 찾아서 붙여준다. 워크플로우 구조(다이어그램)는 각 페이지 그대로 두고, 메타정보만
// 한 곳(Supabase)에서 가져오는 절충안 — 새 툴이 DB에 들어오면 여기 페이지들도 자동 반영됨.
(function () {
  const ANON_KEY = "sb_publishable_MtDGFqdSWe09vUXg2ALtqw_5p1gZVCr";
  const SELECTOR = ".tool-name, .node-name";
  let toolsPromise = null;

  function normalize(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  }

  // 중첩된 배지(<span class="badge">...)는 제외하고, 요소 자신의 텍스트만 이름으로 본다.
  function directText(el) {
    let out = "";
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += n.textContent;
    });
    return (out.trim() || el.textContent || "").trim();
  }

  async function fetchTools() {
    if (!toolsPromise) {
      toolsPromise = fetch("/api/rest/v1/ai_tools?select=name,name_en,name_ko,url,pricing_policy,pricing", {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
    }
    return toolsPromise;
  }

  // 정확히 같은 이름을 최우선으로 확정하고, 부분일치(fuzzy)는 양쪽 다 5글자 이상일 때만
  // 허용한다. 4글자 이하 허용 시 "Opus Clip"이 DB의 범용 툴 "CLIP"(OpenAI 연구 모델)에,
  // "Morph Studio"가 "Udio"(음악 생성 툴, "studio"에 우연히 포함)에 잘못 매칭되는 걸
  // 실제로 확인해서 이렇게 제한함 — 틀린 링크를 보여주는 것보다 안 보여주는 게 낫다.
  function findExactOrFuzzy(tools, q) {
    if (!q || q.length < 2) return null;
    for (const t of tools) {
      for (const raw of [t.name, t.name_en, t.name_ko]) {
        if (normalize(raw) === q) return t;
      }
    }
    if (q.length < 5) return null;
    for (const t of tools) {
      for (const raw of [t.name, t.name_en, t.name_ko]) {
        const c = normalize(raw);
        if (c.length >= 5 && (c.includes(q) || q.includes(c))) return t;
      }
    }
    return null;
  }

  // "브루 (Vrew)"처럼 괄호로 병기된 이름, "챗GPT"/"Suno AI"처럼 흔한 접두/접미사가 붙은
  // 이름은 원문 그대로는 정확일치가 안 되지만, 괄호를 쪼개거나 접두/접미사를 떼면 DB의
  // 정확한 이름과 완전일치한다. 완전일치만 이렇게 넓히고(안전), 5글자 미만 부분일치는
  // 여전히 금지한다 — "CLIP"/"Udio" 같은 범용 단어 오매칭 위험은 그대로 차단된 채 유지.
  function candidateQueries(rawText) {
    const out = [];
    const seen = new Set();
    const push = (s) => {
      const n = normalize(s);
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    };
    const parenMatch = rawText.match(/\(([^)]*)\)/);
    const withoutParen = rawText.replace(/\([^)]*\)/g, " ").trim();

    push(rawText);
    push(withoutParen);
    if (parenMatch) push(parenMatch[1]);

    // 위에서 만든 후보들 각각에 대해 흔한 접두("챗"/"chat")·접미("ai") 제거판도 추가.
    for (const n of [...out]) {
      if (n.startsWith("chat") && n.length > 4) push(n.slice(4));
      if (n.startsWith("챗") && n.length > 1) push(n.slice(1));
      if (n.endsWith("ai") && n.length > 2) push(n.slice(0, -2));
    }
    return out;
  }

  function findBest(tools, rawText) {
    for (const q of candidateQueries(rawText)) {
      const hit = findExactOrFuzzy(tools, q);
      if (hit) return hit;
    }
    return null;
  }

  function badgeHTML(info) {
    const price = info.pricing_policy || info.pricing || "";
    const link = info.url
      ? `<a href="${info.url}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">🔗 공식사이트</a>`
      : "";
    if (!price && !link) return "";
    return (
      `<span class="galaxy-live-info" style="display:block;font-size:.72em;opacity:.8;margin-top:2px;font-weight:400;">` +
      (price ? `💰 ${price} ` : "") +
      link +
      `</span>`
    );
  }

  async function enrichAll(root) {
    const tools = await fetchTools();
    if (!tools.length) return;
    (root || document).querySelectorAll(SELECTOR).forEach((el) => {
      if (el.dataset.galaxyDone) return;
      el.dataset.galaxyDone = "1";
      const info = findBest(tools, directText(el));
      if (!info) return;
      const wrap = document.createElement("span");
      wrap.innerHTML = badgeHTML(info);
      if (wrap.firstChild) el.insertAdjacentElement("afterend", wrap.firstChild);
    });
  }

  function boot() {
    enrichAll(document);
    // 대부분의 페이지가 CSV를 늦게 파싱해서 DOM을 나중에 채우거나, 클릭/아코디언으로
    // 새 카드를 추가하므로 MutationObserver로 계속 감시함.
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) enrichAll(n);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.GalaxyTools = { enrichAll, findBest, fetchTools, normalize };
})();
