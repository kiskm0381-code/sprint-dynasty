// ui.js (改良7)
// - 練習/休息/勧誘をフルスクリーン演出として統一（HTML改修不要：DOM生成）
// - 勧誘タブのハイライト対応
// - HERO画像は枠いっぱい＆比率維持（歪み防止）

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
  // Panels (DOM生成)
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
        <div style="padding:14px 16px; font-weight:800;">
          <div id="sceneCaption" style="font-size:16px; opacity:0.95;"></div>
          <div id="runSceneText" style="margin-top:6px; font-size:13px; opacity:0.80;"></div>
        </div>
        <div style="flex:1; position:relative;">
          <canvas id="sceneCanvas"
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
        <div style="width:110px; height:110px; background:#666; border:2px solid rgba(255,255,255,0.25); display:flex; align-items:center; justify-content:center;">
          <img id="restCharImg" alt="char" style="max-width:100%; max-height:100%; image-rendering:pixelated;">
        </div>
        <div style="flex:1;">
          <div id="restTitle" style="font-weight:900; font-size:16px; margin-bottom:10px;"></div>
          <div id="restBody" style="white-space:pre-wrap; font-size:13px; line-height:1.55; opacity:0.92;"></div>
          <div style="margin-top:14px; font-size:12px; opacity:0.70;">（休息中…）</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function ensureRecruitPanel() {
    let panel = $("recruitPanel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "recruitPanel";
    panel.hidden = true;
    panel.style.display = "none";
    panel.style.position = "fixed";
    panel.style.inset = "0";
    panel.style.zIndex = "99999";
    panel.style.background = "rgba(245,248,255,1)";
    panel.style.color = "#111";
    panel.style.overflow = "auto";

    panel.innerHTML = `
      <div style="padding:14px 16px; position:sticky; top:0; background:rgba(245,248,255,0.96); backdrop-filter: blur(6px); border-bottom:1px solid rgba(0,0,0,0.08);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <div style="font-weight:900; font-size:16px;">勧誘</div>
          <button id="recruitCloseBtn" style="padding:8px 10px; border-radius:10px; border:1px solid rgba(0,0,0,0.15); background:#fff; font-weight:800;">閉じる</button>
        </div>
        <div id="recruitHint" style="margin-top:8px; font-size:12px; opacity:0.75;"></div>
      </div>
      <div style="padding:14px 16px;">
        <div id="recruitList" style="display:flex; flex-direction:column; gap:10px;"></div>
      </div>
    `;
    document.body.appendChild(panel);

    const closeBtn = $("recruitCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", () => forceHide(panel));

    return panel;
  }

  // canvas内部解像度（DPR対応）
  function resizeSceneCanvas() {
    const canvas = $("sceneCanvas");
    if (!canvas) return;
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
        (name === "settings" && key === "settings") ||
        (name === "recruit" && key === "recruit");
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
  function showEndOverlay() { forceShow($("endOverlay"), "flex"); }
  function hideEndOverlay() { forceHide($("endOverlay")); }

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
    const el = $("sceneCaption");
    if (el) el.textContent = text || "";
  }
  function setRunSceneText(text) {
    const el = $("runSceneText");
    if (el) el.textContent = text || "";
  }

  // ---- HERO PORTRAIT（HOME枠）----
  function setHeroPortrait(src) {
    // 既存HTMLにidが無いはずなので、左カードの最初のimgを取る
    let img = $("heroPortrait");
    if (!img) img = document.querySelector(".hero-card img") || document.querySelector("#viewHome img");
    if (!img) return;

    if (src) img.src = src;

    // 枠いっぱい、歪み防止
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain"; // 比率維持（縦長化防止）
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

  // ---- team (8枠固定) ----
  function renderTeam(team) {
    const list = $("teamList");
    if (!list) return;

    const arr = Array.isArray(team) ? team suggested : [];
    const members = Array.isArray(team) ? team : [];
    const slots = 8;

    const items = [];
    for (let i = 0; i < slots; i++) {
      const m = members[i];
      if (m) {
        const name = m.name || `部員${i + 1}`;
        const grade = m.grade ? `${m.grade}年` : "";
        const rarity = m.rarity === "rare" ? "レア" : "通常";
        const tag = m.tag || "";
        const pow = Number.isFinite(m.pow) ? m.pow : 0;
        items.push(`
          <div class="member">
            <div class="avatar">${i + 1}</div>
            <div class="meta">
              <div class="name">${name}</div>
              <div class="sub">${grade} / ${rarity}${tag ? " / " + tag : ""}</div>
            </div>
            <div class="pow">${pow}</div>
          </div>
        `);
      } else {
        items.push(`
          <div class="member" style="opacity:0.65;">
            <div class="avatar">${i + 1}</div>
            <div class="meta">
              <div class="name">空き</div>
              <div class="sub">勧誘でメンバーを増やせます</div>
            </div>
            <div class="pow">—</div>
          </div>
        `);
      }
    }
    list.innerHTML = items.join("");

    const total = members.reduce((acc, m) => acc + (Number.isFinite(m?.pow) ? m.pow : 0), 0);
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

  // ---- run scene (FULLSCREEN) ----
  function showRunScene() {
    const panel = ensureRunScenePanel();
    forceShow(panel, "block");
    resizeSceneCanvas();
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

  // ---- recruit panel (FULLSCREEN) ----
  function showRecruitPanel({ hint, listHTML }) {
    const panel = ensureRecruitPanel();
    const h = $("recruitHint");
    const list = $("recruitList");
    if (h) h.textContent = hint || "";
    if (list) list.innerHTML = listHTML || "";
    forceShow(panel, "block");
  }

  function hideRecruitPanel() {
    const panel = ensureRecruitPanel();
    forceHide(panel);
  }

  // backdrop click closes modal
  document.addEventListener("click", (e) => {
    const back = $("nameModalBackdrop");
    if (!back) return;
    if (e.target === back) closeNameModal();
  });

  window.SD_UI = {
    setActiveView,

    openNameModal,
    closeNameModal,

    showEndOverlay,
    hideEndOverlay,

    setHeroPortrait,

    setPlayerName,
    setHeroMeta,
    setTurnText,
    setNextMeet,
    setCoachLine,
    setAtmosphereText,
    setSceneCaption,
    setRunSceneText,

    renderStats,
    renderTeam,

    renderPracticeLists,
    getSelectedPracticeIds,
    clearPracticeChecks,

    showRunScene,
    hideRunScene,

    showRestScene,
    hideRestScene,

    showRecruitPanel,
    hideRecruitPanel,
  };
})();
