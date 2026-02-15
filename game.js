// game.js
// ホーム画面：ターン進行・練習・疲労・怪我（改良3）
// 目的：疲労が「戦略」になる／怪我が「代償」になる／3回で引退END
// 追加：主人公ドット（スプライト）をCanvasで走らせる（Step1）

(function () {
  const KEY = "sd_save_v1";

  // ----------------------------
  // Save / Load
  // ----------------------------
  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  function load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // ----------------------------
  // Default State
  // ----------------------------
  function defaultState() {
    const rarity = "normal";
    const stats = SD_DATA.genStatsByGrade(1, rarity);

    return {
      player: {
        name: "",
        grade: 1,
        stats,
        fatigue: 0,
        injuryCount: 0,
        growthTraits: SD_DATA.genGrowthTraits(),
        formBonusActive: false,
        retired: false
      },
      team: SD_DATA.makeTeamMembers(),
      turn: { grade: 1, month: 4, term: 1 },
      selectedMenu: "tempo",
      nextMeet: { name: "新人戦 地区大会", turnsLeft: 3 },
      flags: { campSummer: false, campWinter: false, allJapanCamp: false },
      lastEvent: ""
    };
  }

  // ----------------------------
  // Helpers
  // ----------------------------
  function termLabel(term) {
    return term === 1 ? "上旬" : term === 2 ? "中旬" : "下旬";
  }
  function clampStat(v) {
    return SD_DATA.clamp(Math.round(v), 0, 100);
  }
  function recalcTeamPowers(state) {
    for (const m of state.team) {
      m.pow = SD_DATA.totalPower(m.stats);
      m.tag = SD_DATA.personalityTag(m.stats);
    }
  }

  // ----------------------------
  // UI Text / Flavor (青春＋リアル)
  // ----------------------------
  function coachLineForTurn(state) {
    const meet = state.nextMeet;

    if (state.player.retired) {
      return "よく頑張った。結果だけが全てじゃない。君の走りは、君のものだ。";
    }
    if (state.lastEvent && state.lastEvent.includes("怪我")) {
      return "今は治すことが最優先だよ。焦りは、痛みより長引くからね。";
    }
    if (meet.turnsLeft <= 3 && meet.turnsLeft >= 1) {
      return `あと${meet.turnsLeft}ターンで${meet.name}だ。今は“積み上げ”の時期だよ。`;
    }

    const f = state.player.fatigue;
    if (f >= 80) return "無理は禁物だよ。休むのも立派な練習だ。";
    if (f >= 55) return "疲れが溜まってきたね。マッサージか休養も考えよう。";

    const s = state.player.stats;
    const pairs = Object.entries(s).sort((a, b) => a[1] - b[1]);
    const weakest = pairs[0][0];
    const hint = { SPD: "スピード", ACC: "加速", POW: "筋力", TEC: "技術", STA: "持久", MEN: "メンタル" }[weakest] || "基礎";
    return `${hint}を少し意識してみようか。丁寧にいこう。`;
  }

  function atmosphereText(state) {
    const m = state.turn.month;
    if (m <= 5) return "夕方、風が少し冷たい。";
    if (m <= 8) return "夏の匂い。汗が真っ直ぐになる。";
    if (m <= 10) return "空が高い。呼吸が澄んでいく。";
    return "冷えた空気。足音がよく響く。";
  }

  function sceneCaption(state) {
    if (state.player.retired) return "走れなくても、君の青春は消えない。";
    const meet = state.nextMeet;
    if (meet.turnsLeft <= 2) return "弱小でも、直線は嘘をつかない。";
    return "春風高校は弱小。でも、積み上げた分だけ速くなる。";
  }

  function nextMeetText(state) {
    const m = state.nextMeet;
    if (m.turnsLeft <= 0) return `${m.name}（開催中）`;
    return `${m.name}（あと${m.turnsLeft}ターン）`;
  }

  // ----------------------------
  // Menu & Training (改良3：疲労効率/怪我抽選)
  // ----------------------------
  function setMenu(state, menuKey) {
    state.selectedMenu = menuKey;
    const map = {
      start: "スタート練習",
      tempo: "流し（フォーム意識）",
      power: "筋トレ",
      core: "体幹",
      mental: "メンタル",
      massage: "マッサージ",
      rest: "休養"
    };
    SD_UI.setSceneTitle(map[menuKey] || "練習");
  }

  function trainingEfficiencyByFatigue(fatigue) {
    const eff = 1.0 - (fatigue * 0.006);
    return SD_DATA.clamp(eff, 0.40, 1.00);
  }

  const MENU_INTENSITY = {
    start: 1.15,
    tempo: 1.00,
    power: 1.25,
    core: 1.05,
    mental: 0.85,
    massage: 0.20,
    rest: 0.10,
  };

  function injuryRoll(state, action) {
    const p = state.player;
    if (action === "rest" || action === "massage" || action === "mental") return false;

    const f = p.fatigue;
    if (f < 65) return false;

    const base = ((f - 65) / 35);
    const curve = Math.pow(SD_DATA.clamp(base, 0, 1), 1.35);
    let prob = curve * 0.18;

    prob *= (MENU_INTENSITY[action] || 1.0);

    const growth = p.growthTraits?.growth ?? 100;
    prob *= SD_DATA.clamp(0.90 + (growth - 100) * 0.003, 0.85, 1.15);

    prob = SD_DATA.clamp(prob, 0, 0.30);
    return Math.random() < prob;
  }

  function applyInjury(state) {
    const p = state.player;
    const s = p.stats;

    p.injuryCount += 1;

    const keys = ["SPD", "ACC", "POW", "TEC", "STA", "MEN"];
    const a = keys[SD_DATA.randInt(0, keys.length - 1)];
    let b = keys[SD_DATA.randInt(0, keys.length - 1)];
    if (b === a) b = keys[(keys.indexOf(a) + 1) % keys.length];

    s[a] = clampStat(s[a] - SD_DATA.randInt(4, 9));
    s[b] = clampStat(s[b] - SD_DATA.randInt(4, 9));

    p.fatigue = 62;
    state.lastEvent = "怪我をした。";

    if (p.injuryCount >= 3) {
      p.retired = true;
      state.lastEvent = "怪我が重なり、引退となった。";
    }
  }

  function applyTraining(state, action) {
    const p = state.player;
    if (p.retired) return;

    const s = p.stats;

    const base = {
      start:   { ACC: +3, TEC: +2, fatigue: +16, vibe: "スタートの音が、体に入る。" },
      tempo:   { TEC: +3, MEN: +2, fatigue: +12, vibe: "フォームが一瞬だけ“揃う”。" },
      power:   { POW: +4, STA: +1, fatigue: +20, vibe: "脚が重い。でも、明日の脚になる。" },
      core:    { STA: +3, TEC: +1, fatigue: +14, vibe: "軸が少し安定した気がする。" },
      mental:  { MEN: +4, fatigue: +3,  vibe: "呼吸が落ち着く。勝負は心からだ。" },
      massage: { all: +1, fatigue: -20, vibe: "体がほぐれて、視界が明るくなる。" },
      rest:    { fatigue: -42, vibe: "休むのも練習。焦りだけは置いていく。" },
    }[action];

    if (!base) return;

    SD_UI.setAtmosphereText(atmosphereText(state));
    SD_UI.setSceneCaption(base.vibe);

    const fatigueEff = trainingEfficiencyByFatigue(p.fatigue);
    const growthEff = (p.growthTraits?.growth ?? 100) / 100;
    const mult = fatigueEff * growthEff;

    if (base.all) {
      for (const k of ["SPD", "ACC", "POW", "TEC", "STA", "MEN"]) {
        s[k] = clampStat(s[k] + Math.max(0, Math.round(base.all * mult)));
      }
    } else {
      for (const k of ["SPD", "ACC", "POW", "TEC", "STA", "MEN"]) {
        if (base[k]) s[k] = clampStat(s[k] + Math.max(0, Math.round(base[k] * mult)));
      }
    }

    if (typeof base.fatigue === "number") {
      p.fatigue = SD_DATA.clamp(p.fatigue + base.fatigue, 0, 100);
    }

    const injured = injuryRoll(state, action);
    if (injured) {
      applyInjury(state);
      SD_UI.setSceneCaption("ピキッ…と嫌な感触。胸が冷える。");
    }

    if (!p.retired && p.fatigue >= 100) {
      applyInjury(state);
      SD_UI.setSceneCaption("限界を越えた。足が言うことをきかない。");
    }

    const teamMult = 0.30;
    if (!p.retired && action !== "rest") {
      for (const m of state.team) {
        const keys = Object.entries(m.stats).sort((a, b) => a[1] - b[1]).map(x => x[0]);
        const k1 = keys[0];
        const k2 = keys[1];
        const gain = (action === "massage") ? 1 : 0;

        m.stats[k1] = clampStat(m.stats[k1] + Math.max(1, Math.round((gain + 1) * teamMult)));
        m.stats[k2] = clampStat(m.stats[k2] + Math.max(0, Math.round((gain + 0) * teamMult)));
      }
      recalcTeamPowers(state);
    }
  }

  // ----------------------------
  // Turn Advance
  // ----------------------------
  function advanceTurn(state) {
    if (state.player.retired) return;

    if (state.nextMeet.turnsLeft > 0) state.nextMeet.turnsLeft -= 1;

    state.turn.term += 1;
    if (state.turn.term >= 4) {
      state.turn.term = 1;
      state.turn.month += 1;

      if (state.turn.month === 13) {
        state.turn.month = 4;
        state.turn.grade += 1;
        state.player.grade = state.turn.grade;
        for (const m of state.team) m.grade = Math.min(3, m.grade + 1);
      }
    }

    state.lastEvent = "";
    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setAtmosphereText(atmosphereText(state));
    SD_UI.setSceneCaption(sceneCaption(state));
  }

  // ----------------------------
  // Name Modal
  // ----------------------------
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

    if (randBtn) {
      randBtn.addEventListener("click", () => {
        input.value = SD_DATA.randomPlayerName();
        input.focus();
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        applyName(input.value);
      });
    }
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") applyName(input.value);
      });
    }
    if (back) {
      back.addEventListener("click", (e) => {
        if (e.target === back) { /* 必須だが、ui.js側で閉じる保険がある */ }
      });
    }
  }

  // ----------------------------
  // Actions
  // ----------------------------
  function lockActionsIfRetired(state) {
    if (!state.player.retired) return;
    const btns = document.querySelectorAll("button[data-action]");
    btns.forEach(b => b.disabled = true);

    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setSceneCaption("— 引退 END — もう一度走りたくなったら、また最初から。");
  }

  function wireActions(state) {
    const btns = document.querySelectorAll("button[data-action]");
    btns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (state.player.retired) return;

        const action = btn.getAttribute("data-action");
        if (!action) return;

        // 行動 → 反映 → ターン進行（この仕様は後で本格化するが、ここでは従来通り）
        setMenu(state, action);
        applyTraining(state, action);

        // 次ターンへ進める（※この自動進行は後の改修でUIと合わせて整える）
        advanceTurn(state);

        // UI反映
        const t = state.turn;
        SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
        SD_UI.setNextMeet(nextMeetText(state));
        SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");

        SD_UI.renderStats(state.player);
        SD_UI.renderTeam(state.team);
        SD_UI.setCoachLine(coachLineForTurn(state));

        // シーンアニメ反映
        if (window.SD_SCENE) window.SD_SCENE.setMode(state.selectedMenu);

        lockActionsIfRetired(state);
        save(state);
      });
    });
  }

  // ----------------------------
  // Scene (Canvas) : ドットスプライト化
  // ----------------------------
  function initScene(state) {
    const canvas = document.getElementById("sceneCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scene = makeSceneRenderer(canvas, ctx);
    window.SD_SCENE = scene;

    scene.setMode(state.selectedMenu);
    scene.start();
  }

  function makeSceneRenderer(canvas, ctx) {
    let raf = 0;
    let mode = "tempo";
    let tick = 0;

    // ドットをにじませない
    ctx.imageSmoothingEnabled = false;

    // スプライト設定（横1列 8フレーム想定）
    const SPRITE_SRC = "./assets/runner_red.png";
    const SHEET = {
      frameW: 64,   // ← 画像に合わせて調整できる
      frameH: 64,   // ← 画像に合わせて調整できる
      frames: 8,
      row: 0,
    };

    const sprite = {
      img: new Image(),
      ready: false,
    };

    sprite.img.onload = () => { sprite.ready = true; };
    sprite.img.onerror = () => { sprite.ready = false; };
    sprite.img.src = SPRITE_SRC;

    // 走者
    const runner = {
      x: 110,
      y: 308, // 足元基準に見える位置
      pxScale: 2.0, // ドット拡大率（スマホでも見える）
    };

    // モードごとの「移動速度」と「アニメ速度」
    function getMotionByMode(m) {
      // move: 画面内の移動量 / frameRate: 何tickで1フレーム進むか（小さいほど速い）
      if (m === "rest")    return { move: 0.10, frameRate: 16 };
      if (m === "massage") return { move: 0.18, frameRate: 14 };
      if (m === "mental")  return { move: 0.22, frameRate: 12 };
      if (m === "core")    return { move: 0.30, frameRate: 10 };
      if (m === "tempo")   return { move: 0.42, frameRate: 8  };
      if (m === "start")   return { move: 0.55, frameRate: 7  };
      if (m === "power")   return { move: 0.26, frameRate: 12 };
      return { move: 0.35, frameRate: 10 };
    }

    function setMode(m) { mode = m || "tempo"; }

    function drawBackground() {
      const w = canvas.width, h = canvas.height;

      // 今は既存の雰囲気を維持（色味の全面改修は次のフェーズでまとめてやる）
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(25,45,85,0.95)");
      g.addColorStop(1, "rgba(10,15,28,0.98)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(40,90,180,0.28)";
      ctx.fillRect(0, 210, w, 170);

      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      for (let i = -w; i < w * 2; i += 26) {
        ctx.beginPath();
        ctx.moveTo(i + (tick * 0.7) % 26, 210);
        ctx.lineTo(i + (tick * 0.7) % 26 + 180, 380);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      const lanes = 4;
      for (let i = 0; i <= lanes; i++) {
        const y = 240 + i * 28;
        ctx.beginPath();
        ctx.moveTo(70, y);
        ctx.lineTo(w - 70, y);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(86, 226, 4, 130);
      ctx.fillRect(w - 90, 226, 4, 130);
    }

    function drawFallbackRunner(x, y) {
      // 画像がない場合の簡易ランナー（白）
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(0, -22, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-8, -12, 16, 20);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-16, 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( 6, 0); ctx.lineTo( 16, 14); ctx.stroke();
      ctx.restore();
    }

    function drawSpriteRunner() {
      const w = canvas.width;

      const motion = getMotionByMode(mode);

      runner.x += motion.move * 8;
      if (runner.x > w - 140) runner.x = 110;

      // 影
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(runner.x + 20, runner.y + 18, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      if (!sprite.ready) {
        drawFallbackRunner(runner.x + 20, runner.y);
        return;
      }

      // フレーム計算
      const frame = Math.floor(tick / motion.frameRate) % SHEET.frames;
      const sx = frame * SHEET.frameW;
      const sy = SHEET.row * SHEET.frameH;

      const dw = SHEET.frameW * runner.pxScale;
      const dh = SHEET.frameH * runner.pxScale;

      // 描画（ドット感維持）
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sprite.img,
        sx, sy, SHEET.frameW, SHEET.frameH,
        runner.x, runner.y - dh + 12, dw, dh
      );
      ctx.restore();
    }

    function draw() {
      tick += 1;
      drawBackground();
      drawSpriteRunner();

      raf = requestAnimationFrame(draw);
    }

    function start() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }

    return { start, setMode };
  }

  // ----------------------------
  // Boot
  // ----------------------------
  function boot() {
    let state = load();
    if (!state) state = defaultState();

    const t = state.turn;
    SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
    SD_UI.setNextMeet(nextMeetText(state));
    SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");
    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setAtmosphereText(atmosphereText(state));
    SD_UI.setSceneCaption(sceneCaption(state));

    recalcTeamPowers(state);
    SD_UI.renderStats(state.player);
    SD_UI.renderTeam(state.team);

    initScene(state);

    wireNameModal(state);
    showNameModalIfNeeded(state);

    wireActions(state);
    lockActionsIfRetired(state);

    save(state);
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
