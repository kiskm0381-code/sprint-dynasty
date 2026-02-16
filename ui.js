// ui.js (改良5)
// 画面切替 + 練習UI + モーダル + ENDオーバーレイ
// + フルスクリーン演出（練習/休息/勧誘）対応

(function () {
  const $ = (id) => document.getElementById(id);

  function forceShow(el, display = "flex") {
    if (!el) return;
    el.hidden = false;
    el.style.display = display;
    el.classList.add("is-open");
    el.setAttribute("aria-hidden", "false");
  }

  function forceHide(el) {
    if (!el) return;
    el.hidden = true;
    el.style.display = "none";
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
  }

  // ---- views ----
  function setActiveView(name) {
    const views = {
      home: $("viewHome"),
      practice: $("viewPractice"),
      settings: $("viewSettings"),
    };
    Object.entries(views).forEach(([k, el]) => {
      if (!el) return;
      el.classList.toggle("is-active", k === name);
    });

    const tabs = document.querySelectorAll(".tabbar .tab");
    tabs.forEach((t) => {
      const key = t.getAttribute("data-tab");
      const active = (name === "home" && key === "home")
        || (name === "practice" && key === "practice")
        || (name === "settings" && key === "settings");
      t.classList.toggle("is-active", !!active);
    });
  }

  // ---- modal ----
  function openNameModal() {
    const back = $("nameModalBackdrop");
    const input = $("nameInput");
    forceShow(back, "flex");
    setTimeout(() => {
      if (input) {
        input.focus();
        if (input.select) input.select();
      }
    }, 0);
  }

  function closeNameModal() {
    const back = $("nameModalBackdrop");
    const input = $("nameInput");
    forceHide(back);
    if (input) input.blur();
  }

  // ---- end overlay ----
  function showEndOverlay() {
    forceShow($("endOverlay"), "flex");
  }
  function hideEndOverlay() {
    forceHide($("endOverlay"));
  }

  // ---- text updates ----
  function setPlayerName(name) {
    const el = $("playerNameText");
    if (el) el.textContent = name || "（未設定）";
  }

  function setHeroMeta(text) {
    const el = $("heroMetaText");
    if (el) el.textContent = text || "";
  }

  function setTurnText(turn) {
    const el = $("turnBadge");
    if (!el || !turn) return;
    const termLabel = turn.termLabel || (turn.term === 1 ? "上旬" : turn.term === 2 ? "中旬" : "下旬");
    el.textContent = `${turn.grade}年 ${turn.month}月 ${termLabel}`;
  }

  function setNextMeet(text) {
    const el = $("nextMeetText");
    if (el) el.textContent = text || "";
  }

  function setCoachLine(text) {
    const el = $("coachLine");
    if (el) el.textContent = text || "";
  }

  function setAtmosphereText(text) {
    const el = $("atmosphereText");
    if (el) el.textContent = text || "";
  }

  function setSceneCaption(text) {
    const el = $("sceneCaption");
    if (el) el.textContent = text || "";
  }

  function setRunSceneText(text) {
    const el = $("runSceneText");
    if (el) el.textContent = text || "";
  }

  function setOverlayHTML(html) {
    // runSceneText を “本文領域” として使う（HTML許可）
    const el = $("runSceneText");
    if (!el) return;
    el.innerHTML = html || "";
  }

  // ---- stats ----
  function renderStats(player) {
    const grid = $("statsGrid");
    if (!grid || !player) return;

    const stats = player.stats || {};
    const rows = [
      ["スピード", stats.SPD],
      ["加速", stats.ACC],
      ["パワー", stats.POW],
      ["技術", stats.TEC],
      ["持久力", stats.STA],
      ["メンタル", stats.MEN],
    ];

    grid.innerHTML = rows
      .map(([k, v]) => {
        const val = Number.isFinite(v) ? v : 0;
        const pct = Math.max(0, Math.min(100, val));
        return `
          <div class="stat-row">
            <div class="stat-key">${k}</div>
            <div class="stat-bar"><div class="stat-fill" style="width:${pct}%"></div></div>
            <div class="stat-val">${val}</div>
          </div>
        `;
      })
      .join("");

    const f = Math.max(0, Math.min(100, Math.round(player.fatigue ?? 0)));
    const fv = $("fatigueValue");
    const fb = $("fatigueBar");
    if (fv) fv.textContent = String(f);
    if (fb) fb.style.width = `${f}%`;

    const inj = $("injuryText");
    if (inj) inj.textContent = `${player.injuryCount ?? 0} / 3`;
  }

  function renderTeam(team) {
    const list = $("teamList");
    if (!list) return;

    const arr = Array.isArray(team) ? team : [];
    const SLOT = 8;

    // 8枠固定表示（不足分は空枠）
    const rows = [];
    for (let i = 0; i < SLOT; i++) {
      const m = arr[i] || null;

      if (!m) {
        rows.push(`
          <div class="member is-empty">
            <div class="avatar">${i + 1}</div>
            <div class="meta">
              <div class="name">（空き）</div>
              <div class="sub">勧誘で部員を増やせる</div>
            </div>
            <div class="pow">-</div>
          </div>
        `);
        continue;
      }

      const name = m.name || `部員${i + 1}`;
      const grade = m.grade ? `${m.grade}年` : "";
      const rarity = m.rarity === "rare" ? "レア" : "通常";
      const tag = m.tag || "";
      const pow = Number.isFinite(m.pow) ? m.pow : 0;

      rows.push(`
        <div class="member">
          <div class="avatar">${i + 1}</div>
          <div class="meta">
            <div class="name">${name}</div>
            <div class="sub">${grade} / ${rarity}${tag ? " / " + tag : ""}</div>
          </div>
          <div class="pow">${pow}</div>
        </div>
      `);
    }

    list.innerHTML = rows.join("");

    const total = arr.reduce((acc, m) => acc + (Number.isFinite(m.pow) ? m.pow : 0), 0);
    const tp = $("teamPowerText");
    if (tp) tp.textContent = `${total}`;
  }

  // ---- practice list ----
  function renderPracticeLists(defTeam, defSolo) {
    const teamList = $("teamPracticeList");
    const soloList = $("soloPracticeList");
    if (!teamList || !soloList) return;

    function itemHTML(item) {
      const tags = (item.tags || []).map(t => `<span class="tag">${t}</span>`).join("");
      return `
        <label class="practice-item">
          <input type="checkbox" data-practice-id="${item.id}">
          <div class="practice-main">
            <div class="practice-name">${item.name}</div>
            <div class="practice-desc">${item.desc}</div>
            <div class="practice-tags">${tags}</div>
          </div>
        </label>
      `;
    }

    teamList.innerHTML = (defTeam || []).map(itemHTML).join("");
    soloList.innerHTML = (defSolo || []).map(itemHTML).join("");
  }

  function getSelectedPracticeIds() {
    const checks = document.querySelectorAll('input[type="checkbox"][data-practice-id]');
    const ids = [];
    checks.forEach((c) => {
      if (c.checked) ids.push(c.getAttribute("data-practice-id"));
    });
    return ids.filter(Boolean);
  }

  function clearPracticeChecks() {
    const checks = document.querySelectorAll('input[type="checkbox"][data-practice-id]');
    checks.forEach((c) => (c.checked = false));
  }

  // ---- overlay (runScenePanel) ----
  function showFullscreenOverlay() {
    const panel = $("runScenePanel");
    forceShow(panel, "block");

    // フルスクリーン化（CSSを触らずにJSで固定）
    panel.style.position = "fixed";
    panel.style.left = "0";
    panel.style.top = "0";
    panel.style.right = "0";
    panel.style.bottom = "0";
    panel.style.zIndex = "99999";
    panel.style.background = "rgba(0,0,0,0.72)";
    panel.style.padding = "16px";
    panel.style.overflow = "auto";
  }

  function hideFullscreenOverlay() {
    const panel = $("runScenePanel");
    forceHide(panel);

    if (panel) {
      panel.style.position = "";
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
      panel.style.zIndex = "";
      panel.style.background = "";
      panel.style.padding = "";
      panel.style.overflow = "";
    }
  }

  function ensureSceneFits() {
    const canvas = $("sceneCanvas");
    if (!canvas) return;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "55vh";
    canvas.style.maxHeight = "420px";
    canvas.style.background = "transparent";
    canvas.style.borderRadius = "12px";

    // game.js 側の scene.fitToViewport があれば使う
    if (window.SD_SCENE && window.SD_SCENE.fitToViewport) {
      window.SD_SCENE.fitToViewport();
    } else {
      // 最低限
      const w = Math.max(320, window.innerWidth || 360);
      const h = Math.max(520, window.innerHeight || 640);
      canvas.width = w;
      canvas.height = h;
    }
  }

  // 旧名互換（残しておく）
  function showRunScene() { showFullscreenOverlay(); }
  function hideRunScene() { hideFullscreenOverlay(); }

  // backdrop click closes modal
  document.addEventListener("click", (e) => {
    const back = $("nameModalBackdrop");
    if (!back) return;
    if (e.target === back) closeNameModal();
  });

  window.SD_UI = {
    // view
    setActiveView,

    // modal
    openNameModal,
    closeNameModal,

    // end overlay
    showEndOverlay,
    hideEndOverlay,

    // text
    setPlayerName,
    setHeroMeta,
    setTurnText,
    setNextMeet,
    setCoachLine,
    setAtmosphereText,
    setSceneCaption,
    setRunSceneText,
    setOverlayHTML,

    // render
    renderStats,
    renderTeam,

    // practice
    renderPracticeLists,
    getSelectedPracticeIds,
    clearPracticeChecks,

    // overlay
    showFullscreenOverlay,
    hideFullscreenOverlay,
    ensureSceneFits,

    // compat
    showRunScene,
    hideRunScene,
  };
})();
