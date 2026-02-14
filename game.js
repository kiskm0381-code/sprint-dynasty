// game.js
// ホーム画面：ターン進行・練習・疲労・怪我（改良3）
// 目的：疲労が「戦略」になる／怪我が「代償」になる／3回で引退END

(function () {
  const KEY = "sd_save_v1";
  const KEY_PLAYER_NAME = "sd_player_name"; // 互換用（名前だけ単独でも保存）

  // ----------------------------
  // Save / Load
  // ----------------------------
  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      if (state?.player?.name) localStorage.setItem(KEY_PLAYER_NAME, state.player.name);
    } catch (e) {
      console.warn("[SD] save failed:", e);
    }
  }
  function load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // ----------------------------
  // Default State
  // ----------------------------
  function defaultState() {
    const rarity = "normal";
    const stats = SD_DATA.genStatsByGrade(1, rarity);

    // もし「名前だけ保存」が先に存在してたら拾う（モーダルが閉じない時の救済）
    const savedName = (localStorage.getItem(KEY_PLAYER_NAME) || "").trim();

    return {
      player: {
        name: savedName || "",
        grade: 1,
        stats,
        fatigue: 0,
        injuryCount: 0,
        growthTraits: SD_DATA.genGrowthTraits(),
        formBonusActive: false,
        retired: false,
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
      },
      lastEvent: "", // 直近イベント文（怪我など）
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

    // 怪我直後は固定コメント
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
    const hint = {
      SPD: "スピード",
      ACC: "加速",
      POW: "筋力",
      TEC: "技術",
      STA: "持久",
      MEN: "メンタル",
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
      rest: "休養",
      next: "次ターンへ",
    };
    if (window.SD_UI && SD_UI.setSceneTitle) {
      SD_UI.setSceneTitle(map[menuKey] || "練習");
    }
  }

  // 疲労が高いほど伸びが落ちる（最低40%まで）
  function trainingEfficiencyByFatigue(fatigue) {
    // 0%→1.00, 50%→0.75, 80%→0.55, 100%→0.40
    const eff = 1.0 - (fatigue * 0.006);
    return SD_DATA.clamp(eff, 0.40, 1.0);
  }

  // メニュー強度：怪我確率に反映（リアル寄り）
  const MENU_INTENSITY = {
    start: 1.15,
    tempo: 1.0,
    power: 1.25,
    core: 1.05,
    mental: 0.85,
    massage: 0.2,
    rest: 0.1,
  };

  // 疲労が高い状態で強い練習をすると怪我抽選
  function injuryRoll(state, action) {
    const p = state.player;
    if (action === "rest" || action === "massage" || action === "mental") return false;

    const f = p.fatigue;
    if (f < 65) return false; // 65未満は基本セーフ

    // 基本確率：疲労が65→0%、85→約10%、95→約18%みたいな曲線
    const base = (f - 65) / 35; // 0..1
    const curve = Math.pow(SD_DATA.clamp(base, 0, 1), 1.35); // 0..1
    let prob = curve * 0.18; // 最大18%

    // メニュー強度で補正
    prob *= MENU_INTENSITY[action] || 1.0;

    // 隠し特性：growthが高いほど少し怪我率↑（無理しがち）
    const growth = p.growthTraits?.growth ?? 100;
    prob *= SD_DATA.clamp(0.9 + (growth - 100) * 0.003, 0.85, 1.15);

    // セーフガード
    prob = SD_DATA.clamp(prob, 0, 0.30); // 上限30%

    return Math.random() < prob;
  }

  function applyInjury(state) {
    const p = state.player;
    const s = p.stats;

    p.injuryCount += 1;

    // 能力減点：2項目をランダムで -4〜-9
    const keys = ["SPD", "ACC", "POW", "TEC", "STA", "MEN"];
    const a = keys[SD_DATA.randInt(0, keys.length - 1)];
    let b = keys[SD_DATA.randInt(0, keys.length - 1)];
    if (b === a) b = keys[(keys.indexOf(a) + 1) % keys.length];

    s[a] = clampStat(s[a] - SD_DATA.randInt(4, 9));
    s[b] = clampStat(s[b] - SD_DATA.randInt(4, 9));

    // 怪我後は疲労が強制的に中程度に戻る（休まないと治らない）
    p.fatigue = 62;

    state.lastEvent = "怪我をした。";

    // 3回で引退
    if (p.injuryCount >= 3) {
      p.retired = true;
      state.lastEvent = "怪我が重なり、引退となった。";
    }
  }

  function applyTraining(state, action) {
    const p = state.player;
    if (p.retired) return;

    const s = p.stats;

    // 練習効果（ベース）
    const base = {
      start: { ACC: +3, TEC: +2, fatigue: +16, vibe: "スタートの音が、体に入る。" },
      tempo: { TEC: +3, MEN: +2, fatigue: +12, vibe: "フォームが一瞬だけ“揃う”。" },
      power: { POW: +4, STA: +1, fatigue: +20, vibe: "脚が重い。でも、明日の脚になる。" },
      core: { STA: +3, TEC: +1, fatigue: +14, vibe: "軸が少し安定した気がする。" },
      mental: { MEN: +4, fatigue: +3, vibe: "呼吸が落ち着く。勝負は心からだ。" },
      massage: { all: +1, fatigue: -20, vibe: "体がほぐれて、視界が明るくなる。" },
      rest: { fatigue: -42, vibe: "休むのも練習。焦りだけは置いていく。" },
    }[action];

    if (!base) return;

    // 表示用の雰囲気
    if (window.SD_UI) {
      SD_UI.setAtmosphereText(atmosphereText(state));
      SD_UI.setSceneCaption(base.vibe);
    }

    // 疲労による練習効率
    const fatigueEff = trainingEfficiencyByFatigue(p.fatigue);

    // 成長特性（0.85〜1.15）
    const growthEff = (p.growthTraits?.growth ?? 100) / 100;

    // 総合倍率
    const mult = fatigueEff * growthEff;

    // stats update
    if (base.all) {
      for (const k of ["SPD", "ACC", "POW", "TEC", "STA", "MEN"]) {
        s[k] = clampStat(s[k] + Math.max(0, Math.round(base.all * mult)));
      }
    } else {
      for (const k of ["SPD", "ACC", "POW", "TEC", "STA", "MEN"]) {
        if (base[k]) s[k] = clampStat(s[k] + Math.max(0, Math.round(base[k] * mult)));
      }
    }

    // fatigue update
    if (typeof base.fatigue === "number") {
      p.fatigue = SD_DATA.clamp(p.fatigue + base.fatigue, 0, 100);
    }

    // 怪我抽選
    const injured = injuryRoll(state, action);
    if (injured) {
      applyInjury(state);
      if (window.SD_UI) SD_UI.setSceneCaption("ピキッ…と嫌な感触。胸が冷える。");
    }

    // 疲労100到達でも確定怪我（保険）
    if (!p.retired && p.fatigue >= 100) {
      applyInjury(state);
      if (window.SD_UI) SD_UI.setSceneCaption("限界を越えた。足が言うことをきかない。");
    }

    // チーム波及（軽量版）
    const teamMult = 0.30;
    if (!p.retired && action !== "rest") {
      for (const m of state.team) {
        const keys = Object.entries(m.stats)
          .sort((a, b) => a[1] - b[1])
          .map((x) => x[0]);
        const k1 = keys[0];
        const k2 = keys[1];
        const gain = action === "massage" ? 1 : 0;

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

    // 次大会までカウント
    if (state.nextMeet.turnsLeft > 0) state.nextMeet.turnsLeft -= 1;

    // 年月ターン進行
    state.turn.term += 1;
    if (state.turn.term >= 4) {
      state.turn.term = 1;
      state.turn.month += 1;

      // 年度跨ぎ（簡易）：ここは改良6で本格化
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
    if (window.SD_UI) {
      SD_UI.setCoachLine(coachLineForTurn(state));
      SD_UI.setAtmosphereText(atmosphereText(state));
      SD_UI.setSceneCaption(sceneCaption(state));
    }
  }

  // ----------------------------
  // Name Modal (堅牢版)
  //  - nameSaveBtn / nameDecideBtn どちらでも動く
  //  - 要素が無くても落ちない
  //  - 決定時は必ず閉じる（UI側が壊れてても display:none まで叩く）
  // ----------------------------
  function showNameModalIfNeeded(state) {
    if (!state.player.name || !state.player.name.trim()) {
      if (window.SD_UI && SD_UI.openNameModal) SD_UI.openNameModal();
      return true;
    }
    return false;
  }

  function forceCloseNameModalFallback() {
    const back = document.getElementById("nameModalBackdrop");
    if (back) {
      back.hidden = true;
      back.style.display = "none";
      back.classList.remove("is-open");
      back.setAttribute("aria-hidden", "true");
    }
  }

  function wireNameModal(state) {
    const back = document.getElementById("nameModalBackdrop");
    const input = document.getElementById("nameInput");

    // 決定ボタンIDの揺れを吸収（あなたの現在コードは nameSaveBtn を探してた）
    const decideBtn =
      document.getElementById("nameDecideBtn") ||
      document.getElementById("nameSaveBtn"); // 旧ID対応

    const randBtn = document.getElementById("nameRandomBtn");

    if (!back || !input || !decideBtn || !randBtn) {
      console.warn("[SD] Name modal wiring skipped. Missing elements:", {
        back: !!back,
        input: !!input,
        decideBtn: !!decideBtn,
        randBtn: !!randBtn,
      });
      return;
    }

    function applyName(name) {
      const n = (name || "").trim().slice(0, 12);
      if (!n) return false;

      state.player.name = n;

      // UI反映
      if (window.SD_UI && SD_UI.setPlayerName) SD_UI.setPlayerName(n);

      // 保存（2系統）
      save(state);

      // 閉じる（本命＋保険）
      if (window.SD_UI && SD_UI.closeNameModal) SD_UI.closeNameModal();
      forceCloseNameModalFallback();

      return true;
    }

    randBtn.addEventListener("click", () => {
      // もし SD_DATA.randomPlayerName が無い場合に備えてフォールバック
      const fallback = ["ケイスケ", "ハル", "ユウト", "ミナト", "ユイ", "アオイ", "ソラ", "レン"];
      const v = (SD_DATA.randomPlayerName ? SD_DATA.randomPlayerName() : fallback[Math.floor(Math.random() * fallback.length)]);
      input.value = v;
      input.focus();
      if (input.select) input.select();
    });

    decideBtn.addEventListener("click", () => {
      applyName(input.value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyName(input.value);
    });

    // 名前必須：背景クリックでは閉じない（仕様）
    back.addEventListener("click", (e) => {
      if (e.target === back) {
        // no-op
      }
    });
  }

  // ----------------------------
  // Actions
  // ----------------------------
  function lockActionsIfRetired(state) {
    if (!state.player.retired) return;
    const btns = document.querySelectorAll("button[data-action]");
    btns.forEach((b) => (b.disabled = true));

    if (window.SD_UI) {
      SD_UI.setCoachLine(coachLineForTurn(state));
      SD_UI.setSceneCaption("— 引退 END — もう一度走りたくなったら、また最初から。");
    }
  }

  function wireActions(state) {
    const btns = document.querySelectorAll("button[data-action]");
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.player.retired) return;

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
        if (window.SD_UI) {
          SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
          SD_UI.setNextMeet(nextMeetText(state));
          SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");
          SD_UI.renderStats(state.player);
          SD_UI.renderTeam(state.team);

          // 監督コメント
          SD_UI.setCoachLine(coachLineForTurn(state));
        }

        // シーンアニメにも反映
        if (window.SD_SCENE) SD_SCENE.setMode(state.selectedMenu);

        // 引退なら操作ロック
        lockActionsIfRetired(state);

        save(state);
      });
    });
  }

  // ----------------------------
  // Scene (Canvas) : 既存を維持
  // ----------------------------
  function initScene(state) {
    const canvas = document.getElementById("sceneCanvas");
    if (!canvas) return;
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

    const runner = { x: 110, y: 290, speed: 1.6 };

    function setMode(m) {
      mode = m;
    }

    function drawBackground() {
      const w = canvas.width,
        h = canvas.height;

      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(25,45,85,0.95)");
      g.addColorStop(1, "rgba(10,15,28,0.98)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 140, w, 70);

      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 220; i++) {
        const x = (i * 17 + t * 1.2) % w;
        const y = 145 + (i % 4) * 14 + Math.sin(i + t * 0.01) * 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(52, 55, 10, 120);
      ctx.fillRect(w - 62, 55, 10, 120);
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(40, 45, 34, 16);
      ctx.fillRect(w - 74, 45, 34, 16);

      ctx.fillStyle = "rgba(40,90,180,0.28)";
      ctx.fillRect(0, 210, w, 170);

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      for (let i = -w; i < w * 2; i += 26) {
        ctx.beginPath();
        ctx.moveTo(i + (t * 0.7) % 26, 210);
        ctx.lineTo(i + (t * 0.7) % 26 + 180, 380);
        ctx.stroke();
      }

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

      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(86, 226, 4, 130);
      ctx.fillRect(w - 90, 226, 4, 130);
    }

    function roundRect(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    function drawRunner() {
      const baseX = runner.x + Math.sin(t * 0.02) * 2;
      const baseY = runner.y + Math.sin(t * 0.04) * 1.2;

      const sp =
        mode === "rest"
          ? 0.2
          : mode === "massage"
          ? 0.6
          : mode === "mental"
          ? 0.9
          : mode === "core"
          ? 1.1
          : mode === "tempo"
          ? 1.25
          : mode === "start"
          ? 1.4
          : mode === "power"
          ? 1.0
          : 1.1;

      runner.speed = sp;
      runner.x += sp * 0.35;
      if (runner.x > canvas.width - 130) runner.x = 110;

      const phase = t * 0.06 * sp;
      const armA = Math.sin(phase) * 10;
      const armB = Math.sin(phase + Math.PI) * 10;
      const legA = Math.sin(phase + Math.PI / 2) * 12;
      const legB = Math.sin(phase + Math.PI / 2 + Math.PI) * 12;

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(baseX + 12, baseY + 42, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate(-0.08);

      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.beginPath();
      ctx.arc(16, -6, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 200, 72, 0.92)";
      roundRect(ctx, 6, 6, 26, 22, 6);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,0.18)";
      roundRect(ctx, 12, 12, 14, 10, 4);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.72)";
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

      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillRect(2, 44, 10, 4);
      ctx.fillRect(26, 44, 10, 4);

      ctx.restore();
    }

    function draw() {
      t += 1;
      drawBackground();
      drawRunner();

      ctx.fillStyle = "rgba(255,255,255,0.08)";
      for (let i = 0; i < 16; i++) {
        const x = canvas.width - 140 + ((i * 18 + t * 0.8) % 140);
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

  // ----------------------------
  // Boot
  // ----------------------------
  function boot() {
    let state = load();
    if (!state) state = defaultState();

    // 互換：古い保存データで player.name が空でも name単独があれば拾う
    if (!state.player.name || !state.player.name.trim()) {
      const savedName = (localStorage.getItem(KEY_PLAYER_NAME) || "").trim();
      if (savedName) state.player.name = savedName;
    }

    // 初期UI
    const t = state.turn;
    if (window.SD_UI) {
      SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
      SD_UI.setNextMeet(nextMeetText(state));
      SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");
      SD_UI.setCoachLine(coachLineForTurn(state));
      SD_UI.setAtmosphereText(atmosphereText(state));
      SD_UI.setSceneCaption(sceneCaption(state));
    }

    recalcTeamPowers(state);
    if (window.SD_UI) {
      SD_UI.renderStats(state.player);
      SD_UI.renderTeam(state.team);
    }

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
