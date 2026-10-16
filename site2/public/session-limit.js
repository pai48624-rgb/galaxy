/* 로그인 자동 만료(2026-10-16 사용자: "우리 사이트 전부 로그인하면 혼자 로그아웃을 안 해 — 며칠째 자동 로그인, 큰 문제").
 * Supabase 로그인(네이버·구글·카카오)은 브라우저 저장소(sb-…-auth-token)에 남아 저절로 계속 갱신돼 끝없이 유지됨(무료 요금제는 서버에서 세션 시간 제한을 못 정함).
 * 이 조각이 페이지마다 먼저 돌며: 활동 없이 IDLE_MIN분 또는 로그인 뒤 MAX_HOURS시간이 지나면 저장된 로그인을 지워 로그아웃시킨다.
 * 로그인 시각은 Supabase가 저장한 user.last_sign_in_at 을 씀 → 이미 며칠째 켜진 로그인도 다음 방문에 바로 만료.
 * 원본: C:\dev\20_modules\session_limit\session-limit.js — 사이트마다 복사해 씀(galaxy site2/public, korea_mfg_map auth.js 맨 앞). 숫자는 아래 두 줄만 고치면 됨. */
(function () {
  var IDLE_MIN = 120, MAX_HOURS = 24;
  var IDLE = IDLE_MIN * 60e3, MAX = MAX_HOURS * 3600e3, LAST = "gxs_last";
  function tokenKeys() {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^sb-.+-auth-token$/.test(k)) out.push(k); } } catch (e) {}
    return out;
  }
  function loginAt(k) {
    try {
      var v = JSON.parse(localStorage.getItem(k) || "null");
      var u = v && (v.user || (v.currentSession && v.currentSession.user));
      var t = u && Date.parse(u.last_sign_in_at || u.created_at || "");
      return isNaN(t) ? 0 : t;
    } catch (e) { return 0; }
  }
  function expire(ks) {
    try { ks.forEach(function (k) { localStorage.removeItem(k); }); localStorage.removeItem(LAST); } catch (e) {}
    if (window.__sessionExpired) return;
    window.__sessionExpired = true;
    if (document.readyState !== "loading") location.reload(); // 보고 있던 화면은 로그아웃 상태로 다시 그림
  }
  function check() {
    var ks = tokenKeys();
    if (!ks.length) { try { localStorage.removeItem(LAST); } catch (e) {} return; }
    var now = Date.now(), last = 0, login = 0;
    try { last = +localStorage.getItem(LAST) || 0; } catch (e) {}
    ks.forEach(function (k) { login = Math.max(login, loginAt(k)); });
    if (login > last) { last = now; try { localStorage.setItem(LAST, String(now)); } catch (e) {} } // 새로 로그인했으면 활동 시각도 새로
    if ((login && now - login > MAX) || (last && now - last > IDLE)) return expire(ks);
    if (!last) try { localStorage.setItem(LAST, String(now)); } catch (e) {}
  }
  function touch() { if (tokenKeys().length) try { localStorage.setItem(LAST, String(Date.now())); } catch (e) {} }
  check();
  var t = 0;
  ["click", "keydown", "scroll", "touchstart", "mousemove"].forEach(function (ev) {
    addEventListener(ev, function () { var n = Date.now(); if (n - t > 30e3) { t = n; check(); touch(); } }, { passive: true });
  });
  setInterval(check, 60e3);
  addEventListener("storage", function (e) { if (e.key && /^sb-.+-auth-token$/.test(e.key) && e.newValue) touch(); }); // 다른 탭에서 새로 로그인하면 시각 갱신
})();
