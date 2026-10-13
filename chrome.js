// 공통 껍데기 보조(2026-10-13/14): ① 최신 AI 트렌드 글로 "이번 주 신호" 띠·최신 글 칸·옆칸 목록 채움
// ② 언어 선택(한국어/English)을 모든 화면에서 기억(localStorage galaxyLang, 3D 앱과 같은 키) — 영어를 고르면 다른 메뉴로 가도 메뉴 글자가 영어로 유지됨.
(function () {
  function cut(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function getLang() { try { return localStorage.getItem("galaxyLang") || ""; } catch (e) { return ""; } }
  function setLang(l) { try { localStorage.setItem("galaxyLang", l); } catch (e) {} }
  var isMap = !!document.querySelector(".site-chrome .mast #topbarAuth") || /^\/map\//.test(location.pathname);
  var pageLang = document.documentElement.lang === "en" ? "en" : "ko";

  // 언어 글자 바꾸기(지도 화면은 자기 스크립트가 처리)
  function applyLang(l) {
    document.querySelectorAll(".site-chrome [data-en], .mast [data-en], .menu [data-en], #ticker [data-en]").forEach(function (e) {
      var v = e.getAttribute(l === "en" ? "data-en" : "data-ko"); if (v == null) return;
      if (e.tagName === "INPUT") e.placeholder = v;
      else if (e.querySelector("i")) e.innerHTML = '<i class="' + e.querySelector("i").className + '">✦</i> ' + v.replace("✦", "").trim();
      else e.textContent = v;
    });
    document.querySelectorAll(".langbar a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-lang") === l); });
  }
  if (!isMap) {
    var stored = getLang();
    if (!stored) setLang(pageLang);
    else if (stored !== pageLang) applyLang(stored);   // 영어 페이지가 없는 글(트렌드·AI 목록 등)은 내용은 한국어, 메뉴·띠는 고른 언어로
    document.querySelectorAll(".langbar a").forEach(function (a) {
      a.addEventListener("click", function () { setLang(a.getAttribute("data-lang")); });  // 이동은 href 그대로(같은 글의 한/영판 또는 홈)
    });
  }

  var corner = ["궤도 안내", "별 대 별", "성단 순위표", "관측 일지", "초보 항해사 안내", "수신된 신호", "신규 발견 별", "사라진 별", "항로 추천", "항해 기록", "신호 해독", "출항 전 점검표"];
  function tagOf(p) { var t = (p.tags || []).filter(function (x) { return corner.indexOf(x) >= 0; }); return t[0] || (p.tags || [])[0] || "AI 트렌드"; }
  fetch("/api/trend/latest", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.posts || !d.posts.length) return;
    var posts = d.posts, here = location.pathname.match(/^\/trend\/(\d+)/);
    var t = document.getElementById("ticker");
    if (t) { var b = t.querySelector("b"); t.innerHTML = (b ? b.outerHTML : "<b>이번 주 신호</b>") + posts.slice(0, 5).map(function (p) { return '<a href="/trend/' + p.id + '">' + esc(cut(p.title, 24)) + "</a>"; }).join(""); }
    var g = document.querySelector("[data-latest]");
    if (g) g.innerHTML = posts.slice(0, 6).map(function (p) {
      return '<a class="art" href="/trend/' + p.id + '"><div class="th"><i class="star">✦</i></div><span class="cat">' + esc(tagOf(p)) + '</span><h3 class="serif">' + esc(p.title) + "</h3><p>" + esc(cut(p.summary, 70)) + "</p></a>";
    }).join("");
    var l = document.querySelector("[data-latest-list]");
    if (l) l.innerHTML = posts.filter(function (p) { return !here || String(p.id) !== here[1]; }).slice(0, 6).map(function (p) { return '<li><a href="/trend/' + p.id + '">' + esc(p.title) + "</a></li>"; }).join("");
    var c = document.querySelector("[data-count-trend]"); if (c) c.textContent = d.total || posts.length;
  }).catch(function () {});
})();
