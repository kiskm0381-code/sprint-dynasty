// ui.js
// 安全にDOM更新しつつ、モーダルは確実に開閉する
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

  // ---- modal ----
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
    const back = $("nameModalBackdrop");
    const input = $("nameInput");
    forceHide(back);
    if (input) input.blur();
  }

  // ---- text ----
  function setPlayerName(name) {
    const el = $("playerNameText");
    if (el) el.textContent = name || "（未設定）";
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

  function setCoachSub(text) {
    const el = $("coachSub");
    if (el) el.textContent = text || "—";
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

  function setTurnStateText(text) {
    const el = $("turnStateText");
    if (el) el.textContent = text || "";
  }

  // ---- render ----
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

    const pn = $("portraitNote");
    if (pn) pn.textContent = `${player.grade ?? 1}年 / 春風高校`;
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

  // 背景クリックで閉じる（ただし名前未設定のときは閉じない）
  document.addEventListener("click", (e) => {
    const back = $("nameModalBackdrop");
    if (!back) return;
    if (e.target === back) {
      // ゲーム側で未設定時の閉鎖は抑制する前提だが、念のためここでも閉じない
    }
  });

  window.SD_UI = {
    openNameModal,
    closeNameModal,
    setPlayerName,
    setTurnText,
    setNextMeet,
    setCoachLine,
    setCoachSub,
    setAtmosphereText,
    setSceneCaption,
    setSceneTitle,
    setTurnStateText,
    renderStats,
    renderTeam,
  };
})();
