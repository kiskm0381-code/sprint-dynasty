// game.js
// 目的：疲労が「戦略」になる／怪我が「代償」になる／3回で引退END
// 改良：
//  - 「次ターンへ」ボタン廃止：行動を選ぶと自動で次ターンへ
//  - 改良4：大会（開催・結果・次大会へ）実装
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
      selectedMenu: "tempo",
      nextMeet: {
        // 改良4：大会を“イベント”として扱う
        name: "新人戦 地区大会",
        level: "C",          // 難易度：C/B/A/S（MVP）
        distance: "100m",    // 表示だけ（MVP）
        turnsLeft: 3,        // 0で開催
      },
      flags: {
        campSummer: false,
        campWinter: false,
        allJapanCamp: false,
      },
      lastEvent: "",
      lastMeetResult: "",   // ★改良4：大会結果ログ
    };
  }

  // ----------------------------
  // Flavor Text
  // ----------------------------
  function atmosphereText(state) {
    const m = state.turn.month;
    if (m <= 5) return "夕方、風が少し冷たい。";
    if (m <= 8) return "夏の匂い。汗が真っ直ぐになる。";
    if (m <= 10) return "空が高い。呼吸が澄んでいく。";
    return "冷えた空気。足音がよく響く。";
  }

  function sceneCaption(state) {
    if (state.player.retired) return "走れなくても、君の青春は消えない。";
    if (state.lastMeetResult) return "勝負の一瞬は、積み重ねの答え合わせだ。";
    const meet = state.nextMeet;
    if (meet.turnsLeft <= 1) return "次は勝負。迷いを削っていこう。";
    return "春風高校は弱小。でも、積み上げた分だけ速くなる。";
  }

  function nextMeetText(state) {
    const m = state.nextMeet;
    if (m.turnsLeft <= 0) return `${m.name}（開催）`;
    return `${m.name}（あと${m.turnsLeft}ターン）`;
  }

  function coachLineForTurn(state) {
    if (state.player.retired) {
      return "よく頑張った。結果だけが全てじゃない。君の走りは、君のものだ。";
    }

    // 大会結果が直近に出たらそれを優先
    if (state.lastMeetResult) {
      return state.lastMeetResult;
    }

    if (state.lastEvent && state.lastEvent.includes("怪我")) {
      return "今は治すことが最優先だよ。焦りは、痛みより長引くからね。";
    }

    const meet = state.nextMeet;
    if (meet.turnsLeft <= 2 && meet.turnsLeft >= 1) {
      return `あと${meet.turnsLeft}ターンで${meet.name}。追い込みは“やりすぎない”のが強い。`;
    }

    const f = state.player.fatigue;
    if (f >= 80) return "無理は禁物だよ。休むのも立派な練習だ。";
    if (f >= 55) return "疲れが溜まってきたね。回復も予定に入れよう。";

    const s = state.player.stats;
    const pairs = Object.entries(s).sort((a,b)=>a[1]-b[1]);
    const weakest = pairs[0][0];
    const hint = {
      SPD:"スピード", ACC:"加速", POW:"筋力", TEC:"技術", STA:"持久", MEN:"メンタル"
    }[weakest] || "基礎";

    return `${hint}を少し意識してみよう。丁寧にいこう。`;
  }

  // ----------------------------
  // Menu
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
      rest: "休養",
    };
    SD_UI.setSceneTitle(map[menuKey] || "練習");
  }

  // ----------------------------
  // Training System (fatigue efficiency + injury)
  // ----------------------------
  function trainingEfficiencyByFatigue(fatigue) {
    // 0%→1.00, 50%→0.75, 80%→0.55, 100%→0.40
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
      for (const k of ["SPD","ACC","POW","TEC","STA","MEN"]) {
        s[k] = clampStat(s[k] + Math.max(0, Math.round(base.all * mult)));
      }
    } else {
      for (const k of ["SPD","ACC","POW","TEC","STA","MEN"]) {
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

    // チーム波及（軽量）
    const teamMult = 0.30;
    if (!p.retired && action !== "rest") {
      for (const m of state.team) {
        const keys = Object.entries(m.stats).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);
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
  // 改良4：大会（MVP）
  // ----------------------------
  function meetDifficultyMultiplier(level) {
    // 高いほど厳しい（要求値が上がる）
    return (level === "S") ? 1.25
      : (level === "A") ? 1.15
      : (level === "B") ? 1.07
      : 1.00; // C
  }

  function calcPlayerRacePower(state) {
    // レースパワー：SPD/ACC/TEC中心 + STA/MEN少し
    const p = state.player;
    const s = p.stats || {};
    const base =
      (s.SPD ?? 0) * 0.34 +
      (s.ACC ?? 0) * 0.26 +
      (s.TEC ?? 0) * 0.18 +
      (s.STA ?? 0) * 0.12 +
      (s.MEN ?? 0) * 0.10;

    // 疲労ペナルティ（0%→1.0 / 80%→0.75 / 100%→0.62）
    const f = SD_DATA.clamp(p.fatigue ?? 0, 0, 100);
    const fatigueMul = SD_DATA.clamp(1.0 - (f * 0.0038), 0.62, 1.00);

    // 怪我ペナルティ（怪我回数で少し落ちる）
    const inj = p.injuryCount ?? 0;
    const injuryMul = SD_DATA.clamp(1.0 - inj * 0.06, 0.80, 1.00);

    // ブレ（当日の感覚）
    const rng = 0.92 + Math.random() * 0.16; // 0.92..1.08

    return base * fatigueMul * injuryMul * rng;
  }

  function simulateMeet(state) {
    const m = state.nextMeet;
    const diff = meetDifficultyMultiplier(m.level);

    // 目安要求値（MVP）：学年が上がるほど要求も上がる
    const grade = state.player.grade ?? 1;
    const reqBase = 48 + grade * 9; // 1年:57, 2年:66, 3年:75
    const req = reqBase * diff;

    const score = calcPlayerRacePower(state);

    // 判定：大雑把に「通過/入賞/優勝」まで用意（演出はテキスト）
    let tier = "敗退";
    if (score >= req * 1.10) tier = "優勝";
    else if (score >= req * 1.04) tier = "入賞";
    else if (score >= req * 0.98) tier = "通過";
    else tier = "敗退";

    // 報酬：結果が良いほど成長 + メンタル上昇 / 疲労も増える
    const p = state.player;
    const s = p.stats;

    const gainAll = (tier === "優勝") ? 2
      : (tier === "入賞") ? 1
      : (tier === "通過") ? 0
      : 0;

    const gainMen = (tier === "優勝") ? 4
      : (tier === "入賞") ? 2
      : (tier === "通過") ? 1
      : -1;

    // 疲労（大会は重い）
    const fatigueAdd = (tier === "優勝") ? 18
      : (tier === "入賞") ? 16
      : (tier === "通過") ? 15
      : 14;

    // 反映（最低0で丸め）
    for (const k of ["SPD","ACC","POW","TEC","STA","MEN"]) {
      if (gainAll > 0) s[k] = clampStat((s[k] ?? 0) + gainAll);
    }
    s.MEN = clampStat((s.MEN ?? 0) + gainMen);

    p.fatigue = SD_DATA.clamp((p.fatigue ?? 0) + fatigueAdd, 0, 100);

    // 結果文
    const headline =
      `【大会】${m.name}（${m.distance} / 難易度${m.level}）`;

    let line = "";
    if (tier === "優勝") line = `${headline}：優勝。会場が少し静かになって、次に歓声が来た。`;
    else if (tier === "入賞") line = `${headline}：入賞。結果が形になった。自信は静かに強い。`;
    else if (tier === "通過") line = `${headline}：通過。課題は残る。でも、前には進んだ。`;
    else line = `${headline}：敗退。悔しい。だが、悔しさは次の練習に変えられる。`;

    // ここでは「次大会に進む」概念はMVP：勝ちでも負けでも次大会へ
    state.lastMeetResult = line;

    // 大会直後の一言（右下の補助テキスト）
    SD_UI.setCoachSub(`レースパワー ${score.toFixed(1)} / 目安 ${req.toFixed(1)}（疲労:${p.fatigue}%）`);

    // 次大会を生成（簡易：難易度が少しずつ上がる）
    state.nextMeet = generateNextMeet(state, tier);
  }

  function generateNextMeet(state, tier) {
    // 月が進むごとに大会感を増す（MVP）
    // 難易度の上がり方は「通過以上で上がりやすい」
    const old = state.nextMeet;
    const lvOrder = ["C","B","A","S"];
    const idx = lvOrder.indexOf(old.level);
    const bump = (tier === "優勝") ? 2 : (tier === "入賞") ? 1 : (tier === "通過") ? 1 : 0;
    const nextIdx = Math.min(lvOrder.length - 1, Math.max(0, idx + bump));

    const grade = state.player.grade ?? 1;
    const month = state.turn.month ?? 4;

    // 名前はオリジナル（既存作品の固有名を避ける）
    const pool = [
      "春季記録会",
      "地区チャレンジ",
      "ブロック記録会",
      "選考会",
      "夏前記録会",
      "県トライアル",
      "近畿チャレンジ",
      "全国前哨戦",
    ];
    const name = pool[(month + grade) % pool.length];

    const dist = (Math.random() < 0.65) ? "100m" : "400m";
    const level = lvOrder[nextIdx];

    // 3ターン後に開催、に固定（テンポ良く）
    return { name, level, distance: dist, turnsLeft: 3 };
  }

  // ----------------------------
  // Turn Advance
  // ----------------------------
  function advanceTurn(state) {
    if (state.player.retired) return;

    // ターン開始時の大会結果ログは、1ターン表示したら消す（ログはstateに残してもOKだがMVPは軽く）
    // →「大会の余韻」を残したいなら消さない運用に変更可能
    // ここでは “次の行動までの間だけ表示” にするため、ターン進行時にクリアする
    state.lastMeetResult = "";

    // 次大会までカウント
    if (state.nextMeet.turnsLeft > 0) state.nextMeet.turnsLeft -= 1;

    // 年月ターン進行
    state.turn.term += 1;
    if (state.turn.term >= 4) {
      state.turn.term = 1;
      state.turn.month += 1;

      if (state.turn.month === 13) {
        state.turn.month = 4;
        state.turn.grade += 1;
        state.player.grade = state.turn.grade;

        // チーム進級（簡易）
        for (const m of state.team) m.grade = Math.min(3, m.grade + 1);
      }
    }

    // ターン開始の空気
    state.lastEvent = "";
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
        if (input) {
          input.value = SD_DATA.randomPlayerName();
          input.focus();
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        applyName(input ? input.value : "");
      });
    }

    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") applyName(input.value);
      });
    }

    if (back) {
      back.addEventListener("click", (e) => {
        // 名前必須：背景クリックでは閉じない
        if (e.target === back) {
          // do nothing
        }
      });
    }
  }

  // ----------------------------
  // Actions (自動で次ターンへ)
  // ----------------------------
  function reflectUI(state) {
    const t = state.turn;
    SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
    SD_UI.setNextMeet(nextMeetText(state));
    SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");

    SD_UI.renderStats(state.player);
    SD_UI.renderTeam(state.team);

    // 監督コメント
    SD_UI.setCoachLine(coachLineForTurn(state));

    // 状態表示
    SD_UI.setTurnStateText("行動を選んでください");
  }

  function reflectAfterAction(state, actionLabel) {
    // 行動直後：補助テキスト
    SD_UI.setTurnStateText(`「${actionLabel}」を実行 → 次ターンへ進みます`);
  }

  function lockActionsIfRetired(state) {
    if (!state.player.retired) return;
    const btns = document.querySelectorAll("button[data-action]");
    btns.forEach(b => b.disabled = true);

    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setSceneCaption("— 引退 END — もう一度走りたくなったら、また最初から。");
    SD_UI.setCoachSub("—");
  }

  function actionLabel(action) {
    const map = {
      start: "スタート練習",
      tempo: "流し（フォーム）",
      power: "筋トレ",
      core: "体幹",
      mental: "メンタル",
      massage: "マッサージ",
      rest: "休養",
    };
    return map[action] || "行動";
  }

  function wireActions(state) {
    const btns = document.querySelectorAll("button[data-action]");
    btns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (state.player.retired) return;

        // 名前未設定なら先に入力
        if (!state.player.name || !state.player.name.trim()) {
          SD_UI.openNameModal();
          return;
        }

        const action = btn.getAttribute("data-action");
        if (!action) return;

        // まず現在ターンで行動を実行
        setMenu(state, action);
        applyTraining(state, action);

        reflectAfterAction(state, actionLabel(action));

        // シーン反映
        if (window.SD_SCENE) SD_SCENE.setMode(state.selectedMenu);

        // ★ 自動で次ターンへ
        advanceTurn(state);

        // 大会開催判定（改良4）
        if (!state.player.retired && state.nextMeet.turnsLeft <= 0) {
          simulateMeet(state);
        }

        // 最終UI反映
        reflectUI(state);

        // 引退ならロック
        lockActionsIfRetired(state);

        save(state);
      });
    });
  }

  // ----------------------------
  // Scene (Canvas) : 既存路線を維持（見た目はCSS側で統一感）
  // ----------------------------
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

    const runner = { x: 110, y: 250, speed: 1.6 };

    function setMode(m) { mode = m; }

    function drawBackground() {
      const w = canvas.width, h = canvas.height;

      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(15,22,34,0.98)");
      g.addColorStop(1, "rgba(8,12,20,0.98)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // upper haze
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(0, 90, w, 60);

      // particles
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 220; i++) {
        const x = (i * 17 + (t*1.0)) % w;
        const y = 95 + (i % 4) * 14 + (Math.sin(i + t*0.01) * 1.5);
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // track field
      ctx.fillStyle = "rgba(58,167,255,0.10)";
      ctx.fillRect(0, 165, w, 190);

      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 2;
      for (let i = -w; i < w*2; i += 28) {
        ctx.beginPath();
        ctx.moveTo(i + (t*0.65)%28, 165);
        ctx.lineTo(i + (t*0.65)%28 + 190, 355);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      const lanes = 4;
      for (let i = 0; i <= lanes; i++) {
        const y = 195 + i * 30;
        ctx.beginPath();
        ctx.moveTo(70, y);
        ctx.lineTo(w - 70, y);
        ctx.stroke();
      }

      // posts
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(86, 180, 4, 160);
      ctx.fillRect(w-90, 180, 4, 160);
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

    function drawRunner() {
      const baseX = runner.x + (Math.sin(t * 0.02) * 2);
      const baseY = runner.y + (Math.sin(t * 0.04) * 1.2);

      const sp = (mode === "rest") ? 0.2
        : (mode === "massage") ? 0.6
        : (mode === "mental") ? 0.9
        : (mode === "core") ? 1.1
        : (mode === "tempo") ? 1.25
        : (mode === "start") ? 1.4
        : (mode === "power") ? 1.0
        : 1.1;

      runner.speed = sp;
      runner.x += sp * 0.35;
      if (runner.x > canvas.width - 130) runner.x = 110;

      const phase = t * 0.06 * sp;
      const armA = Math.sin(phase) * 10;
      const armB = Math.sin(phase + Math.PI) * 10;
      const legA = Math.sin(phase + Math.PI/2) * 12;
      const legB = Math.sin(phase + Math.PI/2 + Math.PI) * 12;

      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.beginPath();
      ctx.ellipse(baseX+12, baseY+44, 16, 6, 0, 0, Math.PI*2);
      ctx.fill();

      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate(-0.08);

      // head
      ctx.fillStyle = "rgba(255,255,255,0.86)";
      ctx.beginPath();
      ctx.arc(16, -6, 10, 0, Math.PI * 2);
      ctx.fill();

      // body
      ctx.fillStyle = "rgba(255, 74, 87, 0.30)";
      roundRect(ctx, 6, 6, 26, 22, 7);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,0.18)";
      roundRect(ctx, 12, 12, 14, 10, 4);
      ctx.fill();

      // limbs
      ctx.strokeStyle = "rgba(255,255,255,0.78)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";

      ctx.save();
      ctx.translate(10, 10);
      ctx.rotate((armA * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-10, 12);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(28, 10);
      ctx.rotate((armB * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10, 12);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = "rgba(255,255,255,0.82)";
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

      ctx.restore();
    }

    function draw() {
      t += 1;
      drawBackground();
      drawRunner();

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

    recalcTeamPowers(state);

    // 初期UI
    SD_UI.setAtmosphereText(atmosphereText(state));
    SD_UI.setSceneCaption(sceneCaption(state));
    SD_UI.setSceneTitle("フォーム意識（流し）");

    SD_UI.renderStats(state.player);
    SD_UI.renderTeam(state.team);

    SD_UI.setNextMeet(nextMeetText(state));
    SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");
    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setCoachSub("—");
    SD_UI.setTurnStateText("行動を選んでください");

    const t = state.turn;
    SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });

    // scene
    initScene(state);

    // modal
    wireNameModal(state);
    showNameModalIfNeeded(state);

    // actions
    wireActions(state);
    lockActionsIfRetired(state);

    save(state);
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
