// game.js
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
  // Practice Items (改良：通常練習画面)
  // ※固有の文言・構成をコピーしないよう「一般的な陸上メニュー」にしています
  // ----------------------------
  const PRACTICE_ITEMS = [
    // チーム練習
    {
      id: "team_run_short",
      group: "team",
      name: "ランニング（短め）",
      desc: "基礎体力を作る。疲労は軽め。",
      effects: { STA:+2, MEN:+1, fatigue:+8 },
      tags:["safe","plus"]
    },
    {
      id: "team_run_long",
      group: "team",
      name: "ランニング（長め）",
      desc: "持久力と根性。疲労は溜まりやすい。",
      effects: { STA:+3, MEN:+1, fatigue:+14 },
      tags:["plus","fat"]
    },
    {
      id: "team_relay",
      group: "team",
      name: "リレー連携",
      desc: "技術と集中。気持ちも上がる。",
      effects: { TEC:+2, MEN:+2, fatigue:+10 },
      tags:["plus"]
    },
    {
      id: "team_dash_10",
      group: "team",
      name: "短距離ダッシュ（反復）",
      desc: "スピード刺激。疲労は中〜高。",
      effects: { SPD:+2, ACC:+2, fatigue:+15 },
      tags:["plus","fat"]
    },

    // 個人練習
    {
      id: "solo_start",
      group: "solo",
      name: "スタート練習",
      desc: "加速と反応を磨く。",
      effects: { ACC:+3, TEC:+1, fatigue:+12 },
      tags:["plus"]
    },
    {
      id: "solo_form",
      group: "solo",
      name: "フォーム確認（流し）",
      desc: "技術と再現性。疲労は軽め。",
      effects: { TEC:+3, MEN:+1, fatigue:+9 },
      tags:["safe","plus"]
    },
    {
      id: "solo_core",
      group: "solo",
      name: "体幹",
      desc: "軸を作る。ブレが減る。",
      effects: { STA:+2, TEC:+1, fatigue:+10 },
      tags:["plus"]
    },
    {
      id: "solo_steps",
      group: "solo",
      name: "ステップ＆リズム",
      desc: "動きのキレを出す。",
      effects: { SPD:+1, TEC:+2, fatigue:+11 },
      tags:["plus"]
    },
    {
      id: "solo_mental",
      group: "solo",
      name: "イメトレ／メンタル",
      desc: "集中と自信。疲労はほぼ増えない。",
      effects: { MEN:+4, fatigue:+2 },
      tags:["safe","plus"]
    },
  ];

  function getPracticeItemById(id){
    return PRACTICE_ITEMS.find(x => x.id === id) || null;
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
        retired: false
      },
      team: SD_DATA.makeTeamMembers(),
      turn: { grade: 1, month: 4, term: 1 },
      selectedMenu: "tempo",
      nextMeet: {
        name: "新人戦 地区大会",
        level: "C",
        distance: "100m",
        turnsLeft: 3,
      },
      lastEvent: "",
      lastMeetResult: "",
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
    return "積み上げた分だけ、速くなる。";
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
    if (state.lastMeetResult) return state.lastMeetResult;

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

    return "今日は何を積む？ 小さくても、ちゃんと前に進む。";
  }

  // ----------------------------
  // Training System
  // ----------------------------
  function trainingEfficiencyByFatigue(fatigue) {
    // 0%→1.00, 50%→0.75, 80%→0.55, 100%→0.40
    const eff = 1.0 - (fatigue * 0.006);
    return SD_DATA.clamp(eff, 0.40, 1.00);
  }

  // 単発行動（強化/回復）
  const ACTIONS = {
    power:   { name:"強化（筋トレ）", effects:{ POW:+4, STA:+1, fatigue:+20 }, vibe:"脚が重い。でも、明日の脚になる。" },
    massage: { name:"マッサージ",     effects:{ ALL:+1, fatigue:-20 }, vibe:"体がほぐれて、視界が明るくなる。" },
    rest:    { name:"休養",           effects:{ fatigue:-42 }, vibe:"休むのも練習。焦りだけは置いていく。" },
  };

  function injuryRoll(state, intensityMul) {
    const p = state.player;
    const f = p.fatigue;

    if (f < 65) return false;

    const base = ((f - 65) / 35); // 0..1
    const curve = Math.pow(SD_DATA.clamp(base, 0, 1), 1.35);
    let prob = curve * 0.18;
    prob *= intensityMul;

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

  function applyEffects(state, effects, intensityMul, vibeText) {
    const p = state.player;
    const s = p.stats;

    SD_UI.setSceneCaption(vibeText || "—");

    const fatigueEff = trainingEfficiencyByFatigue(p.fatigue);
    const growthEff = (p.growthTraits?.growth ?? 100) / 100;

    // 複数練習は後半ほど効率が落ちる（やり過ぎ防止）
    const mult = fatigueEff * growthEff;

    if (effects.ALL) {
      for (const k of ["SPD","ACC","POW","TEC","STA","MEN"]) {
        s[k] = clampStat((s[k] ?? 0) + Math.max(0, Math.round(effects.ALL * mult)));
      }
    } else {
      for (const k of ["SPD","ACC","POW","TEC","STA","MEN"]) {
        if (effects[k]) s[k] = clampStat((s[k] ?? 0) + Math.max(0, Math.round(effects[k] * mult)));
      }
    }

    if (typeof effects.fatigue === "number") {
      p.fatigue = SD_DATA.clamp((p.fatigue ?? 0) + effects.fatigue, 0, 100);
    }

    // 怪我判定（回復はほぼ無し）
    if (intensityMul > 0.01) {
      const injured = injuryRoll(state, intensityMul);
      if (injured) {
        applyInjury(state);
        SD_UI.setSceneCaption("ピキッ…と嫌な感触。胸が冷える。");
      }
      if (!p.retired && p.fatigue >= 100) {
        applyInjury(state);
        SD_UI.setSceneCaption("限界を越えた。足が言うことをきかない。");
      }
    }

    // チーム波及（軽量）
    if (!p.retired && intensityMul > 0.01) {
      const teamMult = 0.25;
      for (const m of state.team) {
        const keys = Object.entries(m.stats).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);
        const k1 = keys[0];
        const k2 = keys[1];
        m.stats[k1] = clampStat((m.stats[k1] ?? 0) + Math.max(1, Math.round(teamMult)));
        m.stats[k2] = clampStat((m.stats[k2] ?? 0) + Math.max(0, Math.round(teamMult)));
      }
      recalcTeamPowers(state);
    }
  }

  // ----------------------------
  // Meet (大会) MVP
  // ----------------------------
  function meetDifficultyMultiplier(level) {
    return (level === "S") ? 1.25
      : (level === "A") ? 1.15
      : (level === "B") ? 1.07
      : 1.00;
  }

  function calcPlayerRacePower(state) {
    const p = state.player;
    const s = p.stats || {};
    const base =
      (s.SPD ?? 0) * 0.34 +
      (s.ACC ?? 0) * 0.26 +
      (s.TEC ?? 0) * 0.18 +
      (s.STA ?? 0) * 0.12 +
      (s.MEN ?? 0) * 0.10;

    const f = SD_DATA.clamp(p.fatigue ?? 0, 0, 100);
    const fatigueMul = SD_DATA.clamp(1.0 - (f * 0.0038), 0.62, 1.00);

    const inj = p.injuryCount ?? 0;
    const injuryMul = SD_DATA.clamp(1.0 - inj * 0.06, 0.80, 1.00);

    const rng = 0.92 + Math.random() * 0.16;
    return base * fatigueMul * injuryMul * rng;
  }

  function simulateMeet(state) {
    const m = state.nextMeet;
    const diff = meetDifficultyMultiplier(m.level);

    const grade = state.player.grade ?? 1;
    const reqBase = 48 + grade * 9;
    const req = reqBase * diff;

    const score = calcPlayerRacePower(state);

    let tier = "敗退";
    if (score >= req * 1.10) tier = "優勝";
    else if (score >= req * 1.04) tier = "入賞";
    else if (score >= req * 0.98) tier = "通過";
    else tier = "敗退";

    const p = state.player;
    const s = p.stats;

    const gainAll = (tier === "優勝") ? 2 : (tier === "入賞") ? 1 : 0;
    const gainMen = (tier === "優勝") ? 4 : (tier === "入賞") ? 2 : (tier === "通過") ? 1 : -1;
    const fatigueAdd = (tier === "優勝") ? 18 : (tier === "入賞") ? 16 : (tier === "通過") ? 15 : 14;

    for (const k of ["SPD","ACC","POW","TEC","STA","MEN"]) {
      if (gainAll > 0) s[k] = clampStat((s[k] ?? 0) + gainAll);
    }
    s.MEN = clampStat((s.MEN ?? 0) + gainMen);
    p.fatigue = SD_DATA.clamp((p.fatigue ?? 0) + fatigueAdd, 0, 100);

    const headline = `【大会】${m.name}（${m.distance} / 難易度${m.level}）`;
    let line = "";
    if (tier === "優勝") line = `${headline}：優勝。会場が少し静かになって、次に歓声が来た。`;
    else if (tier === "入賞") line = `${headline}：入賞。結果が形になった。自信は静かに強い。`;
    else if (tier === "通過") line = `${headline}：通過。課題は残る。でも、前には進んだ。`;
    else line = `${headline}：敗退。悔しい。だが、悔しさは次の練習に変えられる。`;

    state.lastMeetResult = line;
    SD_UI.setCoachSub(`レース力 ${score.toFixed(1)} / 目安 ${req.toFixed(1)}（疲労:${p.fatigue}%）`);

    state.nextMeet = generateNextMeet(state, tier);
  }

  function generateNextMeet(state, tier) {
    const old = state.nextMeet;
    const lvOrder = ["C","B","A","S"];
    const idx = lvOrder.indexOf(old.level);
    const bump = (tier === "優勝") ? 2 : (tier === "入賞") ? 1 : (tier === "通過") ? 1 : 0;
    const nextIdx = Math.min(lvOrder.length - 1, Math.max(0, idx + bump));

    const grade = state.player.grade ?? 1;
    const month = state.turn.month ?? 4;

    const pool = [
      "春季記録会",
      "地区チャレンジ",
      "ブロック記録会",
      "選考会",
      "夏前記録会",
      "県トライアル",
      "広域チャレンジ",
      "全国前哨戦",
    ];
    const name = pool[(month + grade) % pool.length];

    const dist = (Math.random() < 0.65) ? "100m" : "400m";
    const level = lvOrder[nextIdx];
    return { name, level, distance: dist, turnsLeft: 3 };
  }

  // ----------------------------
  // Turn Advance
  // ----------------------------
  function advanceTurn(state) {
    if (state.player.retired) return;

    // 大会結果は「次の行動まで表示」したいので、ここでは消さない（UI更新時に優先表示）
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

    randBtn?.addEventListener("click", () => {
      if (input) {
        input.value = SD_DATA.randomPlayerName();
        input.focus();
      }
    });

    saveBtn?.addEventListener("click", () => applyName(input ? input.value : ""));

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyName(input.value);
    });

    back?.addEventListener("click", (e) => {
      if (e.target === back) {
        // 名前必須：背景クリックでは閉じない
      }
    });
  }

  // ----------------------------
  // Practice Modal (最大3つ)
  // ----------------------------
  function wirePracticeModal(state, onAfterAction) {
    const openBtn = document.getElementById("openPracticeBtn");
    const back = document.getElementById("practiceModalBackdrop");
    const cancelBtn = document.getElementById("practiceCancelBtn");
    const confirmBtn = document.getElementById("practiceConfirmBtn");

    let picked = new Set();

    function refreshPickUI(){
      SD_UI.setPracticePickCount(picked.size);
      if (confirmBtn) confirmBtn.disabled = picked.size === 0;
    }

    function clearPick(){
      picked = new Set();
      // チェック外す
      back?.querySelectorAll('input[type="checkbox"][data-pid]')?.forEach(ch => ch.checked = false);
      refreshPickUI();
    }

    function open(){
      if (state.player.retired) return;
      if (!state.player.name || !state.player.name.trim()) {
        SD_UI.openNameModal();
        return;
      }

      // 描画（初回のみでもOKだが、後で増える想定なので毎回OK）
      SD_UI.renderPracticeLists(PRACTICE_ITEMS);
      clearPick();
      SD_UI.openPracticeModal();
    }

    function close(){
      SD_UI.closePracticeModal();
    }

    // クリックでトグル（ラベル全体押しやすく）
    function bindListClicks(){
      back?.addEventListener("click", (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;

        const pid = target.getAttribute("data-pid") || target.closest("[data-pid]")?.getAttribute("data-pid");
        if (!pid) return;

        const checkbox = back.querySelector(`input[type="checkbox"][data-pid="${pid}"]`);
        if (!checkbox) return;

        // checkbox直押しもラベル押しも同じ挙動
        const willCheck = !checkbox.checked;

        if (willCheck && picked.size >= 3) {
          // 最大3つ
          SD_UI.setTurnStateText("通常練習は最大3つまでです");
          return;
        }

        checkbox.checked = willCheck;

        if (checkbox.checked) picked.add(pid);
        else picked.delete(pid);

        refreshPickUI();
      }, { passive: true });
    }

    openBtn?.addEventListener("click", open);
    cancelBtn?.addEventListener("click", close);

    // 背景クリックで閉じる（誤操作防止：閉じるが選択は保持しない）
    back?.addEventListener("click", (e) => {
      if (e.target === back) close();
    });

    confirmBtn?.addEventListener("click", () => {
      if (state.player.retired) return;
      if (picked.size === 0) return;

      // 実行：選択した順は「チェック順」ではなく、安定のためid順（後でUI側で順番付けも可能）
      const ids = Array.from(picked);
      const items = ids.map(getPracticeItemById).filter(Boolean);

      // 合計の感じ：後半ほど効率ダウン（multはapplyEffects側で疲労反映されるので自然に落ちる）
      // intensity: 通常練習は中程度として 1.0
      for (let i = 0; i < items.length; i++){
        const it = items[i];
        const intensity = 1.0;
        const vibe = (i === 0)
          ? `「${it.name}」…よし。`
          : `続けて「${it.name}」。`;
        applyEffects(state, it.effects, intensity, vibe);
      }

      // シーン（見た目だけ）を通常練習モードに寄せる
      state.selectedMenu = "tempo";
      if (window.SD_SCENE) SD_SCENE.setMode("tempo");

      close();

      // ターン進行
      advanceTurn(state);

      // 大会開催
      if (!state.player.retired && state.nextMeet.turnsLeft <= 0) {
        simulateMeet(state);
      }

      onAfterAction("通常練習を実行");
      save(state);
    });

    bindListClicks();
    refreshPickUI();
  }

  // ----------------------------
  // Single actions (強化/回復) : 即実行→自動ターン
  // ----------------------------
  function wireSingleActions(state, onAfterAction) {
    const btns = document.querySelectorAll('button[data-action]');
    btns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (state.player.retired) return;

        if (!state.player.name || !state.player.name.trim()) {
          SD_UI.openNameModal();
          return;
        }

        const key = btn.getAttribute("data-action");
        const act = ACTIONS[key];
        if (!act) return;

        const intensity = (key === "rest" || key === "massage") ? 0.01 : 1.25;
        SD_UI.setSceneCaption(act.vibe);

        // 回復のALL効果を処理
        const eff = act.effects;
        const vibe = act.vibe;

        applyEffects(state, eff, intensity, vibe);

        // シーンモード調整
        state.selectedMenu = key;
        if (window.SD_SCENE) SD_SCENE.setMode(key);

        // ターン進行
        advanceTurn(state);

        // 大会開催
        if (!state.player.retired && state.nextMeet.turnsLeft <= 0) {
          simulateMeet(state);
        }

        onAfterAction(`${act.name} を実行`);
        save(state);
      });
    });
  }

  // ----------------------------
  // UI reflect
  // ----------------------------
  function reflectUI(state) {
    const t = state.turn;
    SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
    SD_UI.setNextMeet(nextMeetText(state));
    SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");

    SD_UI.renderStats(state.player);
    SD_UI.renderTeam(state.team);

    SD_UI.setCoachLine(coachLineForTurn(state));
    if (!state.lastMeetResult) SD_UI.setCoachSub("—");

    SD_UI.setTurnStateText("行動を選んでください");

    SD_UI.setAtmosphereText(atmosphereText(state));
    SD_UI.setSceneCaption(sceneCaption(state));
  }

  function lockActionsIfRetired(state) {
    if (!state.player.retired) return;
    const btns = document.querySelectorAll("button");
    btns.forEach(b => {
      if (b.id === "nameRandomBtn" || b.id === "nameSaveBtn") return;
      b.disabled = true;
    });
    SD_UI.setSceneCaption("— 引退 END — もう一度走りたくなったら、最初から。");
    SD_UI.setCoachSub("—");
  }

  // ----------------------------
  // Scene (Canvas) : スマホで綺麗に（DPR対応）
  // ----------------------------
  function initScene(state) {
    const canvas = document.getElementById("sceneCanvas");
    const ctx = canvas.getContext("2d");

    const scene = makeSceneRenderer(canvas, ctx);
    window.SD_SCENE = scene;

    // DPR対応：表示サイズに合わせて内部解像度を上げる
    function resizeCanvas() {
      const dpr = Math.max(1, Math.min(2.2, window.devicePixelRatio || 1));
      const cssW = canvas.clientWidth || 940;
      const cssH = Math.round(cssW * (360 / 940)); // アスペクト維持
      canvas.style.height = cssH + "px";

      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.setViewport(cssW, cssH);
    }

    window.addEventListener("resize", resizeCanvas, { passive:true });
    resizeCanvas();

    scene.setMode(state.selectedMenu);
    scene.start();
  }

  function makeSceneRenderer(canvas, ctx) {
    let raf = 0;
    let mode = "tempo";
    let t = 0;
    let vw = 940, vh = 360;

    const runner = { x: 110, y: 250, speed: 1.2 };

    function setMode(m) { mode = m; }
    function setViewport(w,h){ vw = w; vh = h; }

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

    function drawBackground() {
      // 明るいグラデ（原作寄せの“爽やかさ”）
      const g = ctx.createLinearGradient(0, 0, 0, vh);
      g.addColorStop(0, "rgba(240,244,252,1)");
      g.addColorStop(1, "rgba(229,234,246,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);

      // 遠景
      ctx.fillStyle = "rgba(27,111,227,0.08)";
      ctx.fillRect(0, Math.round(vh*0.18), vw, Math.round(vh*0.10));

      // トラック
      const top = Math.round(vh*0.40);
      const bot = Math.round(vh*0.92);
      ctx.fillStyle = "rgba(226,28,42,0.08)";
      ctx.fillRect(0, top, vw, bot-top);

      ctx.strokeStyle = "rgba(32,37,49,0.14)";
      ctx.lineWidth = 2;
      const lanes = 4;
      for (let i = 0; i <= lanes; i++) {
        const y = top + i * Math.round((bot-top)/lanes);
        ctx.beginPath();
        ctx.moveTo(18, y);
        ctx.lineTo(vw - 18, y);
        ctx.stroke();
      }

      // 斜めの流れ
      ctx.strokeStyle = "rgba(27,111,227,0.08)";
      for (let i = -vw; i < vw*2; i += 28) {
        ctx.beginPath();
        ctx.moveTo(i + (t*0.6)%28, top);
        ctx.lineTo(i + (t*0.6)%28 + 160, bot);
        ctx.stroke();
      }
    }

    function drawRunner() {
      const baseY = Math.round(vh*0.74);
      const baseX = runner.x + (Math.sin(t * 0.02) * 2);

      const sp = (mode === "rest") ? 0.2
        : (mode === "massage") ? 0.6
        : (mode === "power") ? 1.0
        : 1.25;

      runner.speed = sp;
      runner.x += sp * 0.55;
      if (runner.x > vw - 130) runner.x = 90;

      const phase = t * 0.07 * sp;
      const armA = Math.sin(phase) * 10;
      const armB = Math.sin(phase + Math.PI) * 10;
      const legA = Math.sin(phase + Math.PI/2) * 12;
      const legB = Math.sin(phase + Math.PI/2 + Math.PI) * 12;

      // 影
      ctx.fillStyle = "rgba(32,37,49,0.18)";
      ctx.beginPath();
      ctx.ellipse(baseX+16, baseY+46, 18, 7, 0, 0, Math.PI*2);
      ctx.fill();

      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate(-0.06);

      // head
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.arc(18, -6, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(32,37,49,0.14)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // body（赤ユニ）
      ctx.fillStyle = "rgba(226,28,42,0.22)";
      roundRect(ctx, 8, 6, 28, 22, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(226,28,42,0.22)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // limbs
      ctx.strokeStyle = "rgba(32,37,49,0.55)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";

      ctx.save();
      ctx.translate(12, 10);
      ctx.rotate((armA * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-10, 12);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(32, 10);
      ctx.rotate((armB * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10, 12);
      ctx.stroke();
      ctx.restore();

      ctx.lineWidth = 6;

      ctx.save();
      ctx.translate(16, 28);
      ctx.rotate((legA * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-8, 18);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(26, 28);
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
      ctx.clearRect(0, 0, vw, vh);
      drawBackground();
      drawRunner();
      raf = requestAnimationFrame(draw);
    }

    function start() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    }

    return { start, setMode, setViewport };
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
    SD_UI.setSceneTitle("通常練習");

    SD_UI.setNextMeet(nextMeetText(state));
    SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");
    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setCoachSub("—");
    SD_UI.setTurnStateText("行動を選んでください");

    const t = state.turn;
    SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });

    SD_UI.renderStats(state.player);
    SD_UI.renderTeam(state.team);

    // scene
    initScene(state);

    // modal
    wireNameModal(state);
    showNameModalIfNeeded(state);

    // after action hook
    const onAfterAction = (label) => {
      SD_UI.setTurnStateText(`${label} → 次ターンへ`);
      reflectUI(state);
      lockActionsIfRetired(state);
    };

    // actions
    wireSingleActions(state, onAfterAction);
    wirePracticeModal(state, onAfterAction);

    lockActionsIfRetired(state);

    save(state);
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
