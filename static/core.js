/**
 * core.js — 로또 스틸의 법칙: 공용 프론트엔드 로직
 * =================================================
 * 설계 원칙:
 *   1) "순수 로직"(입력 -> 출력만 있고 DOM/localStorage/alert 등 부작용이 없는 함수)과
 *      "DOM 래퍼"(실제 브라우저 API를 건드리는 함수)를 명확히 분리한다.
 *      -> 순수 로직만 Node.js 단위테스트로 검증 가능 (tests/test_core.js 참고)
 *   2) 이전에 템플릿(base.html)에 인라인으로 넣었다가 </script> 위치 실수로
 *      여러 번 전체 기능이 깨졌던 사고가 있어서, 이 파일은 항상 "그 자체로 문법이
 *      완결된 하나의 .js 파일"로 관리한다. HTML/Jinja와 절대 섞지 않는다.
 *   3) 브라우저(<script> 태그)와 Node.js(require) 양쪽에서 동일 코드를 쓸 수 있도록
 *      UMD 패턴으로 내보낸다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LottoCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ===========================================================================
  // 1. 순수 로직 (Pure functions) — 단위테스트 대상
  // ===========================================================================

  const DAILY_FREE_LIMIT = 5;
  const REFILL_AMOUNT = 5;
  const MAX_REFILLS_PER_DAY = 3;

  /** 오늘 날짜로 localStorage 키를 만든다. Date 객체를 주입받아 테스트 시 날짜를 고정할 수 있다. */
  function dateKey(prefix, date) {
    const d = date || new Date();
    return `${prefix}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /** 리필 횟수에 따른 오늘의 총 한도. */
  function computeEffectiveLimit(refillsUsed) {
    return DAILY_FREE_LIMIT + refillsUsed * REFILL_AMOUNT;
  }

  /** 오늘 남은 생성 가능 횟수 (0 미만으로 내려가지 않음). */
  function computeRemaining(usedCount, refillsUsed) {
    return Math.max(0, computeEffectiveLimit(refillsUsed) - usedCount);
  }

  /**
   * 생성 버튼을 눌렀을 때 다음에 뭘 해야 하는지 "판단만" 하는 순수함수.
   * 실제 confirm()/alert() 호출이나 localStorage 기록은 이 함수 밖(guardGenerate)에서 한다.
   *
   * 반환값:
   *   { action: "allow", nextUsed }                         → 바로 생성 가능
   *   { action: "offer_ad", refillsLeft }                   → 광고 보고 리필할지 물어봐야 함
   *   { action: "blocked" }                                 → 오늘은 더 못 함
   */
  function decideGenerateAction(usedCount, refillsUsed) {
    const remaining = computeRemaining(usedCount, refillsUsed);
    if (remaining > 0) {
      return { action: "allow", nextUsed: usedCount + 1 };
    }
    if (refillsUsed < MAX_REFILLS_PER_DAY) {
      return { action: "offer_ad", refillsLeft: MAX_REFILLS_PER_DAY - refillsUsed };
    }
    return { action: "blocked" };
  }

  /** 광고 시청(플레이스홀더)에 동의했을 때 다음 상태를 계산. */
  function applyRefill(usedCount, refillsUsed) {
    return { nextUsed: usedCount + 1, nextRefills: refillsUsed + 1 };
  }

  /** 남은횟수 라벨에 표시할 텍스트를 만든다 (DOM에 안 넣고 문자열만 반환 → 테스트 용이). */
  function formatRemainingLabel(usedCount, refillsUsed) {
    const remaining = computeRemaining(usedCount, refillsUsed);
    const limit = computeEffectiveLimit(refillsUsed);
    let text = `오늘 남은 무료 생성: ${remaining}/${limit}회`;
    if (refillsUsed > 0) {
      text += ` (광고 리필 ${refillsUsed}/${MAX_REFILLS_PER_DAY} 사용)`;
    }
    return text;
  }

  /**
   * 사용자 6개 번호 vs 당첨결과로 등수를 계산 (algorithm.py의 calc_rank와 동일 규칙).
   * 프론트엔드(QR 확인 화면)에서도 서버 왕복 없이 즉시 판정이 필요해서 동일 로직을 둔다.
   * ⚠️ 서버(algorithm.calc_rank)와 이 함수는 반드시 같은 규칙을 유지해야 하며,
   *    한쪽만 고치면 판정 불일치가 생기니 항상 같이 수정한다 (tests/test_core.js에서
   *    서버 쪽 테스트 케이스와 동일한 픽스처를 공유하도록 주석으로 표시해둠).
   */
  function calcRank(userNumbers, winningNumbers, bonus) {
    const winSet = new Set(winningNumbers);
    const userSet = new Set(userNumbers);
    let match = 0;
    userSet.forEach((n) => { if (winSet.has(n)) match += 1; });
    const bonusMatched = userSet.has(bonus);

    let rank = 0;
    if (match === 6) rank = 1;
    else if (match === 5 && bonusMatched) rank = 2;
    else if (match === 5) rank = 3;
    else if (match === 4) rank = 4;
    else if (match === 3) rank = 5;

    const labels = { 0: "낙첨", 1: "1등", 2: "2등", 3: "3등", 4: "4등", 5: "5등" };
    return { rank, rankLabel: labels[rank], matchCount: match, bonusMatched };
  }

  /**
   * QR 원문 텍스트에서 회차/번호를 최선의 추정으로 파싱 (app.py의 api_qr_parse와 동일 규칙).
   * 동행복권 QR 정확한 스펙이 비공개라 "회차4자리 + 게임당12자리" 패턴으로 추정 파싱한다.
   */
  function parseQrText(rawText) {
    if (!rawText) return { parsed: false, drawNo: null, games: [] };

    const match = /[?&]v=([0-9qQ]+)/i.exec(rawText);
    const payload = match ? match[1] : rawText;
    const digitsAndQ = payload.replace(/[^0-9qQ]/g, "");
    let parts = digitsAndQ.split("q").filter(Boolean);

    if (parts.length === 0) return { parsed: false, drawNo: null, games: [] };

    let drawNo = null;
    const first = parts[0];
    if (first.length >= 4 && /^\d{4}/.test(first)) {
      drawNo = parseInt(first.slice(0, 4), 10);
      const rest = first.slice(4);
      parts = rest ? [rest, ...parts.slice(1)] : parts.slice(1);
    }

    const games = [];
    parts.forEach((p) => {
      if (p.length === 12 && /^\d+$/.test(p)) {
        const nums = [];
        for (let i = 0; i < 12; i += 2) nums.push(parseInt(p.slice(i, i + 2), 10));
        const inRange = nums.every((n) => n >= 1 && n <= 45);
        const unique = new Set(nums).size === 6;
        if (inRange && unique) games.push(nums.slice().sort((a, b) => a - b));
      }
    });

    return { parsed: Boolean(drawNo && games.length), drawNo, games };
  }

  // ===========================================================================
  // 2. DOM 래퍼 (브라우저에서만 동작, Node 테스트 대상 아님)
  // ===========================================================================

  function showToast(msg) {
    if (typeof document === "undefined") return;
    let t = document.getElementById("_toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "_toast";
      t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);"
        + "background:rgba(20,20,20,0.92);color:#fff;padding:11px 20px;border-radius:999px;"
        + "font-size:13px;z-index:9999;transition:opacity .3s;box-shadow:0 4px 16px rgba(0,0,0,0.3);"
        + "max-width:90vw;text-align:center;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => { t.style.opacity = "0"; }, 3200);
  }

  function getUsedGenerateCount() {
    return parseInt(localStorage.getItem(dateKey("genUsed")) || "0", 10);
  }
  function getRefillsUsed() {
    return parseInt(localStorage.getItem(dateKey("genRefills")) || "0", 10);
  }
  function getRemainingGenerates() {
    return computeRemaining(getUsedGenerateCount(), getRefillsUsed());
  }
  function recordGenerate() {
    localStorage.setItem(dateKey("genUsed"), String(getUsedGenerateCount() + 1));
  }

  /** 생성 버튼 핸들러 맨 앞에서 호출. true면 진행, false면 중단. */
  function guardGenerate() {
    const decision = decideGenerateAction(getUsedGenerateCount(), getRefillsUsed());

    if (decision.action === "allow") {
      recordGenerate();
      return true;
    }

    if (decision.action === "offer_ad") {
      const wantsAd = confirm(
        `오늘의 무료 생성 횟수를 다 썼어요!\n\n`
        + `🎬 30초 광고를 보면 ${REFILL_AMOUNT}번 더 뽑을 수 있어요. (오늘 ${decision.refillsLeft}번 더 가능)\n\n`
        + `[확인]을 누르면 광고 시청 후 바로 잠금 해제됩니다.\n`
        + `(데모 버전이라 지금은 광고 없이 바로 열려요 — 실제 광고 SDK 연결 예정 지점)`
      );
      if (wantsAd) {
        const { nextRefills } = applyRefill(getUsedGenerateCount(), getRefillsUsed());
        localStorage.setItem(dateKey("genRefills"), String(nextRefills));
        recordGenerate();
        showToast(`🎬 광고 시청 완료! ${REFILL_AMOUNT}번 추가 생성 가능해요`);
        return true;
      }
      return false;
    }

    alert(
      `오늘 가능한 생성 횟수(무료 ${DAILY_FREE_LIMIT}회 + 광고 리필 ${MAX_REFILLS_PER_DAY}회)를 `
      + `모두 사용했어요!\n내일 다시 초기화됩니다.`
    );
    return false;
  }

  function renderRemainingLabel(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = formatRemainingLabel(getUsedGenerateCount(), getRefillsUsed());
  }

  function shareNumbers(numbers, label) {
    const text = `${label ? label + "\n" : ""}🎱 로또 스틸의 법칙에서 뽑은 번호\n${numbers.join(", ")}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast("📋 복사 완료! 공유창이 비어있으면 대화창에 붙여넣기 해주세요"),
        () => showToast("복사에 실패했어요. 아래 창에서 직접 복사해주세요.")
      );
    }

    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else if (!navigator.clipboard) {
      window.prompt("아래 문구를 복사해서 공유해주세요:", text);
    }
  }

  function shareToKakao(numbers, label) {
    if (!(window.Kakao && Kakao.isInitialized())) {
      showToast("카카오 공유가 아직 설정되지 않았어요. README를 참고해 카카오 키를 등록해주세요.");
      return;
    }
    const text = `${label ? label + "\n" : ""}🎱 로또 스틸의 법칙에서 뽑은 번호\n${numbers.join(", ")}`;
    Kakao.Share.sendDefault({
      objectType: "text",
      text: text,
      link: { mobileWebUrl: location.origin, webUrl: location.origin },
    });
  }

  function showInterstitialPlaceholder(onClose) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;"
      + "display:flex;align-items:center;justify-content:center;padding:20px;";
    overlay.innerHTML = `
      <div style="background:#1f1f1f;border-radius:20px;padding:32px 24px;text-align:center;max-width:320px;color:#fff;">
        <p style="font-size:11px;color:#888;margin-bottom:10px;letter-spacing:.05em;">AD PLACEHOLDER</p>
        <p style="font-size:17px;font-weight:800;margin-bottom:10px;">📺 광고 영역 (준비 중)</p>
        <p style="font-size:12px;color:#aaa;margin-bottom:22px;line-height:1.5;">
          실제 서비스에서는 이 자리에 전면 광고가 표시됩니다.
        </p>
        <button id="_interstitial-close" disabled
          style="background:#4b5563;color:#fff;border:none;padding:10px 26px;border-radius:999px;font-weight:700;font-size:13px;">
          3초 후 닫기 가능
        </button>
      </div>`;
    document.body.appendChild(overlay);

    const btn = overlay.querySelector("#_interstitial-close");
    let count = 3;
    const timer = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(timer);
        btn.textContent = "닫기 ✕";
        btn.style.background = "#6366f1";
        btn.disabled = false;
      } else {
        btn.textContent = `${count}초 후 닫기 가능`;
      }
    }, 1000);

    btn.addEventListener("click", () => {
      document.body.removeChild(overlay);
      if (onClose) onClose();
    });
  }

  function initCrossTabSync() {
    if (typeof window === "undefined") return;
    window.addEventListener("storage", (e) => {
      if (!e.key) return;
      if (!e.key.startsWith("genUsed") && !e.key.startsWith("genRefills")) return;
      ["remaining-label", "borrow-remaining-label", "self-remaining-label"].forEach((id) => {
        if (document.getElementById(id)) renderRemainingLabel(id);
      });
    });
  }

  // ===========================================================================
  // 3. 외부로 내보내는 것들
  // ===========================================================================
  return {
    // 상수
    DAILY_FREE_LIMIT,
    REFILL_AMOUNT,
    MAX_REFILLS_PER_DAY,
    // 순수 로직 (테스트 대상)
    dateKey,
    computeEffectiveLimit,
    computeRemaining,
    decideGenerateAction,
    applyRefill,
    formatRemainingLabel,
    calcRank,
    parseQrText,
    // DOM 래퍼
    showToast,
    getUsedGenerateCount,
    getRefillsUsed,
    getRemainingGenerates,
    recordGenerate,
    guardGenerate,
    renderRemainingLabel,
    shareNumbers,
    shareToKakao,
    showInterstitialPlaceholder,
    initCrossTabSync,
  };
});
