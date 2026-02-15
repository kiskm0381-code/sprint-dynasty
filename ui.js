// ui.js (改良5)
// 画面切替 + 練習UI + モーダル + ENDオーバーレイ
// 追加：
// - hero_portrait をHOME枠いっぱいに比率維持で表示（pixelated）
// - 練習演出をフルスクリーン表示
// - 休息時に「キャラ紹介」風のフルスクリーン演出

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

  // ----------------------------
  // Ensure overlay panels exist (DOMを動的生成してHTML改修を不要にする)
  // ----------------------------
  function ensureRunScenePanel() {
    let panel = $("runScenePanel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "runScenePanel";
    panel.hidden = true;
    panel.style.display = "none";
    panel.style.position = "fixed";
    panel.style.inset = "0";
    panel.style.zIndex = "99999";
    panel.style.background = "rgba(235,240,255,1)";
    panel.style.overflow = "hidden";

    panel.innerHTML = `
      <div style="position:absolute; inset:0; display:flex; flex-direction:column;">
        <div style="padding:14px 16px; font-weight:700;">
          <div id="sceneCaption" style="font-size:16px; opacity:0.95;"></div>
          <div id="runSceneText" style="margin-top:6px; font-size:13px; opacity:0.80;"></div>
        </div>
        <div style="flex:1; position:relative;">
          <canvas id="sceneCanvas" width="900" height="520"
            style="position:absolute; inset:0; width:100%; height:100%; image-rendering: pixelated;"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function ensureRestScenePanel() {
    let panel = $("restScenePanel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "restScenePanel";
    panel.hidden = true;
    panel.style.display = "none";
    panel.style.position = "fixed";
    panel.style.inset = "0";
    panel.style.zIndex = "99999";
    panel.style.background = "rgba(0,0,0,0.92)";
    panel.style.color = "#fff";
    panel.style.overflow = "hidden";

    panel.innerHTML = `
      <div style="position:absolute; inset:0; display:flex; align-items:flex-start; gap:16px; padding:18px;">
        <div style="width:96px; height:96px; background:#666; border:2px solid rgba(255,255,255,0.25); display:flex; align-items:center; justify-content:center;">
          <img id="restCharImg" alt="char" style="max-width:100%; max-height:100%; image-rendering:pixelated;">
        </div>
        <div style="flex:1;">
          <div id="restTitle" style="font-weight:800; font-size:16px; margin-bottom:10px;"></div>
          <div id="restBody" style="white-space:pre-wrap; font-size:13px; line-height:1.55; opacity:0.92;"></div>
          <div style="margin-top:14px; font-size:12px; opacity:0.70;">（休息中…）</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function resizeSceneCanvas() {
    const canvas = $("sceneCanvas");
    if (!canvas) return;
    // CSSで100%にしているので、描画解像度だけ整える（端末のDPR対応）
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
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
      const active =
        (name === "home" && key === "home") ||
        (name === "practice" && key === "practice") ||
        (name === "settings" && key === "settings");
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
    const termLabel =
      turn.termLabel || (turn.term === 1 ? "上旬" : turn.term === 2 ? "中旬" : "下旬");
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
    // runScenePanelを動的生成する場合に備え、idを必ず使う
    const el = $("sceneCaption");
    if (el) el.textContent = text || "";
  }

  function setRunSceneText(text) {
    const el = $("runSceneText");
    if (el) el.textContent = text || "";
  }

  // ---- HERO PORTRAIT（HOME左の枠）----
  function setHeroPortrait(src) {
    // 可能性1: idで用意されている
    let img = $("heroPortrait");

    // 可能性2: HEROカード内のimg（既存DOMを壊さず拾う）
    if (!img) {
      img = document.querySelector(".hero-card img") || document.querySelector("#viewHome img");
    }
    if (!img) return;

    if (src) img.src = src;

    // 枠いっぱい＆比率維持＆ドット感
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain"; // 縦長歪み防止
    img.style.imageRendering = "pixelated";
    img.style.display = "block";
    img.style.background = "transparent";
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
    list.innerHTML = arr
      .map((m, idx) => {
        const name = m.name || `部員${idx + 1}`;
        const grade = m.grade ? `${m.grade}年` : "";
        const rarity = m.rarity === "rare" ? "レア" : "通常";
        const tag = m.tag || "";
        const pow = Number.isFinite(m.pow) ? m.pow : 0;
        return `
          <div class="member">
            <div class="avatar">${idx + 1}</div>
            <div class="meta">
              <div class="name">${name}</div>
              <div class="sub">${grade} / ${rarity}${tag ? " / " + tag : ""}</div>
            </div>
            <div class="pow">${pow}</div>
          </div>
        `;
      })
      .join("");

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
      const tags = (item.tags || []).map((t) => `<span class="tag">${t}</span>`).join("");
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

  // ---- run scene panel (FULLSCREEN) ----
  function showRunScene() {
    const panel = ensureRunScenePanel();
    forceShow(panel, "block");
    resizeSceneCanvas();
    // 画面回転・リサイズ対応
    window.addEventListener("resize", resizeSceneCanvas, { passive: true });
  }
  function hideRunScene() {
    const panel = ensureRunScenePanel();
    forceHide(panel);
    window.removeEventListener("resize", resizeSceneCanvas);
  }

  // ---- rest scene (FULLSCREEN) ----
  function showRestScene({ title, body, imgSrc }) {
    const panel = ensureRestScenePanel();
    const t = $("restTitle");
    const b = $("restBody");
    const img = $("restCharImg");
    if (t) t.textContent = title || "休息";
    if (b) b.textContent = body || "";
    if (img && imgSrc) img.src = imgSrc;
    if (img) img.style.imageRendering = "pixelated";
    forceShow(panel, "block");
  }
  function hideRestScene() {
    const panel = ensureRestScenePanel();
    forceHide(panel);
  }

  // backdrop click closes modal (safety)
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

    // hero
    setHeroPortrait,

    // text
    setPlayerName,
    setHeroMeta,
    setTurnText,
    setNextMeet,
    setCoachLine,
    setAtmosphereText,
    setSceneCaption,
    setRunSceneText,

    // render
    renderStats,
    renderTeam,

    // practice
    renderPracticeLists,
    getSelectedPracticeIds,
    clearPracticeChecks,

    // run scene
    showRunScene,
    hideRunScene,

    // rest scene
    showRestScene,
    hideRestScene,
  };
})();
