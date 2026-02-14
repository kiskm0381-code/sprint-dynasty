// ui.js
// index.html のDOMに合わせたUI操作一式（モーダルの open/close を hidden 属性で確実に制御）

(function () {
  const $ = (id) => document.getElementById(id);

  // ---- basic setters ----
  function setTurnText(turn) {
    // turn: {grade, month, term, termLabel}
    const el = $("turnBadge");
    if (!el) return;
    const termLabel = turn.termLabel || (turn.term === 1 ? "上旬" : turn.term === 2 ? "中旬" : "下旬");
    el.textContent = `${turn.grade}年 ${turn.month}月 ${termLabel}`;
  }

  function setNextMeet(text) {
    const el = $("nextMeetText");
    if (!el) return;
    el.textContent = text;
  }

  function setPlayerName(name) {
    const el = $("playerNameText");
    if (!el) return;
    el.textContent = name || "（未設定）";
  }

  function setCoachLine(text) {
    const el = $("coachLine");
    if (!el) return;
    el.textContent = text || "";
  }

  function setAtmosphereText(text) {
    const el = $("atmosphereText");
    if (!el) return;
    el.textContent = text || "";
  }

  function setSceneCaption(text) {
    const el = $("sceneCaption");
    if (!el) return;
    el.textContent = text || "";
  }

  function setSceneTitle(text) {
    const el = $("sceneTitle");
    if (!el) return;
    el.textContent = text || "";
  }

  // ---- stats rendering ----
  function renderStats(player) {
    // player: {stats, fatigue, injuryCount}
    const grid = $("statsGrid");
    if (!grid) return;

    const stats = player.stats || {};
    const rows = [
      ["SPD", "スピード", stats.SPD],
      ["ACC", "加速", stats.ACC],
      ["POW", "筋力", stats.POW],
      ["TEC", "技術", stats.TEC],
      ["STA", "持久", stats.STA],
      ["MEN", "メンタル", stats.MEN],
    ];

    grid.innerHTML = rows
      .map(([k, label, val]) => {
        const v = Number.isFinite(val) ? val : 0;
        const pct = Math.max(0, Math.min(100, v));
        return `
          <div class="stat-row">
            <div class="stat-key">${k}</div>
            <div class="stat-bar"><div class="stat-fill" style="width:${pct}%"></div></div>
            <div class="stat-val">${v}</div>
          </div>
        `;
      })
      .join("");

    // fatigue
    const fv = $("fatigueValue");
    const fb = $("fatigueBar");
    const f = Math.max(0, Math.min(100, Math.round(player.fatigue ?? 0)));
    if (fv) fv.textContent = String(f);
    if (fb) fb.style.width = `${f}%`;

    // injury
    const inj = $("injuryText");
    if (inj) inj.textContent = `${player.injuryCount ?? 0} / 3`;
  }

  // ---- team rendering ----
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

    // team power (右上の総合表示を軽く反映)
    const total = arr.reduce((acc, m) => acc + (Number.isFinite(m.pow) ? m.pow : 0), 0);
    const tp = $("teamPowerText");
    if (tp) tp.textContent = `${total}`;
  }

  // ---- modal control (ここが本命の修正点) ----
  function openNameModal() {
    const back = $("nameModalBackdrop");
    const input = $("nameInput");
    if (!back) return;

    // hidden属性で確実に表示
    back.hidden = false;

    // 入力欄フォーカス
    setTimeout(() => {
      if (input) input.focus();
      if (input && input.select) input.select();
    }, 0);
  }

  function closeNameModal() {
    const back = $("nameModalBackdrop");
    const input = $("nameInput");
    if (!back) return;

    // hidden属性で確実に非表示
    back.hidden = true;

    // 入力欄のフォーカス解除
    if (input) input.blur();
  }

  // ---- expose ----
  window.SD_UI = {
    setTurnText,
    setNextMeet,
    setPlayerName,
    setCoachLine,
    setAtmosphereText,
    setSceneCaption,
    setSceneTitle,
    renderStats,
    renderTeam,
    openNameModal,
    closeNameModal,
  };
})();
