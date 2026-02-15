// game.js (改良5)
// 目的：
// - HOMEの主人公枠は「顔ドット(hero_portrait.png)」を表示
// - 走りスプライト(hero_run.png)は「練習/特殊練習/大会の演出」で使用（canvas）
// - HOMEからシーンを削除（練習開始時だけ走る演出）
// - 「次ターンへ」廃止：行動確定で自動進行
// - 通常練習は上限なし（ただし疲労/怪我/逓減で制御）
// - 引退ENDはタップでタイトル（初期状態）へ戻す

(function () {
  const KEY = "sd_save_v1";

  // ---- assets ----
  // ※assets整理後のファイル名に合わせています
  const HERO_PORTRAIT_SRC = "./assets/hero_portrait.png"; // ホームの主人公枠（顔）
  const HERO_RUN_SPRITE_SRC = "./assets/hero_run.png";     // 走り演出（練習/大会）

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
  function hardReset() {
    localStorage.removeItem(KEY);
    location.reload();
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
      turn: {
        grade: 1,
        month: 4,
        term: 1, // 1=上旬,2=中旬,3=下旬
      },
      nextMeet: {
        name: "新人戦 地区大会",
        turnsLeft: 3,
      },
      flags: {
        campSummer: false,
        campWinter: false,
        allJapanCamp: false,
      },
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
  // Flavor
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
    if (f >= 55) return "疲れが溜まってきたね。休養も考えよう。";

    const s = state.player.stats;
    const pairs = Object.entries(s).sort((a,b)=>a[1]-b[1]);
    const weakest = pairs[0][0];
    const hint = {
      SPD:"スピード", ACC:"加速", POW:"パワー", TEC:"技術", STA:"持久力", MEN:"メンタル"
    }[weakest] || "基礎";

    return `${hint}を少し意識してみようか。丁寧にいこう。`;
  }

  function atmosphereText(state) {
    const m = state.turn.month;
    if (m <= 5) return "夕方、風が少し冷たい。";
    if (m <= 8) return "夏の匂い。汗が真っ直ぐになる。";
    if (m <= 10) return "空が高い。呼吸が澄んでいく。";
    return "冷えた空気。足音がよく響く。";
  }

  function nextMeetText(state) {
    const m = state.nextMeet;
    if (m.turnsLeft <= 0) return `${m.name}（開催中）`;
    return `${m.name}（あと${m.turnsLeft}ターン）`;
  }

  // ----------------------------
  // Training core (逓減 + 疲労 + 怪我)
  // ----------------------------
  function trainingEfficiencyByFatigue(fatigue) {
    const eff = 1.0 - (fatigue * 0.0065);
    return SD_DATA.clamp(eff, 0.35, 1.00);
  }

  function diminishingByCount(n) {
    const v = Math.pow(0.85, Math.max(0, n - 1));
    return SD_DATA.clamp(v, 0.45, 1.0);
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

    const base = ((f - 65) / 35); // 0..1
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

    const keys = ["SPD","ACC","POW","TEC","STA","MEN"];
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

  function applyTrainingOnce(state, action, withinTurnIndex) {
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

    const fatigueEff = trainingEfficiencyByFatigue(p.fatigue);
    const growthEff = (p.growthTraits?.growth ?? 100) / 100;
    const diminish = diminishingByCount(withinTurnIndex);

    const mult = fatigueEff * growthEff * diminish;

    if (base.all) {
      for (const k of ["SPD","ACC","POW","TEC","STA","MEN"]) {
        s[k] = clampStat(s[k] + Math.max(0, Math.round(base.all * mult)));
      }
    } else {
      for (const k of ["SPD","ACC","POW","TEC","STA","MEN"]) {
        if (base[k]) s[k] = clampStat(s[k] + Math.max(0, Math.round(base[k] * mult)));
      }
    }

    if (typeof base.fatigue === "number") {
      const extra = Math.max(0, withinTurnIndex - 2) * 2;
      p.fatigue = SD_DATA.clamp(p.fatigue + base.fatigue + extra, 0, 100);
    }

    if (injuryRoll(state, action)) {
      applyInjury(state);
    }

    if (!p.retired && p.fatigue >= 100) {
      applyInjury(state);
    }
  }

  // ----------------------------
  // Turn advance
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
    const input = document.getElementById("nameInput");
    const saveBtn = document.getElementById("nameSaveBtn");
    const randBtn = document.getElementById("nameRandomBtn");

    function applyName(name) {
      const n = (name || "").trim().slice(0, 12);
      if (!n) return false;
      state.player.name = n;
      save(state);
      SD_UI.setPlayerName(n);
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
        refreshAll(state);
      });
    }

    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          applyName(input.value);
          refreshAll(state);
        }
      });
    }
  }

  // ----------------------------
  // Practice definitions (仮)
  // ----------------------------
  const PRACTICE_TEAM = [
    { id:"tempo",  name:"リレー連携", desc:"技術と集中。気持ちも上がる。", tags:["能力UP"] },
    { id:"start",  name:"スタート練習（反復）", desc:"加速の型を身体に入れる。", tags:["能力UP","疲労"] },
    { id:"core",   name:"体幹メニュー", desc:"軸を作る。ブレが減る。", tags:["能力UP","軽め"] },
    { id:"power",  name:"補強（筋力）", desc:"パワー底上げ。やりすぎ注意。", tags:["能力UP","疲労"] },
  ];

  const PRACTICE_SOLO = [
    { id:"tempo",  name:"流し（フォーム）", desc:"フォーム確認。伸びは小さく安定。", tags:["能力UP","軽め"] },
    { id:"core",   name:"ステップ＆リズム", desc:"動きのキレを出す。", tags:["能力UP"] },
    { id:"mental", name:"イメトレ／メンタル", desc:"集中と自信。疲労はほぼ増えない。", tags:["能力UP","軽め"] },
    { id:"power",  name:"短距離ダッシュ（反復）", desc:"刺激は強い。疲労は中〜高。", tags:["能力UP","疲労"] },
  ];

  // ----------------------------
  // Scene (Canvas) : practice中だけ使う
  // - 走りスプライト(hero_run.png)をアニメ表示
  // ----------------------------
  function initScene() {
    const canvas = document.getElementById("sceneCanvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const scene = makeSceneRenderer(canvas, ctx, HERO_RUN_SPRITE_SRC);
    window.SD_SCENE = scene;
    scene.start();
    return scene;
  }

  function makeSceneRenderer(canvas, ctx, spriteSrc) {
    let raf = 0;
    let t = 0;

    const runner = { x: 110, y: 292 };

    // sprite
    const sprite = new Image();
    sprite.src = spriteSrc;

    // 「横に並んだフレーム」を想定（8コマをデフォルト）
    // ※画像差し替えでコマ数を変えるならここだけ触る
    const FRAMES = 8;
    const FPS = 12;

    function drawBackground() {
      const w = canvas.width, h = canvas.height;

      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(235,240,255,1)");
      g.addColorStop(1, "rgba(210,220,245,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(220,60,60,0.20)";
      ctx.fillRect(0, 210, w, 170);

      ctx.strokeStyle = "rgba(120,120,120,0.35)";
      ctx.lineWidth = 2;
      const lanes = 4;
      for (let i = 0; i <= lanes; i++) {
        const y = 240 + i * 28;
        ctx.beginPath();
        ctx.moveTo(70, y);
        ctx.lineTo(w - 70, y);
        ctx.stroke();
      }
    }

    function drawRunnerSprite() {
      if (!sprite.complete || !sprite.naturalWidth) {
        // 読み込み中
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.font = "14px system-ui, sans-serif";
        ctx.fillText("loading...", 16, 24);
        return;
      }

      // ピクセルアートを滲ませない
      ctx.imageSmoothingEnabled = false;

      // フレーム計算（横並び）
      const frameW = Math.floor(sprite.naturalWidth / FRAMES);
      const frameH = sprite.naturalHeight;

      // アニメーション
      const frame = Math.floor((t / (60 / FPS)) % FRAMES);
      const sx = frame * frameW;
      const sy = 0;

      // 位置移動（右へ流す）
      runner.x += 1.6;
      if (runner.x > canvas.width - 140) runner.x = 100;

      const wobbleX = Math.sin(t * 0.08) * 1.0;
      const wobbleY = Math.sin(t * 0.12) * 0.6;

      // 表示サイズ（縮小して枠内に収める）
      // ※必要ならここで倍率調整
      const scale = 0.22; // 1536x1024でも扱えるように小さめ
      const dw = Math.floor(frameW * scale);
      const dh = Math.floor(frameH * scale);

      const dx = Math.floor(runner.x + wobbleX);
      const dy = Math.floor(runner.y - dh + wobbleY);

      // 影
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(dx + dw * 0.5, runner.y + 16, dw * 0.42, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.drawImage(sprite, sx, sy, frameW, frameH, dx, dy, dw, dh);
    }

    function draw() {
      t += 1;
      drawBackground();
      drawRunnerSprite();
      raf = requestAnimationFrame(draw);
    }

    function start() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }

    return { start };
  }

  // ----------------------------
  // UI refresh
  // ----------------------------
  function refreshAll(state) {
    const t = state.turn;
    SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
    SD_UI.setNextMeet(nextMeetText(state));
    SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");
    SD_UI.setHeroMeta(`${state.player.grade}年 / 春風高校`);

    // ★ホームの主人公枠は「顔ドット」を固定
    if (SD_UI.setHeroImageSrc) {
      SD_UI.setHeroImageSrc(HERO_PORTRAIT_SRC);
    }

    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setAtmosphereText(atmosphereText(state));

    recalcTeamPowers(state);
    SD_UI.renderStats(state.player);
    SD_UI.renderTeam(state.team);

    save(state);

    if (state.player.retired) {
      SD_UI.showEndOverlay();
    } else {
      SD_UI.hideEndOverlay();
    }
  }

  // ----------------------------
  // Flow: actions
  // ----------------------------
  async function runPracticeTurn(state, selectedIds) {
    if (state.player.retired) return;

    // 演出表示（走りスプライトをここで見せる）
    SD_UI.showRunScene();
    SD_UI.setSceneCaption("走る。息が熱い。");
    SD_UI.setRunSceneText("練習中…");

    await new Promise(r => setTimeout(r, 900));

    const ids = Array.isArray(selectedIds) ? selectedIds : [];
    let idx = 1;
    for (const id of ids) {
      SD_UI.setRunSceneText(`練習中…（${idx}/${ids.length || 1}）`);
      applyTrainingOnce(state, id, idx);
      idx += 1;
      await new Promise(r => setTimeout(r, 120));
      if (state.player.retired) break;
    }

    if (!state.player.retired) {
      advanceTurn(state);
    }

    SD_UI.hideRunScene();
    SD_UI.setActiveView("home");
    refreshAll(state);
  }

  function applyRestTurn(state) {
    if (state.player.retired) return;
    applyTrainingOnce(state, "rest", 1);
    if (!state.player.retired) advanceTurn(state);
    SD_UI.setActiveView("home");
    refreshAll(state);
  }

  // ----------------------------
  // Wiring
  // ----------------------------
  function wireTabs(state) {
    const tabs = document.querySelectorAll(".tabbar .tab");
    tabs.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.getAttribute("data-tab");
        if (!key) return;

        if (key === "home") {
          SD_UI.setActiveView("home");
          return;
        }
        if (key === "practice") {
          if (state.player.retired) return;
          SD_UI.setActiveView("practice");
          return;
        }
        if (key === "settings") {
          SD_UI.setActiveView("settings");
          return;
        }
        if (key === "rest") {
          if (state.player.retired) return;
          applyRestTurn(state);
          return;
        }
      });
    });
  }

  function wirePractice(state) {
    const startBtn = document.getElementById("practiceStartBtn");
    const clearBtn = document.getElementById("practiceClearBtn");

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        SD_UI.clearPracticeChecks();
      });
    }

    if (startBtn) {
      startBtn.addEventListener("click", async () => {
        if (state.player.retired) return;
        if (showNameModalIfNeeded(state)) return;

        const ids = SD_UI.getSelectedPracticeIds();
        if (ids.length === 0) {
          SD_UI.setCoachLine("今日は何をやる？ 1つでもいい。選んでみよう。");
          return;
        }

        await runPracticeTurn(state, ids);
        SD_UI.clearPracticeChecks();
      });
    }
  }

  function wireSettings(state) {
    const openNameBtn = document.getElementById("openNameBtn");
    const resetBtn = document.getElementById("resetBtn");

    if (openNameBtn) {
      openNameBtn.addEventListener("click", () => {
        SD_UI.openNameModal();
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("最初からやり直しますか？（ローカルデータを削除）")) hardReset();
      });
    }
  }

  function wireEndOverlay() {
    const end = document.getElementById("endOverlay");
    if (!end) return;
    end.addEventListener("click", () => {
      hardReset();
    });
  }

  // ----------------------------
  // Boot
  // ----------------------------
  function boot() {
    let state = load();
    if (!state) state = defaultState();

    SD_UI.renderPracticeLists(PRACTICE_TEAM, PRACTICE_SOLO);

    // ★練習用canvas（走り演出）
    initScene();

    wireNameModal(state);
    showNameModalIfNeeded(state);

    wireTabs(state);
    wirePractice(state);
    wireSettings(state);
    wireEndOverlay();

    SD_UI.setActiveView("home");
    refreshAll(state);
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
