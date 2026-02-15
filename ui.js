// ui.js
// 改良4：通常練習の選択UI（複数選択・上限なし）＋スマホ対応
(function () {
  const $ = (id) => document.getElementById(id);

  function forceShow(el) {
    if (!el) return;
    el.hidden = false;
    el.style.display = "flex";
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

  // ---- Name modal ----
  function openNameModal() {
    const back = $("nameModalBackdrop");
    const input = $("nameInput");
    forceShow(back);
    setTimeout(() => {
      if (input) {
        input.focus();
        if (input.select) input.select();
      }
    }, 0);
  }

  function closeNameModal() {
    forceHide($("nameModalBackdrop"));
    const input = $("nameInput");
    if (input) input.blur();
  }

  // ---- Training modal ----
  function openTrainingModal() {
    forceShow($("trainingBackdrop"));
  }
  function closeTrainingModal() {
    forceHide($("trainingBackdrop"));
  }

  // ---- Simple setters ----
  function setPlayerName(name) {
    const el = $("playerNameText");
    if (el) el.textContent = name || "（未設定）";
  }

  function setPortraitSub(text) {
    const el = $("portraitSub");
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

  function setSceneTitle(text) {
    const el = $("sceneTitle");
    if (el) el.textContent = text || "";
  }

  function setSprite(src) {
    const el = $("playerSprite");
    if (el && src) el.src = src;
  }

  // ---- Stats ----
  const STAT_LABEL = {
    SPD: "スピード",
    ACC: "加速",
    POW: "パワー",
    TEC: "技術",
    STA: "持久力",
    MEN: "メンタル",
  };

  function renderStats(player) {
    const grid = $("statsGrid");
    if (!grid || !player) return;

    const stats = player.stats || {};
    const rows = [
      ["SPD", stats.SPD],
      ["ACC", stats.ACC],
      ["POW", stats.POW],
      ["TEC", stats.TEC],
      ["STA", stats.STA],
      ["MEN", stats.MEN],
    ];

    grid.innerHTML = rows
      .map(([k, v]) => {
        const val = Number.isFinite(v) ? v : 0;
        const pct = Math.max(0, Math.min(100, val));
        return `
          <div class="stat-row">
            <div class="stat-key">${STAT_LABEL[k] || k}</div>
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

  // ---- Training List (cards) ----
  function renderTrainingLists(defs) {
    // defs = { team:[], solo:[] }
    const teamList = $("teamTrainingList");
    const soloList = $("soloTrainingList");
    if (!teamList || !soloList) return;

    function cardHtml(t) {
      const tags = [];
      if (t.tags?.includes("up")) tags.push(`<span class="tag">能力UP</span>`);
      if (t.tags?.includes("fat")) tags.push(`<span class="tag tag-fat">疲労</span>`);
      if (t.tags?.includes("slim")) tags.push(`<span class="tag tag-slim">軽め</span>`);

      return `
        <label class="tcard">
          <input class="tcheck" type="checkbox" data-train-id="${t.id}">
          <div class="tmeta">
            <div class="tname">${t.name}</div>
            <div class="tdesc">${t.desc}</div>
            <div class="tchips">${tags.join("")}</div>
          </div>
        </label>
      `;
    }

    teamList.innerHTML = (defs.team || []).map(cardHtml).join("");
    soloList.innerHTML = (defs.solo || []).map(cardHtml).join("");
  }

  function getCheckedTrainingIds() {
    const nodes = document.querySelectorAll('input[type="checkbox"][data-train-id]');
    return Array.from(nodes).filter(n => n.checked).map(n => n.getAttribute("data-train-id"));
  }

  function setTrainingPreview(text, warn) {
    const p = $("trainingPreview");
    const w = $("trainingWarn");
    if (p) p.textContent = text || "";
    if (w) w.textContent = warn || "";
  }

  // Backdrop click to close (training only, name modal is controlled by buttons)
  document.addEventListener("click", (e) => {
    const tb = $("trainingBackdrop");
    if (tb && e.target === tb) closeTrainingModal();
  });

  window.SD_UI = {
    openNameModal,
    closeNameModal,
    openTrainingModal,
    closeTrainingModal,
    renderTrainingLists,
    getCheckedTrainingIds,
    setTrainingPreview,

    setPlayerName,
    setPortraitSub,
    setTurnText,
    setNextMeet,
    setCoachLine,
    setAtmosphereText,
    setSceneCaption,
    setSceneTitle,
    setSprite,
    renderStats,
    renderTeam,
  };
})();
