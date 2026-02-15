// game.js (改良5)
// 目的：
// - 初期チーム4人（表示枠8は維持）
// - 練習/休息/勧誘を「別画面（フルスクリーン演出）」で表示
// - 休息演出は7秒固定
// - 勧誘：15人プールから毎ターン4人提示→1人だけ勧誘→成否に関わらずターン終了
// - 勧誘成功率：学校実績（簡易prestige）＋主人公パラメータで変動、必ず成功するレアも少数

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

    // 初期は8人生成しても、4人に絞る
    const baseTeam = SD_DATA.makeTeamMembers();
    const team4 = Array.isArray(baseTeam) ? baseTeam.slice(0, 4) : [];

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
      team: team4,
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
      school: {
        prestige: 35, // 学校としての実績（簡易）。後で大会結果などで伸びる想定
      },
      recruit: {
        offerKey: "",
        offerIds: [], // そのターンに提示される4名（pool id）
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

  function currentTurnKey(state) {
    const t = state.turn;
    return `${t.grade}-${t.month}-${t.term}`;
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
    // 0→1.00 / 50→0.75 / 80→0.55 / 100→0.35
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
      const extra = Math.max(0, withinTurnIndex - 2) * 2; // 3個目から+2,+4,+6...
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
  // Practice definitions
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
  // Recruit pool (15)
  // 画像は assets/ にある想定。無ければ hero_portrait.png にフォールバック
  // ----------------------------
  const ASSET_FALLBACK_PORTRAIT = "./assets/hero_portrait.png";
  const ASSET_FALLBACK_RUNNER   = "./assets/hero_idle.png";

  // ※通常キャラは「顔4種」「走り4種」を使い回す前提
  const NORMAL_PORTRAITS = [
    "./assets/portrait_n1.png",
    "./assets/portrait_n2.png",
    "./assets/portrait_n3.png",
    "./assets/portrait_n4.png",
  ];
  const NORMAL_RUNNERS = [
    "./assets/runner_n1.png",
    "./assets/runner_n2.png",
    "./assets/runner_n3.png",
    "./assets/runner_n4.png",
  ];

  function pickFrom(arr, i, fallback) {
    const v = arr && arr[i % arr.length];
    return v || fallback;
  }

  const RECRUIT_POOL = [
    // rare（少なめ）
    { id:"r01", name:"久遠 ルカ", grade:3, rarity:"rare",  archetype:"スピード型",  guaranteed:false,
      portrait:"./assets/portrait_r_luca.png", runner:"./assets/runner_r_luca.png",
      blurb:"風の音だけを味方にする。勝負所で伸びる、孤高のスプリンター。" },
    { id:"r02", name:"鏡城 レイ", grade:3, rarity:"rare",  archetype:"加速型",  guaranteed:false,
      portrait:"./assets/portrait_r_rei.png",  runner:"./assets/runner_r_rei.png",
      blurb:"静かに燃える。スタートの一歩で、流れを奪い取る。" },
    // 必ず成功するレア（稀）
    { id:"r03", name:"雨宮 シオン", grade:2, rarity:"rare", archetype:"技巧型", guaranteed:true,
      portrait:"./assets/portrait_r_shion.png", runner:"./assets/runner_r_shion.png",
      blurb:"『面白そう』の一言で来る。条件？そんなの後でいい。必ず仲間になる。" },

    // normal（多め）
    { id:"n01", name:"佐藤 悠真", grade:1, rarity:"normal", archetype:"スピード型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,0,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,0,ASSET_FALLBACK_RUNNER),
      blurb:"負けず嫌いで伸びるタイプ。追い込むほどにフォームが整う。" },
    { id:"n02", name:"伊藤 隼人", grade:2, rarity:"normal", archetype:"加速型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,1,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,1,ASSET_FALLBACK_RUNNER),
      blurb:"反応が速い。合図が鳴る前から、気配で動く。" },
    { id:"n03", name:"山田 奏", grade:3, rarity:"normal", archetype:"持久型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,2,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,2,ASSET_FALLBACK_RUNNER),
      blurb:"コツコツ型。調子の波が小さく、チームの土台になる。" },
    { id:"n04", name:"森 玲央", grade:3, rarity:"normal", archetype:"パワー型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,3,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,3,ASSET_FALLBACK_RUNNER),
      blurb:"身体が強い。押し切る走りで、流れを変える。" },
    { id:"n05", name:"柏木 透", grade:2, rarity:"normal", archetype:"技巧型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,0,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,1,ASSET_FALLBACK_RUNNER),
      blurb:"フォーム研究好き。小さな差を積み上げて強くなる。" },
    { id:"n06", name:"相原 恒一", grade:1, rarity:"normal", archetype:"パワー型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,1,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,2,ASSET_FALLBACK_RUNNER),
      blurb:"補強で化ける。最初は粗いが、伸びしろが大きい。" },
    { id:"n07", name:"宮下 恒一", grade:1, rarity:"normal", archetype:"加速型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,2,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,3,ASSET_FALLBACK_RUNNER),
      blurb:"スタートが得意。短い距離ほど強い。" },
    { id:"n08", name:"岸本 直", grade:2, rarity:"normal", archetype:"メンタル型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,3,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,0,ASSET_FALLBACK_RUNNER),
      blurb:"本番に強い。勝負の空気で集中が上がる。" },
    { id:"n09", name:"望月 玲", grade:3, rarity:"normal", archetype:"スピード型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,0,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,0,ASSET_FALLBACK_RUNNER),
      blurb:"直線で伸びる。ラストの一押しが武器。" },
    { id:"n10", name:"早川 蓮", grade:1, rarity:"normal", archetype:"技巧型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,1,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,1,ASSET_FALLBACK_RUNNER),
      blurb:"器用貧乏になりがち。育て方で化ける。" },
    { id:"n11", name:"神谷 咲", grade:2, rarity:"normal", archetype:"持久型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,2,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,2,ASSET_FALLBACK_RUNNER),
      blurb:"地味に強い。崩れない走りでポイントを取る。" },
    { id:"n12", name:"橘 佑", grade:3, rarity:"normal", archetype:"パワー型", guaranteed:false,
      portrait:pickFrom(NORMAL_PORTRAITS,3,ASSET_FALLBACK_PORTRAIT), runner:pickFrom(NORMAL_RUNNERS,3,ASSET_FALLBACK_RUNNER),
      blurb:"上り調子に乗ると止まらない。波はあるが爆発力あり。" },
  ];

  function poolById(id) {
    return RECRUIT_POOL.find(x => x.id === id) || null;
  }

  function isAlreadyOnTeam(state, id) {
    return (state.team || []).some(m => m && m.recruitId === id);
  }

  function rollRecruitOffers(state) {
    // レア少なめ：レアは重みを小さくする
    const normals = RECRUIT_POOL.filter(x => x.rarity === "normal");
    const rares   = RECRUIT_POOL.filter(x => x.rarity === "rare");

    const picks = [];
    let safety = 0;

    function pickOne() {
      // 90% normal / 10% rare（体感：レア少なめ）
      const useRare = Math.random() < 0.10;
      const src = useRare ? rares : normals;
      const cand = src[SD_DATA.randInt(0, src.length - 1)];
      return cand;
    }

    while (picks.length < 4 && safety < 200) {
      safety++;
      const cand = pickOne();
      if (!cand) continue;
      if (picks.includes(cand.id)) continue;
      if (isAlreadyOnTeam(state, cand.id)) continue;
      picks.push(cand.id);
    }

    // どうしても足りない場合は被り回避を緩める
    while (picks.length < 4 && safety < 400) {
      safety++;
      const cand = RECRUIT_POOL[SD_DATA.randInt(0, RECRUIT_POOL.length - 1)];
      if (!cand) continue;
      if (picks.includes(cand.id)) continue;
      if (isAlreadyOnTeam(state, cand.id)) continue;
      picks.push(cand.id);
    }

    return picks;
  }

  function computeRecruitSuccessProb(state, cand) {
    if (!cand) return 0.0;
    if (cand.guaranteed) return 1.0;

    const school = SD_DATA.clamp(state.school?.prestige ?? 35, 0, 100) / 100;

    const pPow = SD_DATA.totalPower(state.player.stats || {});
    // だいたい 0..100 に正規化する想定（totalPowerが最大600なら割る）
    const player = SD_DATA.clamp(pPow / 6, 0, 100) / 100;

    let prob = 0.10 + school * 0.35 + player * 0.35; // 0.10〜0.80くらい

    // レアは難しい
    if (cand.rarity === "rare") prob -= 0.18;

    prob = SD_DATA.clamp(prob, 0.05, 0.85);
    return prob;
  }

  function makeMemberFromRecruit(cand) {
    // SD_DATA.makeTeamMembers() と同じ形に寄せる
    // statsは簡易：学年×レア補正で生成
    const rarity = cand.rarity;
    const stats = SD_DATA.genStatsByGrade(cand.grade, rarity);
    return {
      name: cand.name,
      grade: cand.grade,
      rarity,
      stats,
      recruitId: cand.id,
      portrait: cand.portrait || ASSET_FALLBACK_PORTRAIT,
      runner: cand.runner || ASSET_FALLBACK_RUNNER,
    };
  }

  // ----------------------------
  // Scene init (practice用) - 既存の canvas はそのまま利用
  // ----------------------------
  function initScene() {
    const canvas = document.getElementById("sceneCanvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");

    // フルスクリーン演出用に、表示時にリサイズされる（UI側で呼ぶ）
    const scene = makeSceneRenderer(canvas, ctx);
    window.SD_SCENE = scene;
    return scene;
  }

  function makeSceneRenderer(canvas, ctx) {
    let raf = 0;
    let t = 0;

    const runner = { x: 110, y: 0 };

    function fitToViewport() {
      const w = Math.max(320, window.innerWidth || 360);
      const h = Math.max(520, window.innerHeight || 640);
      canvas.width = w;
      canvas.height = h;
      runner.y = Math.floor(h * 0.60);
    }

    function drawBackground() {
      const w = canvas.width, h = canvas.height;

      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(235,240,255,1)");
      g.addColorStop(1, "rgba(210,220,245,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // コース
      ctx.fillStyle = "rgba(220,60,60,0.20)";
      ctx.fillRect(0, Math.floor(h * 0.55), w, Math.floor(h * 0.45));

      ctx.strokeStyle = "rgba(120,120,120,0.35)";
      ctx.lineWidth = 2;
      const lanes = 4;
      for (let i = 0; i <= lanes; i++) {
        const y = Math.floor(h * 0.60) + i * 28;
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(w - 40, y);
        ctx.stroke();
      }
    }

    function drawRunner() {
      const baseX = runner.x + (Math.sin(t * 0.02) * 2);
      const baseY = runner.y + (Math.sin(t * 0.04) * 1.2);

      runner.x += 2.2;
      if (runner.x > canvas.width - 130) runner.x = 80;

      const phase = t * 0.11;
      const armA = Math.sin(phase) * 12;
      const armB = Math.sin(phase + Math.PI) * 12;
      const legA = Math.sin(phase + Math.PI/2) * 14;
      const legB = Math.sin(phase + Math.PI/2 + Math.PI) * 14;

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(baseX+12, baseY+46, 18, 7, 0, 0, Math.PI*2);
      ctx.fill();

      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate(-0.06);

      // head
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(16, -6, 10, 0, Math.PI * 2);
      ctx.fill();

      // body
      ctx.fillStyle = "rgba(220,40,40,0.92)";
      ctx.beginPath();
      ctx.roundRect(6, 6, 26, 22, 6);
      ctx.fill();

      ctx.strokeStyle = "rgba(30,30,30,0.35)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";

      // arms
      ctx.save();
      ctx.translate(10, 10);
      ctx.rotate((armA * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-12, 14);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(28, 10);
      ctx.rotate((armB * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, 14);
      ctx.stroke();
      ctx.restore();

      // legs
      ctx.lineWidth = 6;

      ctx.save();
      ctx.translate(14, 28);
      ctx.rotate((legA * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-10, 20);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(24, 28);
      ctx.rotate((legB * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, 20);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }

    function draw() {
      t += 1;
      drawBackground();
      drawRunner();
      raf = requestAnimationFrame(draw);
    }

    function start() {
      fitToViewport();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }

    return { start, fitToViewport };
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

    SD_UI.showFullscreenOverlay();
    SD_UI.setSceneCaption("練習");
    SD_UI.setRunSceneText("練習中…");
    SD_UI.ensureSceneFits();
    if (window.SD_SCENE && window.SD_SCENE.start) window.SD_SCENE.start();

    await new Promise(r => setTimeout(r, 350));

    const ids = Array.isArray(selectedIds) ? selectedIds : [];
    let idx = 1;
    for (const id of ids) {
      SD_UI.setRunSceneText(`練習中…（${idx}/${ids.length || 1}）`);
      applyTrainingOnce(state, id, idx);
      idx += 1;
      await new Promise(r => setTimeout(r, 180));
      if (state.player.retired) break;
    }

    if (!state.player.retired) {
      advanceTurn(state);
    }

    SD_UI.hideFullscreenOverlay();
    SD_UI.setActiveView("home");
    refreshAll(state);
  }

  async function applyRestTurn(state) {
    if (state.player.retired) return;

    SD_UI.showFullscreenOverlay();
    SD_UI.setSceneCaption("休息");
    SD_UI.setRunSceneText("休息で回復した。次のターンへ。");
    SD_UI.ensureSceneFits();

    // 休息は「演出7秒固定」
    applyTrainingOnce(state, "rest", 1);
    if (!state.player.retired) advanceTurn(state);
    refreshAll(state);

    await new Promise(r => setTimeout(r, 7000));

    SD_UI.hideFullscreenOverlay();
    SD_UI.setActiveView("home");
    refreshAll(state);
  }

  function ensureOffer(state) {
    const key = currentTurnKey(state);
    if (!state.recruit) state.recruit = { offerKey:"", offerIds:[] };

    if (state.recruit.offerKey !== key || !Array.isArray(state.recruit.offerIds) || state.recruit.offerIds.length !== 4) {
      state.recruit.offerKey = key;
      state.recruit.offerIds = rollRecruitOffers(state);
      save(state);
    }
  }

  function renderRecruitOverlay(state) {
    ensureOffer(state);
    const offerIds = state.recruit.offerIds || [];
    const offer = offerIds.map(poolById).filter(Boolean);

    const lines = [];
    lines.push(`<div style="font-weight:800;font-size:18px;margin-bottom:8px;">勧誘</div>`);
    lines.push(`<div style="opacity:.85;margin-bottom:10px;">このターンは4人の中から1人だけ勧誘できる。</div>`);
    lines.push(`<div style="display:flex;flex-direction:column;gap:10px;">`);

    offer.forEach((c, idx) => {
      const prob = computeRecruitSuccessProb(state, c);
      const pct = Math.round(prob * 100);
      const rarity = c.rarity === "rare" ? "レア" : "通常";
      const g = c.guaranteed ? "（必ず成功）" : "";
      lines.push(`
        <div style="border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:10px;background:rgba(0,0,0,.18);">
          <div style="display:flex;gap:10px;align-items:center;">
            <img src="${c.portrait || ASSET_FALLBACK_PORTRAIT}" alt="" style="width:64px;height:64px;object-fit:contain;background:#fff;border-radius:8px;">
            <div style="flex:1;">
              <div style="font-weight:800;">${c.name}（${c.grade}年 / ${rarity}${g} / ${c.archetype}）</div>
              <div style="opacity:.9;font-size:13px;margin-top:3px;">${c.blurb}</div>
              <div style="opacity:.85;font-size:12px;margin-top:6px;">成功率：${pct}%</div>
            </div>
            <button data-recruit-pick="${idx}" style="padding:10px 12px;border-radius:10px;border:0;font-weight:800;">勧誘</button>
          </div>
        </div>
      `);
    });

    lines.push(`</div>`);
    lines.push(`<div style="margin-top:12px;opacity:.8;font-size:12px;">※勧誘すると成否に関わらずターン終了</div>`);

    SD_UI.setSceneCaption("勧誘");
    SD_UI.setOverlayHTML(lines.join(""));
    SD_UI.showFullscreenOverlay();

    // ボタン配線
    setTimeout(() => {
      const btns = document.querySelectorAll("[data-recruit-pick]");
      btns.forEach(btn => {
        btn.addEventListener("click", async () => {
          const i = Number(btn.getAttribute("data-recruit-pick"));
          const cand = offer[i];
          if (!cand) return;

          // 確認
          const ok = confirm(`${cand.name} を勧誘しますか？（このターンは終了します）`);
          if (!ok) return;

          // 成否
          const prob = computeRecruitSuccessProb(state, cand);
          const success = Math.random() < prob;

          let msg = "";
          if (success) {
            if ((state.team || []).length >= 8) {
              msg = "枠がいっぱいで加入できなかった…（最大8人）";
            } else {
              const m = makeMemberFromRecruit(cand);
              state.team.push(m);
              msg = `${cand.name} が入部した！`;
              // 学校実績ほんの少し上げる（成功が続くと雰囲気が良くなる）
              state.school.prestige = SD_DATA.clamp((state.school.prestige ?? 35) + 1, 0, 100);
            }
          } else {
            msg = `${cand.name} は首を横に振った…`;
          }

          state.lastEvent = msg;

          // ターン終了（成否に関わらず）
          if (!state.player.retired) advanceTurn(state);
          save(state);

          SD_UI.setRunSceneText(msg);
          // 3秒見せる（テンポ用）
          await new Promise(r => setTimeout(r, 3000));

          SD_UI.hideFullscreenOverlay();
          SD_UI.setActiveView("home");
          refreshAll(state);
        });
      });
    }, 0);
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
          await applyRestTurn(state);
          return;
        }
        if (key === "recruit") {
          if (state.player.retired) return;
          // 休息と同様「別画面」で表示
          renderRecruitOverlay(state);
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

    // practice list render
    SD_UI.renderPracticeLists(PRACTICE_TEAM, PRACTICE_SOLO);

    // scene init (practice/rest/recruit overlayで使う)
    initScene();

    // modal
    wireNameModal(state);
    showNameModalIfNeeded(state);

    // wires
    wireTabs(state);
    wirePractice(state);
    wireSettings(state);
    wireEndOverlay();

    // initial view
    SD_UI.setActiveView("home");
    refreshAll(state);
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
