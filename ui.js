// ui.js (改良5)
// 画面切替 + 練習UI + モーダル + ENDオーバーレイ
// + ホームの主人公枠(img)に hero_portrait.png を差し込む機能追加

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

  // ---- hero portrait img ----
  // できるだけ壊れにくい探索で「主人公枠のimg」を拾って src を差し替える
  function findHeroImgEl() {
    // 推奨：index.htmlで <img id="heroImage" ...> にしておくと確実
    return (
      $("heroImage")
      || $("heroPortraitImg")
      || document.querySelector("[data-hero-image]")
      || document.querySelector(".hero-card img")
      || document.querySelector("#viewHome img")
      || document.querySelector("img")
      || null
    );
  }

  function setHeroImageSrc(src) {
    const img = findHeroImgEl();
    if (!img) return;
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);

    // ドット絵が滲む場合の保険（CSS側でも可）
    img.style.imageRendering = "pixelated";
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

  // ---- run scene panel ----
  function showRunScene() {
    forceShow($("runScenePanel"), "block");
  }
  function hideRunScene() {
    forceHide($("runScenePanel"));
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

    // hero img
    setHeroImageSrc,

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
  };
})();
