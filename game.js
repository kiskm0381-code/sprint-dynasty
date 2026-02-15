// game.js (改良7 修正版)
// - resetBtn のイベント名修正（"click"）
// それ以外は改良7のまま

(function () {
  const KEY = "sd_save_v1";

  const HERO_PORTRAIT_SRC = "./assets/hero_portrait.png";
  const HERO_RUN_SPRITE_SRC = "./assets/hero_idle.png";

  const NORMAL_PORTRAITS = [
    "./assets/portraits/normal_01.png",
    "./assets/portraits/normal_02.png",
    "./assets/portraits/normal_03.png",
    "./assets/portraits/normal_04.png",
  ];
  const NORMAL_RUNNERS = [
    "./assets/runners/normal_run_01.png",
    "./assets/runners/normal_run_02.png",
    "./assets/runners/normal_run_03.png",
    "./assets/runners/normal_run_04.png",
  ];

  const SPRITE_COLS = 8;
  const SPRITE_ROWS = 4;
  const RUN_ROW_INDEX = 0;

  function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
  function load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function hardReset() { localStorage.removeItem(KEY); location.reload(); }

  function defaultState() {
    const rarity = "normal";
    const stats = SD_DATA.genStatsByGrade(1, rarity);

    let team = SD_DATA.makeTeamMembers();
    if (!Array.isArray(team)) team = [];
    team = team.slice(0, 4);

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
      team,
      turn: { grade: 1, month: 4, term: 1 },
      school: { prestige: 18 },
      nextMeet: { name: "新人戦 地区大会", turnsLeft: 3 },
      flags: { campSummer: false, campWinter: false, allJapanCamp: false },
      recruit: { usedThisTurn: false, lastOfferedIds: [] },
      lastEvent: ""
    };
  }

  function termLabel(term) {
    return term === 1 ? "上旬" : term === 2 ? "中旬" : "下旬";
  }
  function clampStat(v) { return SD_DATA.clamp(Math.round(v), 0, 100); }

  function recalcTeamPowers(state) {
    for (const m of state.team) {
      m.pow = SD_DATA.totalPower(m.stats);
      m.tag = SD_DATA.personalityTag(m.stats);
    }
  }

  function totalPowerFromStats(stats) {
    if (SD_DATA && typeof SD_DATA.totalPower === "function") return SD_DATA.totalPower(stats || {});
    const s = stats || {};
    return (s.SPD||0)+(s.ACC||0)+(s.POW||0)+(s.TEC||0)+(s.STA||0)+(s.MEN||0);
  }

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
    const weakest = pairs[0]?.[0];
    const hint = { SPD:"スピード", ACC:"加速", POW:"パワー", TEC:"技術", STA:"持久力", MEN:"メンタル" }[weakest] || "基礎";
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

  function trainingEfficiencyByFatigue(fatigue) {
    const eff = 1.0 - (fatigue * 0.0065);
    return SD_DATA.clamp(eff, 0.35, 1.00);
  }

  function diminishingByCount(n) {
    const v = Math.pow(0.85, Math.max(0, n - 1));
    return SD_DATA.clamp(v, 0.45, 1.0);
  }

  const MENU_INTENSITY = {
    start: 1.15, tempo: 1.00, power: 1.25, core: 1.05,
    mental: 0.85, massage: 0.20, rest: 0.10,
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

    if (injuryRoll(state, action)) applyInjury(state);
    if (!p.retired && p.fatigue >= 100) applyInjury(state);
  }

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

    state.recruit.usedThisTurn = false;
    state.recruit.lastOfferedIds = [];
    state.lastEvent = "";
  }

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

  let SCENE = null;

  function initSceneIfNeeded() {
    const canvas = document.getElementById("sceneCanvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (SCENE) return SCENE;

    SCENE = makeSceneRenderer(canvas, ctx);
    SCENE.start();
    return SCENE;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function makeChromaKeyedSprite(img) {
    const off = document.createElement("canvas");
    off.width = img.naturalWidth || img.width;
    off.height = img.naturalHeight || img.height;
    const octx = off.getContext("2d");
    octx.drawImage(img, 0, 0);

    const im = octx.getImageData(0, 0, off.width, off.height);
    const d = im.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
      if (a === 0) continue;
      if (r >= 245 && g >= 245 && b >= 245) d[i+3] = 0;
    }
    octx.putImageData(im, 0, 0);
    return off;
  }

  function makeSceneRenderer(canvas, ctx) {
    let raf = 0;
    let t = 0;

    const runner = { x: 110, y: 290 };
    let sprite = null;
    let spriteReady = false;

    (async () => {
      try {
        const img = await loadImage(HERO_RUN_SPRITE_SRC);
        sprite = await makeChromaKeyedSprite(img);
        spriteReady = true;
      } catch {
        spriteReady = false;
      }
    })();

    function drawBackground() {
      const w = canvas.width, h = canvas.height;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(235,240,255,1)");
      g.addColorStop(1, "rgba(210,220,245,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(220,60,60,0.20)";
      ctx.fillRect(0, h * 0.62, w, h * 0.38);

      ctx.strokeStyle = "rgba(120,120,120,0.35)";
      ctx.lineWidth = Math.max(1, Math.round(w * 0.003));
      const lanes = 4;
      for (let i = 0; i <= lanes; i++) {
        const y = h * 0.70 + i * (h * 0.06);
        ctx.beginPath();
        ctx.moveTo(w * 0.08, y);
        ctx.lineTo(w * 0.92, y);
        ctx.stroke();
      }
    }

    function drawRunnerSprite() {
      if (!spriteReady || !sprite) return;

      const sw = sprite.width / SPRITE_COLS;
      const sh = sprite.height / SPRITE_ROWS;

      const frame = Math.floor((t * 0.30) % SPRITE_COLS);
      const sx = frame * sw;
      const sy = RUN_ROW_INDEX * sh;

      const scale = Math.max(2, Math.round(canvas.width / 420));
      const dw = sw * scale;
      const dh = sh * scale;

      runner.x += 2.2 * scale;
      if (runner.x > canvas.width + dw) runner.x = -dw;

      const dx = runner.x;
      const dy = canvas.height * 0.70 - dh;

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, sx, sy, sw, sh, dx, dy, dw, dh);
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

  function refreshAll(state) {
    const t = state.turn;
    SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
    SD_UI.setNextMeet(nextMeetText(state));
    SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");
    SD_UI.setHeroMeta(`${state.player.grade}年 / 春風高校`);
    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setAtmosphereText(atmosphereText(state));

    SD_UI.setHeroPortrait(HERO_PORTRAIT_SRC);

    recalcTeamPowers(state);
    SD_UI.renderStats(state.player);
    SD_UI.renderTeam(state.team);

    save(state);

    if (state.player.retired) SD_UI.showEndOverlay();
    else SD_UI.hideEndOverlay();
  }

  async function runPracticeTurn(state, selectedIds) {
    if (state.player.retired) return;

    SD_UI.showRunScene();
    SD_UI.setSceneCaption("練習。息が熱い。");
    SD_UI.setRunSceneText("走る…（準備中）");

    initSceneIfNeeded();
    await new Promise(r => setTimeout(r, 1200));

    const ids = Array.isArray(selectedIds) ? selectedIds : [];
    let idx = 1;
    for (const id of ids) {
      SD_UI.setRunSceneText(`練習中…（${idx}/${ids.length || 1}）`);
      applyTrainingOnce(state, id, idx);
      idx += 1;
      await new Promise(r => setTimeout(r, 120));
      if (state.player.retired) break;
    }

    if (!state.player.retired) advanceTurn(state);

    SD_UI.hideRunScene();
    SD_UI.setActiveView("home");
    refreshAll(state);
  }

  function pickRestRare(state) {
    const roll = Math.random();
    if (roll < 0.22) {
      return {
        title: "休息",
        img: HERO_PORTRAIT_SRC,
        body:
          "人物名鑑：鏡城 レイ（加速型）\n" +
          "3年　春風高校 陸上部。\n" +
          "静かに燃えるタイプ。練習量は裏切らない。"
      };
    }
    return {
      title: "休息",
      img: HERO_PORTRAIT_SRC,
      body: "休息で回復した。次のターンへ。"
    };
  }

  async function applyRestTurn(state) {
    if (state.player.retired) return;

    applyTrainingOnce(state, "rest", 1);
    if (!state.player.retired) advanceTurn(state);

    const rare = pickRestRare(state);
    SD_UI.showRestScene({ title: rare.title, body: rare.body, imgSrc: rare.img });

    await new Promise(r => setTimeout(r, 7000)); // ★固定7秒
    SD_UI.hideRestScene();

    SD_UI.setActiveView("home");
    refreshAll(state);
  }

  const RECRUIT_POOL = [
    { id:"n01", name:"西園 シン",  grade:1, type:"SPD", rarity:"normal", mustJoin:false, vibe:"短い加速で勝負する。", portraitIdx:0, runnerIdx:0 },
    { id:"n02", name:"土岐 ユウ",  grade:1, type:"TEC", rarity:"normal", mustJoin:false, vibe:"フォームが綺麗で伸びしろ大。", portraitIdx:1, runnerIdx:1 },
    { id:"n03", name:"羽柴 ケン",  grade:2, type:"POW", rarity:"normal", mustJoin:false, vibe:"直線が強い。筋力タイプ。", portraitIdx:2, runnerIdx:2 },
    { id:"n04", name:"桐谷 ハル",  grade:2, type:"MEN", rarity:"normal", mustJoin:false, vibe:"本番に強い。波が少ない。", portraitIdx:3, runnerIdx:3 },
    { id:"n05", name:"早乙女 ルカ",grade:1, type:"ACC", rarity:"normal", mustJoin:false, vibe:"スタートだけは誰にも負けない。", portraitIdx:0, runnerIdx:1 },
    { id:"n06", name:"皆川 トオル",grade:2, type:"STA", rarity:"normal", mustJoin:false, vibe:"練習を休まない。基礎が硬い。", portraitIdx:1, runnerIdx:2 },
    { id:"n07", name:"榊原 ソラ", grade:1, type:"SPD", rarity:"normal", mustJoin:false, vibe:"反応が鋭い。天性の勘。", portraitIdx:2, runnerIdx:3 },
    { id:"n08", name:"三雲 タクミ",grade:3, type:"TEC", rarity:"normal", mustJoin:false, vibe:"走りの理屈を語れる。", portraitIdx:3, runnerIdx:0 },
    { id:"n09", name:"篠崎 カイ", grade:2, type:"ACC", rarity:"normal", mustJoin:false, vibe:"爆発力。だがムラがある。", portraitIdx:0, runnerIdx:2 },
    { id:"n10", name:"新田 リョウ", grade:1, type:"POW", rarity:"normal", mustJoin:false, vibe:"追い込みで伸びる。", portraitIdx:1, runnerIdx:3 },
    { id:"n11", name:"神谷 ヒビキ",grade:3, type:"MEN", rarity:"normal", mustJoin:false, vibe:"勝負所で顔色が変わらない。", portraitIdx:2, runnerIdx:0 },
    { id:"n12", name:"水無月 シュン",grade:2,type:"STA", rarity:"normal", mustJoin:false, vibe:"淡々と積む。夏に強い。", portraitIdx:3, runnerIdx:1 },

    { id:"r01", name:"黒瀬 アキト", grade:2, type:"SPD", rarity:"rare", mustJoin:false, vibe:"“100mだけ”なら全国級。", portraitSrc:"./assets/portraits/rare_r01.png", runnerSrc:"./assets/runners/rare_r01_run.png" },
    { id:"r02", name:"天城 ナギ",     grade:1, type:"TEC", rarity:"rare", mustJoin:false, vibe:"フォームが芸術。撮られる男。", portraitSrc:"./assets/portraits/rare_r02.png", runnerSrc:"./assets/runners/rare_r02_run.png" },

    { id:"rg1", name:"白峰 レオ",     grade:3, type:"ACC", rarity:"rare", mustJoin:true, vibe:"ある条件で必ず味方になる。", portraitSrc:"./assets/portraits/rare_rg.png", runnerSrc:"./assets/runners/rare_rg_run.png" },
  ];

  function alreadyInTeam(state, id) {
    return state.team.some(m => m && m.id === id);
  }

  function sampleRecruit4(state) {
    const pool = RECRUIT_POOL.filter(c => !alreadyInTeam(state, c.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 4);
  }

  function recruitSuccessProb(state, cand) {
    if (cand.mustJoin) return 1.0;

    const prestige = SD_DATA.clamp(state.school?.prestige ?? 0, 0, 100) / 100;
    const pPow = SD_DATA.clamp(totalPowerFromStats(state.player.stats), 0, 600) / 600;

    let base = 0.15 + (prestige * 0.45) + (pPow * 0.40);
    if (cand.rarity === "rare") base -= 0.12;
    base = SD_DATA.clamp(base, 0.05, 0.90);
    return base;
  }

  function makeMemberFromCandidate(c) {
    const rarity = c.rarity === "rare" ? "rare" : "normal";
    const stats = SD_DATA.genStatsByGrade(c.grade || 1, rarity);

    return {
      id: c.id,
      name: c.name,
      grade: c.grade || 1,
      rarity,
      stats,
      portrait: c.portraitSrc || NORMAL_PORTRAITS[(c.portraitIdx ?? 0) % NORMAL_PORTRAITS.length],
      runner: c.runnerSrc || NORMAL_RUNNERS[(c.runnerIdx ?? 0) % NORMAL_RUNNERS.length],
      vibe: c.vibe || "",
    };
  }

  function renderRecruitCards(state, offered) {
    const hint = `学校成績 ${state.school.prestige}/100　/　勧誘は1ターン1人（成功・失敗でもターン終了）`;

    const cards = offered.map((c) => {
      const p = Math.round(recruitSuccessProb(state, c) * 100);
      const rarityLabel = c.rarity === "rare" ? "レア" : "通常";
      const must = c.mustJoin ? "（確定成功）" : "";
      const img = c.portraitSrc || NORMAL_PORTRAITS[(c.portraitIdx ?? 0) % NORMAL_PORTRAITS.length];

      return `
        <div style="background:#fff; border:1px solid rgba(0,0,0,0.10); border-radius:14px; padding:12px; display:flex; gap:12px; align-items:flex-start;">
          <div style="width:76px; height:76px; background:#f1f3f8; border-radius:10px; border:1px solid rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:center;">
            <img src="${img}" style="max-width:100%; max-height:100%; image-rendering:pixelated;" alt="p">
          </div>
          <div style="flex:1;">
            <div style="font-weight:900;">${c.name}（${c.grade}年 / ${rarityLabel}${must}）</div>
            <div style="margin-top:6px; font-size:12px; opacity:0.85; white-space:pre-wrap;">${c.vibe}</div>
            <div style="margin-top:8px; font-size:12px; opacity:0.75;">成功率目安：${p}%</div>
            <button data-recruit-pick="${c.id}"
              style="margin-top:10px; padding:10px 12px; border-radius:12px; border:1px solid rgba(0,0,0,0.12); background:#111; color:#fff; font-weight:900;">
              勧誘する（このターン終了）
            </button>
          </div>
        </div>
      `;
    }).join("");

    SD_UI.showRecruitPanel({ hint, listHTML: cards });
  }

  async function doRecruitTurn(state, pickId) {
    if (state.player.retired) return;
    if (state.recruit.usedThisTurn) return;

    const offeredIds = state.recruit.lastOfferedIds || [];
    if (!offeredIds.includes(pickId)) return;

    const cand = RECRUIT_POOL.find(c => c.id === pickId);
    if (!cand) return;

    state.recruit.usedThisTurn = true;

    const prob = recruitSuccessProb(state, cand);
    const success = Math.random() < prob;

    if (success) {
      if (state.team.length < 8) state.team.push(makeMemberFromCandidate(cand));
      state.lastEvent = `勧誘成功：${cand.name}が入部した。`;
      state.school.prestige = SD_DATA.clamp((state.school.prestige ?? 0) + (cand.rarity === "rare" ? 2 : 1), 0, 100);
    } else {
      state.lastEvent = `勧誘失敗：${cand.name}には届かなかった。`;
    }

    advanceTurn(state);

    SD_UI.hideRecruitPanel();
    SD_UI.showRestScene({
      title: "勧誘",
      body: `${state.lastEvent}\n次のターンへ。`,
      imgSrc: cand.portraitSrc || NORMAL_PORTRAITS[(cand.portraitIdx ?? 0) % NORMAL_PORTRAITS.length],
    });
    await new Promise(r => setTimeout(r, 2200));
    SD_UI.hideRestScene();

    SD_UI.setActiveView("home");
    refreshAll(state);
  }

  function openRecruit(state) {
    if (state.player.retired) return;
    if (showNameModalIfNeeded(state)) return;

    const offered = sampleRecruit4(state);
    state.recruit.lastOfferedIds = offered.map(o => o.id);
    save(state);

    SD_UI.setActiveView("recruit");
    renderRecruitCards(state, offered);

    setTimeout(() => {
      const btns = document.querySelectorAll("[data-recruit-pick]");
      btns.forEach((b) => {
        b.addEventListener("click", async () => {
          const id = b.getAttribute("data-recruit-pick");
          if (!id) return;
          await doRecruitTurn(state, id);
        }, { once: true });
      });
    }, 0);
  }

  function wireTabs(state) {
    const tabs = document.querySelectorAll(".tabbar .tab");
    tabs.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.getAttribute("data-tab");
        if (!key) return;

        if (key === "home") { SD_UI.setActiveView("home"); return; }
        if (key === "practice") { if (state.player.retired) return; SD_UI.setActiveView("practice"); return; }
        if (key === "settings") { SD_UI.setActiveView("settings"); return; }
        if (key === "rest") { if (state.player.retired) return; await applyRestTurn(state); return; }
        if (key === "recruit") { openRecruit(state); return; }
      });
    });
  }

  function wirePractice(state) {
    const startBtn = document.getElementById("practiceStartBtn");
    const clearBtn = document.getElementById("practiceClearBtn");

    if (clearBtn) clearBtn.addEventListener("click", () => SD_UI.clearPracticeChecks());

    if (startBtn) {
      startBtn.addEventListener("click", async () => {
        if (state.player.retired) return;
        if (showNameModalIfNeeded(state)) return;

        const ids = SD_UI.getSelectedPracticeIds();
        if (ids.length === 0) { SD_UI.setCoachLine("今日は何をやる？ 1つでもいい。選んでみよう。"); return; }

        await runPracticeTurn(state, ids);
        SD_UI.clearPracticeChecks();
      });
    }
  }

  function wireSettings(state) {
    const openNameBtn = document.getElementById("openNameBtn");
    const resetBtn = document.getElementById("resetBtn");

    if (openNameBtn) openNameBtn.addEventListener("click", () => SD_UI.openNameModal());

    if (resetBtn) {
      resetBtn.addEventListener("click", () => { // ★修正：click
        if (confirm("最初からやり直しますか？（ローカルデータを削除）")) hardReset();
      });
    }
  }

  function wireEndOverlay() {
    const end = document.getElementById("endOverlay");
    if (!end) return;
    end.addEventListener("click", () => hardReset());
  }

  function boot() {
    let state = load();
    if (!state) state = defaultState();

    SD_UI.renderPracticeLists(PRACTICE_TEAM, PRACTICE_SOLO);

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
