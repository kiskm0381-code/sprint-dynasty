// game.js
// ホーム画面：ターン進行・練習・疲労・怪我（MVP骨格の入口）

(function () {
  const KEY = "sd_save_v1";

  function defaultState() {
    // 主人公（初期パラメータはランダム）
    const rarity = "normal"; // 主人公のレア設定は後で入れても良い（今は隠し特性で差を作る）
    const stats = SD_DATA.genStatsByGrade(1, rarity);

    return {
      player: {
        name: "",
        grade: 1,
        stats,
        fatigue: 0,
        injuryCount: 0,
        growthTraits: SD_DATA.genGrowthTraits(),
        formBonusActive: false, // 後で覚醒/フォーム矯正などを入れる
      },
      team: SD_DATA.makeTeamMembers(),
      turn: {
        grade: 1,
        month: 4,
        term: 1, // 1=上旬,2=中旬,3=下旬
      },
      selectedMenu: "tempo",
      nextMeet: {
        name: "新人戦 地区大会",
        turnsLeft: 3,
      },
      flags: {
        campSummer: false,
        campWinter: false,
        allJapanCamp: false,
      }
    };
  }

  function termLabel(term) {
    return term === 1 ? "上旬" : term === 2 ? "中旬" : "下旬";
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      return obj;
    } catch {
      return null;
    }
  }

  function clampStat(v) { return SD_DATA.clamp(Math.round(v), 0, 100); }

  function totalPower(stats) {
    return SD_DATA.totalPower(stats);
  }

  function recalcTeamPowers(state) {
    for (const m of state.team) {
      m.pow = totalPower(m.stats);
      m.tag = SD_DATA.personalityTag(m.stats);
    }
  }

  function setMenu(state, menuKey) {
    state.selectedMenu = menuKey;
    const map = {
      start: "スタート練習",
      tempo: "流し（フォーム意識）",
      power: "筋トレ",
      core: "体幹",
      mental: "メンタル",
      massage: "マッサージ",
      rest: "休養",
      next: "次ターンへ",
    };
    SD_UI.setSceneTitle(map[menuKey] || "練習");
  }

  function coachLineForTurn(state) {
    // 穏やかなおじちゃん先生：優しく、でも具体的
    const t = state.turn;
    const meet = state.nextMeet;

    // 大会が近い時は確定で大会コメント
    if (meet.turnsLeft <= 3 && meet.turnsLeft >= 1) {
      return `あと${meet.turnsLeft}ターンで${meet.name}だ。今は“積み上げ”の時期だよ。`;
    }
    // 疲労による助言
    const f = state.player.fatigue;
    if (f >= 80) return "無理は禁物だよ。休むのも立派な練習だ。";
    if (f >= 55) return "疲れが溜まってきたね。マッサージか休養も考えよう。";

    // 能力の弱点提案
    const s = state.player.stats;
    const pairs = Object.entries(s).sort((a,b)=>a[1]-b[1]);
    const weakest = pairs[0][0];
    const hint = {
      SPD:"スピード",
      ACC:"加速",
      POW:"筋力",
      TEC:"技術",
      STA:"持久",
      MEN:"メンタル"
    }[weakest] || "基礎";
    return `${hint}を少し意識してみようか。焦らなくていい、丁寧にいこう。`;
  }

  function atmosphereText(state) {
    // 青春の空気：時期で少し変える
    const m = state.turn.month;
    if (m <= 5) return "夕方、風が少し冷たい。";
    if (m <= 8) return "夏の匂い。汗が真っ直ぐになる。";
    if (m <= 10) return "空が高い。呼吸が澄んでいく。";
    return "冷えた空気。足音がよく響く。";
  }

  function sceneCaption(state) {
    const meet = state.nextMeet;
    if (meet.turnsLeft <= 2) return "弱小でも、直線は嘘をつかない。";
    return "春風高校は弱小。でも、積み上げた分だけ速くなる。";
  }

  function applyTraining(state, action) {
    const p = state.player;
    const s = p.stats;

    // 練習効果（仮の固定値。次フェーズで「能力計算式を確定」する）
    // ここでは“気持ちよさ”優先で、増減が分かるようにしている。
    const eff = {
      start:   { ACC: +3, TEC: +2, fatigue: +14, vibe: "スタートの音が、体に入る。" },
      tempo:   { TEC: +3, MEN: +2, fatigue: +10, vibe: "フォームが一瞬だけ“揃う”。" },
      power:   { POW: +4, STA: +1, fatigue: +18, vibe: "脚が重い。でも、明日の脚になる。" },
      core:    { STA: +3, TEC: +1, fatigue: +12, vibe: "軸が少し安定した気がする。" },
      mental:  { MEN: +4, fatigue: +2,  vibe: "呼吸が落ち着く。勝負は心からだ。" },
      massage: { all: +1, fatigue: -18, vibe: "体がほぐれて、視界が明るくなる。" },
      rest:    { fatigue: -40, vibe: "休むのも練習。焦りだけは置いていく。" },
    }[action];

    if (!eff) return;

    // vibe（青春の一行）
    SD_UI.setAtmosphereText(atmosphereText(state));
    SD_UI.setSceneCaption(eff.vibe);

    // stats update
    const mult = p.growthTraits.growth / 100; // 0.85〜1.15
    if (eff.all) {
      for (const k of ["SPD","ACC","POW","TEC","STA","MEN"]) {
        s[k] = clampStat(s[k] + Math.round(eff.all * mult));
      }
    } else {
      for (const k of ["SPD","ACC","POW","TEC","STA","MEN"]) {
        if (eff[k]) s[k] = clampStat(s[k] + Math.round(eff[k] * mult));
      }
    }

    // fatigue update
    if (typeof eff.fatigue === "number") {
      p.fatigue = SD_DATA.clamp(p.fatigue + eff.fatigue, 0, 100);
    }

    // チーム波及（主人公が練習すると全員が少しだけ伸びる：MVP軽量版）
    // ※後で「改良5」で本格化させるが、今から“気持ちよさ”は入れておく
    const teamMult = 0.35; // 主人公の35%くらいの影響（控えめ）
    if (action !== "rest") {
      for (const m of state.team) {
        // 弱い能力を少しだけ底上げ
        const keys = Object.entries(m.stats).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);
        const k1 = keys[0];
        const k2 = keys[1];
        const gain = action === "massage" ? 1 : 0;
        m.stats[k1] = clampStat(m.stats[k1] + Math.max(1, Math.round((gain + 1) * teamMult)));
        m.stats[k2] = clampStat(m.stats[k2] + Math.max(0, Math.round((gain + 0) * teamMult)));
      }
      recalcTeamPowers(state);
    }

    // injury check (fatigue 100)
    if (p.fatigue >= 100) {
      // 怪我：能力減点（ランダムで2つを減らす）
      p.injuryCount += 1;
      const keys = ["SPD","ACC","POW","TEC","STA","MEN"];
      const a = keys[SD_DATA.randInt(0, keys.length - 1)];
      let b = keys[SD_DATA.randInt(0, keys.length - 1)];
      if (b === a) b = keys[(keys.indexOf(a) + 1) % keys.length];

      s[a] = clampStat(s[a] - SD_DATA.randInt(3, 7));
      s[b] = clampStat(s[b] - SD_DATA.randInt(3, 7));
      p.fatigue = 55; // 怪我後に強制的に下がる

      SD_UI.setSceneCaption("怪我をした。痛みより、悔しさが先に来る。");
    }
  }

  function advanceTurn(state) {
    // 次大会までカウント
    if (state.nextMeet.turnsLeft > 0) state.nextMeet.turnsLeft -= 1;

    // 年月ターン進行（上旬→中旬→下旬→次月上旬）
    state.turn.term += 1;
    if (state.turn.term >= 4) {
      state.turn.term = 1;
      state.turn.month += 1;

      // 学年更新（4月で進級）
      if (state.turn.month === 13) {
        state.turn.month = 4;
        state.turn.grade += 1;
        state.player.grade = state.turn.grade;

        // 卒業＆新入生加入（簡易）
        // 3年生が引退：チームから3年を除外し、新1年を同数追加（ここは改良6で本格化）
        const before = state.team.length;
        state.team = state.team.filter(m => m.grade < 3);
        const removed = before - state.team.length;

        // 残りを進級
        for (const m of state.team) m.grade = Math.min(3, m.grade + 1);

        for (let i = 0; i < removed; i++) {
          const rarity = SD_DATA.rollRarity(0.10); // 新入生レア
          const name = (rarity === "rare")
            ? SD_DATA.makeTeamMembers()[0].name // 乱数ソースとして流用
            : SD_DATA.makeTeamMembers()[0].name;
          const stats = SD_DATA.genStatsByGrade(1, rarity);
          const tag = SD_DATA.personalityTag(stats);
          const pow = SD_DATA.totalPower(stats);
          state.team.push({
            id: `n${Date.now()}_${i}`,
            name,
            grade: 1,
            rarity,
            stats,
            tag,
            pow,
            icon: String((i % 8) + 1)
          });
        }
        recalcTeamPowers(state);
      }
    }

    // 監督コメント更新
    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setAtmosphereText(atmosphereText(state));
    SD_UI.setSceneCaption(sceneCaption(state));
  }

  function nextMeetText(state) {
    const m = state.nextMeet;
    if (m.turnsLeft <= 0) return `${m.name}（開催中）`;
    return `${m.name}（あと${m.turnsLeft}ターン）`;
  }

  // --- Name modal wiring ---
  function showNameModalIfNeeded(state) {
    if (!state.player.name || !state.player.name.trim()) {
      SD_UI.openNameModal();
      return true;
    }
    return false;
  }

  function wireNameModal(state) {
    const back = document.getElementById("nameModalBackdrop");
    const input = document.getElementById("nameInput");
    const saveBtn = document.getElementById("nameSaveBtn");
    const randBtn = document.getElementById("nameRandomBtn");

    function applyName(name) {
      const n = (name || "").trim().slice(0, 12);
      if (!n) return false;
      state.player.name = n;
      SD_UI.setPlayerName(n);
      save(state);
      SD_UI.closeNameModal();
      return true;
    }

    randBtn.addEventListener("click", () => {
      input.value = SD_DATA.randomPlayerName();
      input.focus();
    });

    saveBtn.addEventListener("click", () => {
      applyName(input.value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        applyName(input.value);
      }
    });

    // backdrop click ignore（誤タップ防止）
    back.addEventListener("click", (e) => {
      if (e.target === back) {
        // 閉じない（名前は必須）
      }
    });
  }

  // --- Actions wiring ---
  function wireActions(state) {
    const btns = document.querySelectorAll("button[data-action]");
    btns.forEach(btn => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        if (!action) return;

        if (action === "next") {
          advanceTurn(state);
        } else {
          setMenu(state, action);
          applyTraining(state, action);
        }

        // UI反映
        const t = state.turn;
        SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
        SD_UI.setNextMeet(nextMeetText(state));
        SD_UI.renderStats(state.player);
        SD_UI.renderTeam(state.team);

        // シーンアニメ側にも反映
        if (window.SD_SCENE) SD_SCENE.setMode(state.selectedMenu);

        save(state);
      });
    });
  }

  // --- Scene (canvas) ---
  function initScene(state) {
    const canvas = document.getElementById("sceneCanvas");
    const ctx = canvas.getContext("2d");

    const scene = makeSceneRenderer(canvas, ctx);
    window.SD_SCENE = scene;

    scene.setMode(state.selectedMenu);
    scene.start();
  }

  function makeSceneRenderer(canvas, ctx) {
    let raf = 0;
    let mode = "tempo";
    let t = 0;

    // runner anim state
    const runner = {
      x: 110,
      y: 290,
      phase: 0,
      speed: 1.6,
    };

    function setMode(m) {
      mode = m;
    }

    function drawBackground() {
      const w = canvas.width, h = canvas.height;

      // sky gradient
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(25,45,85,0.95)");
      g.addColorStop(1, "rgba(10,15,28,0.98)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // stadium silhouettes
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 140, w, 70);

      // crowd dots
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 220; i++) {
        const x = (i * 17 + (t*1.2)) % w;
        const y = 145 + (i % 4) * 14 + (Math.sin(i + t*0.01) * 1.5);
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // light towers
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(52, 55, 10, 120);
      ctx.fillRect(w-62, 55, 10, 120);
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(40, 45, 34, 16);
      ctx.fillRect(w-74, 45, 34, 16);

      // track base (blue)
      ctx.fillStyle = "rgba(40,90,180,0.28)";
      ctx.fillRect(0, 210, w, 170);

      // track pattern
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      for (let i = -w; i < w*2; i += 26) {
        ctx.beginPath();
        ctx.moveTo(i + (t*0.7)%26, 210);
        ctx.lineTo(i + (t*0.7)%26 + 180, 380);
        ctx.stroke();
      }

      // lanes
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      const lanes = 4;
      for (let i = 0; i <= lanes; i++) {
        const y = 240 + i * 28;
        ctx.beginPath();
        ctx.moveTo(70, y);
        ctx.lineTo(w - 70, y);
        ctx.stroke();
      }

      // start/finish hints
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(86, 226, 4, 130);
      ctx.fillRect(w-90, 226, 4, 130);
    }

    function drawRunner() {
      // “飛び跳ね”を抑える：上下動を最小にして、腕脚の振りで走って見せる
      const baseX = runner.x + (Math.sin(t * 0.02) * 2);
      const baseY = runner.y + (Math.sin(t * 0.04) * 1.2); // 小さく

      // speed by mode
      const sp = (mode === "rest") ? 0.2
        : (mode === "massage") ? 0.6
        : (mode === "mental") ? 0.9
        : (mode === "core") ? 1.1
        : (mode === "tempo") ? 1.25
        : (mode === "start") ? 1.4
        : (mode === "power") ? 1.0
        : 1.1;

      runner.speed = sp;

      // runner moves slightly
      runner.x += sp * 0.35;
      if (runner.x > canvas.width - 130) runner.x = 110;

      const phase = t * 0.06 * sp;
      const armA = Math.sin(phase) * 10;      // degrees-ish
      const armB = Math.sin(phase + Math.PI) * 10;
      const legA = Math.sin(phase + Math.PI/2) * 12;
      const legB = Math.sin(phase + Math.PI/2 + Math.PI) * 12;

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(baseX+12, baseY+42, 16, 6, 0, 0, Math.PI*2);
      ctx.fill();

      // body
      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate(-0.08); // slight forward lean

      // head
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.beginPath();
      ctx.arc(16, -6, 10, 0, Math.PI * 2);
      ctx.fill();

      // torso (uniform)
      ctx.fillStyle = "rgba(255, 200, 72, 0.92)";
      roundRect(ctx, 6, 6, 26, 22, 6);
      ctx.fill();

      // bib
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      roundRect(ctx, 12, 12, 14, 10, 4);
      ctx.fill();

      // arms (two lines)
      ctx.strokeStyle = "rgba(255,255,255,0.72)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      // front arm
      ctx.save();
      ctx.translate(10, 10);
      ctx.rotate((armA * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-10, 12);
      ctx.stroke();
      ctx.restore();
      // back arm
      ctx.save();
      ctx.translate(28, 10);
      ctx.rotate((armB * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10, 12);
      ctx.stroke();
      ctx.restore();

      // legs (two thick strokes)
      ctx.strokeStyle = "rgba(255,255,255,0.78)";
      ctx.lineWidth = 6;

      ctx.save();
      ctx.translate(14, 28);
      ctx.rotate((legA * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-8, 18);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(24, 28);
      ctx.rotate((legB * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10, 18);
      ctx.stroke();
      ctx.restore();

      // shoes
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillRect(2, 44, 10, 4);
      ctx.fillRect(26, 44, 10, 4);

      ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w/2, h/2);
      ctx.beginPath();
      ctx.moveTo(x+rr, y);
      ctx.arcTo(x+w, y, x+w, y+h, rr);
      ctx.arcTo(x+w, y+h, x, y+h, rr);
      ctx.arcTo(x, y+h, x, y, rr);
      ctx.arcTo(x, y, x+w, y, rr);
      ctx.closePath();
    }

    function draw() {
      t += 1;
      drawBackground();
      drawRunner();

      // small particles (sweat / dust)
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      for (let i = 0; i < 16; i++) {
        const x = (canvas.width - 140) + (i*18 + t*0.8) % 140;
        const y = 220 + (i % 6) * 24;
        ctx.fillRect(x, y, 2, 2);
      }

      raf = requestAnimationFrame(draw);
    }

    function start() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }

    return { start, setMode };
  }

  // --- boot ---
  function boot() {
    let state = load();
    if (!state) state = defaultState();

    // UI initial
    const t = state.turn;
    SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
    SD_UI.setNextMeet(`${state.nextMeet.name}（あと${state.nextMeet.turnsLeft}ターン）`);
    SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");
    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setAtmosphereText(atmosphereText(state));
    SD_UI.setSceneCaption(sceneCaption(state));

    recalcTeamPowers(state);
    SD_UI.renderStats(state.player);
    SD_UI.renderTeam(state.team);

    // scene
    initScene(state);

    // modal
    wireNameModal(state);
    showNameModalIfNeeded(state);

    // actions
    wireActions(state);

    // persist initial
    save(state);
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
