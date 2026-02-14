// ui.js
(function () {
  function el(id) { return document.getElementById(id); }

  function statRow(label, value, pct) {
    const row = document.createElement("div");
    row.className = "stat-row";

    const l = document.createElement("div");
    l.className = "stat-label";
    l.textContent = label;

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);

    const n = document.createElement("div");
    n.className = "stat-num";
    n.textContent = String(value).padStart(2, " ");

    row.appendChild(l);
    row.appendChild(bar);
    row.appendChild(n);
    return row;
  }

  function fatigueColorClass(fatigue) {
    // bar-fill色を JS 側で直接塗る（色指定をCSSに持たせたい場合は後でclass化）
    if (fatigue >= 70) return "danger";
    if (fatigue >= 40) return "warn";
    return "ok";
  }

  function setFatigueBar(fatigue) {
    const bar = el("fatigueBar");
    const v = el("fatigueValue");
    const note = el("fatigueNote");

    const f = SD_DATA.clamp(Math.round(fatigue), 0, 100);
    v.textContent = f;

    bar.style.width = `${f}%`;

    // 色味（直接rgbaで入れる）
    const tone = fatigueColorClass(f);
    if (tone === "danger") bar.style.background = "rgba(255, 93, 93, 0.75)";
    else if (tone === "warn") bar.style.background = "rgba(255, 209, 102, 0.70)";
    else bar.style.background = "rgba(126, 224, 129, 0.65)";

    if (f >= 85) note.textContent = "危険：疲労が高い。無理をすると怪我のリスクが上がる。";
    else if (f >= 55) note.textContent = "注意：疲労が溜まってきた。休養も戦略。";
    else note.textContent = "疲労が100%に到達すると怪我をします。";
  }

  function renderStats(player) {
    const grid = el("statsGrid");
    grid.innerHTML = "";

    const s = player.stats;
    const rows = [
      ["SPD", s.SPD],
      ["ACC", s.ACC],
      ["POW", s.POW],
      ["TEC", s.TEC],
      ["STA", s.STA],
      ["MEN", s.MEN],
    ];

    for (const [k, val] of rows) {
      const pct = SD_DATA.clamp(val, 0, 100);
      grid.appendChild(statRow(k, val, pct));
    }

    el("injuryText").textContent = `${player.injuryCount} / 3`;
    setFatigueBar(player.fatigue);
  }

  function renderTeam(team) {
    const list = el("teamList");
    list.innerHTML = "";

    let sum = 0;
    for (const m of team) sum += m.pow;
    const avg = team.length ? Math.round(sum / team.length) : 0;
    el("teamPowerText").textContent = `${avg}`;

    for (const m of team) {
      const item = document.createElement("div");
      item.className = "member";

      const icon = document.createElement("div");
      icon.className = "icon";
      icon.textContent = m.icon;

      // レアは枠を少し光らせる
      if (m.rarity === "rare") {
        icon.style.borderColor = "rgba(247, 201, 72, 0.65)";
        icon.style.background = "rgba(247, 201, 72, 0.10)";
      }

      const meta = document.createElement("div");
      meta.className = "meta";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = m.name;

      const sub = document.createElement("div");
      sub.className = "sub";
      const r = m.rarity === "rare" ? "レア" : "通常";
      sub.textContent = `${m.grade}年 / ${r} / ${m.tag}`;

      meta.appendChild(name);
      meta.appendChild(sub);

      const pow = document.createElement("div");
      pow.className = "pow";
      pow.textContent = String(m.pow);

      item.appendChild(icon);
      item.appendChild(meta);
      item.appendChild(pow);

      list.appendChild(item);
    }
  }

  function setTurnText(turn) {
    el("turnBadge").textContent = `${turn.grade}年 ${turn.month}月 ${turn.termLabel}`;
  }

  function setNextMeet(text) {
    el("nextMeetText").textContent = text;
  }

  function setCoachLine(text) {
    el("coachLine").textContent = `「${text}」`;
  }

  function setPlayerName(name) {
    el("playerNameText").textContent = name;
  }

  function setSceneTitle(text) {
    el("sceneTitle").textContent = text;
  }

  function setAtmosphereText(text) {
    el("atmosphereText").textContent = text;
  }

  function setSceneCaption(text) {
    el("sceneCaption").textContent = text;
  }

  // Modal (name)
  function openNameModal() {
    const back = el("nameModalBackdrop");
    back.hidden = false;
    el("nameInput").focus();
  }
  function closeNameModal() {
    el("nameModalBackdrop").hidden = true;
  }

  window.SD_UI = {
    renderStats,
    renderTeam,
    setTurnText,
    setNextMeet,
    setCoachLine,
    setPlayerName,
    setSceneTitle,
    setAtmosphereText,
    setSceneCaption,
    openNameModal,
    closeNameModal,
  };
})();
