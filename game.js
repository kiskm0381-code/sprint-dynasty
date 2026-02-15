// game.js
// 改良4：通常練習（複数選択・上限なし）→ 練習開始で自動ターン進行
(function () {
  const KEY = "sd_save_v1";

  // ----------------------------
  // Save / Load
  // ----------------------------
  function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
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
        retired: false,
      },
      team: SD_DATA.makeTeamMembers(),
      turn: { grade: 1, month: 4, term: 1 },
      nextMeet: { name: "新人戦 地区大会", turnsLeft: 3 },
      lastEvent: "",
      ui: { screen: "home" }, // home | training
    };
  }

  // ----------------------------
  // Helpers
  // ----------------------------
  function termLabel(term) { return term === 1 ? "上旬" : term === 2 ? "中旬" : "下旬"; }
  function clampStat(v) { return SD_DATA.clamp(Math.round(v), 0, 100); }

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
    if (f >= 55) return "疲れが溜まってきたね。軽めに整えていこう。";

    return "今日は“丁寧に”。雑に走ると、雑が残る。";
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
  // Training Definitions（改良4：通常練習）
  // “原作っぽい”雰囲気の命名に寄せる（ただし完全再現はしない）
  // ----------------------------
  const TRAININGS = {
    team: [
      { id:"t_run10",  name:"ランニング（短め）", desc:"基礎体力を作る。疲労は軽め。", tags:["up","slim"], eff:{ STA:+2, MEN:+1 }, fat:+8,  intensity:0.95 },
      { id:"t_run30",  name:"ランニング（長め）", desc:"持久力と根性。疲労は溜まりやすい。", tags:["up","fat"],  eff:{ STA:+4, MEN:+1 }, fat:+16, intensity:1.10 },
      { id:"t_relay",  name:"リレー連携", desc:"技術と集中。気持ちも上がる。", tags:["up"],       eff:{ TEC:+3, MEN:+2 }, fat:+10, intensity:1.00 },
      { id:"t_dashrep",name:"短距離ダッシュ（反復）", desc:"スピード刺激。疲労は中〜高。", tags:["up","fat"], eff:{ SPD:+4, ACC:+2 }, fat:+18, intensity:1.20 },
    ],
    solo: [
      { id:"s_core",   name:"体幹", desc:"軸を作る。ブレが減る。", tags:["up","slim"], eff:{ STA:+2, TEC:+1 }, fat:+7,  intensity:0.90 },
      { id:"s_step",   name:"ステップ＆リズム", desc:"動きのキレを出す。", tags:["up"], eff:{ ACC:+3, TEC:+2 }, fat:+11, intensity:1.00 },
      { id:"s_image",  name:"イメトレ／メンタル", desc:"集中と自信。疲労はほぼ増えない。", tags:["up","slim"], eff:{ MEN:+4 }, fat:+2, intensity:0.70 },
      { id:"s_start",  name:"スタート練習", desc:"出だしを鋭く。フォームも整える。", tags:["up","fat"], eff:{ ACC:+3, TEC:+2 }, fat:+14, intensity:1.15 },
      { id:"s_power",  name:"筋トレ", desc:"パワーの土台。疲労は高め。", tags:["up","fat"], eff:{ POW:+4, STA:+1 }, fat:+20, intensity:1.25 },
    ],
    rest: [
      { id:"r_rest",   name:"休養", desc:"疲労を抜く。伸びは出ないが、明日が違う。", tags:["slim"], eff:{}, fat:-42, intensity:0.10 },
      { id:"r_massage",name:"マッサージ", desc:"回復＋微成長。視界が明るくなる。", tags:["up","slim"], eff:{ SPD:+1, ACC:+1, POW:+1, TEC:+1, STA:+1, MEN:+1 }, fat:-20, intensity:0.20 },
    ]
  };

  function findTrainingById(id) {
    const all = [...TRAININGS.team, ...TRAININGS.solo, ...TRAININGS.rest];
    return all.find(x => x.id === id) || null;
  }

  // ----------------------------
  // Growth / Fatigue model（ゲームの醍醐味部分）
  // - 選びすぎ → 疲労が跳ねる
  // - 多いほど伸びるわけではない（逓減）
  // - 疲労が高いほど伸びが落ちる（リアル）
  // ----------------------------
  function fatigueEfficiencyByFatigue(f) {
    // 0→1.00 / 50→0.75 / 80→0.55 / 100→0.40
    const eff = 1.0 - (f * 0.006);
    return SD_DATA.clamp(eff, 0.40, 1.00);
  }

  function diminishingByVolume(n) {
    // 1→1.00 / 2→0.92 / 3→0.82 / 4→0.72 / 5→0.62 / 6→0.54 ...
    if (n <= 1) return 1.0;
    const d = 1.0 - (Math.log2(n) * 0.18);
    return SD_DATA.clamp(d, 0.45, 1.00);
  }

  function extraFatigueByVolume(n) {
    // 選択数が増えるほど “疲労が加速” する（やりすぎ制御）
    if (n <= 1) return 0;
    // 2:+2 / 3:+6 / 4:+12 / 5:+20 / 6:+30
    return Math.round((n - 1) * (n - 1) * 2);
  }

  // 怪我抽選：疲労×強度×量（量が多いほどリスクも上がる）
  function injuryRoll(state, totalIntensity, selectedCount) {
    const p = state.player;
    const f = p.fatigue;

    if (f < 65) return false;

    const base = ((f - 65) / 35); // 0..1
    const curve = Math.pow(SD_DATA.clamp(base, 0, 1), 1.35);
    let prob = curve * 0.18; // max 18%

    // 強度
    prob *= SD_DATA.clamp(totalIntensity, 0.6, 1.8);

    // 量（選びすぎで加算）
    prob *= SD_DATA.clamp(0.95 + (selectedCount - 1) * 0.10, 0.95, 1.45);

    // 成長特性（無理しがちを軽く反映）
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

  // 通常練習：複数をまとめて適用（改良4の本体）
  function applyNormalTraining(state, selectedIds) {
    const p = state.player;
    if (p.retired) return;

    const picked = (selectedIds || []).map(findTrainingById).filter(Boolean);

    // 0件なら何もしない
    if (picked.length === 0) {
      state.lastEvent = "今日は何もしなかった。";
      SD_UI.setSceneCaption("何もしない日もある。走りは逃げない。");
      return;
    }

    // UI flavor
    SD_UI.setSceneTitle("通常練習");
    SD_UI.setAtmosphereText(atmosphereText(state));

    // 係数
    const fatigueEff = fatigueEfficiencyByFatigue(p.fatigue);
    const growthEff = (p.growthTraits?.growth ?? 100) / 100;
    const volumeEff = diminishingByVolume(picked.length);
    const mult = fatigueEff * growthEff * volumeEff;

    // 合算（能力）
    const total = { SPD:0, ACC:0, POW:0, TEC:0, STA:0, MEN:0 };
    let baseFat = 0;
    let totalIntensity = 0;

    for (const t of picked) {
      baseFat += (t.fat || 0);
      totalIntensity += (t.intensity || 1.0);
      const eff = t.eff || {};
      for (const k of Object.keys(total)) {
        if (eff[k]) total[k] += eff[k];
      }
    }

    // “組み合わせの旨味”（軽いシナジー）
    // スプリント寄せ：ダッシュ/スタート + ステップ で ACC/TEC ほんの少し増
    const ids = new Set(picked.map(x => x.id));
    if ((ids.has("t_dashrep") || ids.has("s_start")) && ids.has("s_step")) {
      total.ACC += 1;
      total.TEC += 1;
    }

    // 疲労：量で加速（やりすぎ制御）
    const extraFat = extraFatigueByVolume(picked.length);
    const fatDelta = baseFat + extraFat;

    // 適用（能力）
    for (const k of Object.keys(total)) {
      const add = Math.max(0, Math.round(total[k] * mult));
      if (add > 0) p.stats[k] = clampStat(p.stats[k] + add);
    }

    // 疲労更新
    p.fatigue = SD_DATA.clamp(p.fatigue + fatDelta, 0, 100);

    // 文章（青春＋リアル）
    SD_UI.setSceneCaption("汗が落ちる。今日の一本が、明日の一本になる。");

    // 怪我抽選（高疲労×強度×量）
    const injured = injuryRoll(state, totalIntensity / Math.max(1, picked.length), picked.length);
    if (injured) {
      applyInjury(state);
      SD_UI.setSceneCaption("ピキッ…と嫌な感触。胸が冷える。");
    }

    // 疲労100到達の保険
    if (!p.retired && p.fatigue >= 100) {
      applyInjury(state);
      SD_UI.setSceneCaption("限界を越えた。足が言うことをきかない。");
    }

    // チーム波及（少しだけ）
    const teamMult = 0.25;
    if (!p.retired) {
      for (const m of state.team) {
        const keys = Object.entries(m.stats).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);
        const k1 = keys[0];
        const k2 = keys[1];
        m.stats[k1] = clampStat(m.stats[k1] + Math.max(1, Math.round(1 * teamMult)));
        m.stats[k2] = clampStat(m.stats[k2] + Math.max(0, Math.round(1 * teamMult)));
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
      input.value = SD_DATA.randomPlayerName();
      input.focus();
    });
    saveBtn?.addEventListener("click", () => applyName(input.value));
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyName(input.value);
    });
  }

  // ----------------------------
  // Training UI Wiring
  // ----------------------------
  function buildTrainingDefs() {
    return {
      team: TRAININGS.team,
      solo: TRAININGS.solo,
    };
  }

  function computePreview(state, ids) {
    const picked = (ids || []).map(findTrainingById).filter(Boolean);
    const n = picked.length;

    let baseFat = 0;
    let intensity = 0;
    for (const t of picked) {
      baseFat += (t.fat || 0);
      intensity += (t.intensity || 1.0);
    }
    const extraFat = extraFatigueByVolume(n);
    const fatDelta = baseFat + extraFat;

    const fatigueEff = fatigueEfficiencyByFatigue(state.player.fatigue);
    const growthEff = (state.player.growthTraits?.growth ?? 100) / 100;
    const volumeEff = diminishingByVolume(n);
    const mult = fatigueEff * growthEff * volumeEff;

    const pct = Math.round(mult * 100);

    let warn = "疲労が高い状態で強い練習をすると怪我の危険が増えます。";
    if (state.player.fatigue >= 80) warn = "疲労が高い。休養を混ぜる判断も“勝ち筋”だよ。";
    if (n >= 5) warn = "量が多い。伸びは頭打ちになり、疲労が加速します。";

    return { n, fatDelta, pct, warn };
  }

  function wireTrainingModal(state) {
    const cancelBtn = document.getElementById("trainingCancelBtn");
    const goBtn = document.getElementById("trainingGoBtn");

    cancelBtn?.addEventListener("click", () => SD_UI.closeTrainingModal());

    // チェック変更でプレビュー更新
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (!t || !t.matches('input[type="checkbox"][data-train-id]')) return;
      const ids = SD_UI.getCheckedTrainingIds();
      const pv = computePreview(state, ids);
      SD_UI.setTrainingPreview(`選択：${pv.n}件 / 予想疲労：${pv.fatDelta >= 0 ? "+" : ""}${pv.fatDelta} / 伸び効率：${pv.pct}%`, pv.warn);
    });

    goBtn?.addEventListener("click", () => {
      const ids = SD_UI.getCheckedTrainingIds();

      // 練習→次ターン（ボタン廃止ルール）
      applyNormalTraining(state, ids);
      advanceTurn(state);

      SD_UI.closeTrainingModal();
      renderAll(state);
      save(state);

      // 走り演出（今はモード固定、後でドットアニメへ）
      if (window.SD_SCENE) window.SD_SCENE.setMode("tempo");
    });
  }

  // ----------------------------
  // Actions（Home）
  // ----------------------------
  function lockActionsIfRetired(state) {
    if (!state.player.retired) return;
    const btns = document.querySelectorAll("button[data-action]");
    btns.forEach(b => b.disabled = true);
    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setSceneCaption("— 引退 END — もう一度走りたくなったら、また最初から。");
  }

  function wireHomeActions(state) {
    const btns = document.querySelectorAll("button[data-action]");
    btns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (state.player.retired) return;
        const action = btn.getAttribute("data-action");
        if (!action) return;

        if (action === "open_training") {
          // 通常練習画面へ
          SD_UI.renderTrainingLists(buildTrainingDefs());
          const pv = computePreview(state, []);
          SD_UI.setTrainingPreview(`選択：0件 / 予想疲労：+0 / 伸び効率：100%`, pv.warn);
          SD_UI.openTrainingModal();
          return;
        }

        if (action === "rest") {
          // 休息は即実行→次ターン（ルール）
          applyNormalTraining(state, ["r_rest"]);
          advanceTurn(state);
          renderAll(state);
          save(state);
          return;
        }

        if (action === "rename") {
          SD_UI.openNameModal();
          return;
        }

        if (action === "reset_confirm") {
          const ok = confirm("本当にリセットしますか？（ローカル保存が消えます）");
          if (!ok) return;
          localStorage.removeItem(KEY);
          state = defaultState();
          // 再描画
          boot(true);
          return;
        }

        if (action === "special_stub") {
          alert("特殊練習は準備中です。まず通常練習を完成させます。");
          return;
        }
      });
    });
  }

  // ----------------------------
  // Scene (Canvas) : 既存を維持（簡易）
  // ----------------------------
  function initScene(state) {
    const canvas = document.getElementById("sceneCanvas");
    const ctx = canvas.getContext("2d");
    const scene = makeSceneRenderer(canvas, ctx);
    window.SD_SCENE = scene;
    scene.setMode("tempo");
    scene.start();
  }

  function makeSceneRenderer(canvas, ctx) {
    let raf = 0;
    let mode = "tempo";
    let t = 0;

    const runner = { x: 110, y: 290 };

    function setMode(m) { mode = m; }

    function drawBackground() {
      const w = canvas.width, h = canvas.height;

      // 明るめ・原作寄せの“グラウンド”方向
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(235,240,255,1)");
      g.addColorStop(1, "rgba(210,225,255,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // スタンド帯
      ctx.fillStyle = "rgba(40,40,40,0.10)";
      ctx.fillRect(0, 145, w, 60);

      // トラック
      ctx.fillStyle = "rgba(220,230,255,0.60)";
      ctx.fillRect(0, 210, w, 170);

      // 斜線
      ctx.strokeStyle = "rgba(60,80,120,0.10)";
      ctx.lineWidth = 2;
      for (let i = -w; i < w*2; i += 26) {
        ctx.beginPath();
        ctx.moveTo(i + (t*0.7)%26, 210);
        ctx.lineTo(i + (t*0.7)%26 + 180, 380);
        ctx.stroke();
      }

      // レーン
      ctx.strokeStyle = "rgba(80,90,120,0.22)";
      ctx.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        const y = 240 + i * 28;
        ctx.beginPath();
        ctx.moveTo(70, y);
        ctx.lineTo(w - 70, y);
        ctx.stroke();
      }

      // ゴールポール
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(86, 226, 4, 130);
      ctx.fillRect(w-90, 226, 4, 130);
    }

    function roundRect(x, y, w, h, r) {
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

      const sp = (mode === "rest") ? 0.2 : 1.2;
      runner.x += sp * 0.35;
      if (runner.x > canvas.width - 130) runner.x = 110;

      const phase = t * 0.06 * sp;
      const armA = Math.sin(phase) * 10;
      const armB = Math.sin(phase + Math.PI) * 10;
      const legA = Math.sin(phase + Math.PI/2) * 12;
      const legB = Math.sin(phase + Math.PI/2 + Math.PI) * 12;

      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(baseX+12, baseY+42, 16, 6, 0, 0, Math.PI*2);
      ctx.fill();

      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate(-0.08);

      // head
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(16, -6, 10, 0, Math.PI * 2);
      ctx.fill();

      // body（赤ユニ）
      ctx.fillStyle = "rgba(215,40,40,0.95)";
      roundRect(6, 6, 26, 22, 6);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,0.10)";
      roundRect(12, 12, 14, 10, 4);
      ctx.fill();

      ctx.strokeStyle = "rgba(60,60,80,0.55)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";

      // arms
      ctx.save();
      ctx.translate(10, 10);
      ctx.rotate((armA * Math.PI) / 180);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, 12); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(28, 10);
      ctx.rotate((armB * Math.PI) / 180);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 12); ctx.stroke();
      ctx.restore();

      // legs
      ctx.lineWidth = 6;
      ctx.save();
      ctx.translate(14, 28);
      ctx.rotate((legA * Math.PI) / 180);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, 18); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(24, 28);
      ctx.rotate((legB * Math.PI) / 180);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 18); ctx.stroke();
      ctx.restore();

      // shoes
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(2, 44, 10, 4);
      ctx.fillRect(26, 44, 10, 4);

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
  // Render
  // ----------------------------
  function renderAll(state) {
    const t = state.turn;
    SD_UI.setTurnText({ ...t, termLabel: termLabel(t.term) });
    SD_UI.setNextMeet(nextMeetText(state));
    SD_UI.setPlayerName(state.player.name && state.player.name.trim() ? state.player.name : "（未設定）");
    SD_UI.setCoachLine(coachLineForTurn(state));
    SD_UI.setAtmosphereText(atmosphereText(state));
    SD_UI.setSceneCaption(sceneCaption(state));
    SD_UI.setSceneTitle("通常練習");

    SD_UI.setPortraitSub(`${state.player.grade}年 / 春風高校`);

    // ドットが出ない対策：srcを毎回セット（キャッシュや初期化失敗を潰す）
    SD_UI.setSprite("./assets/hero_idle.png");

    recalcTeamPowers(state);
    SD_UI.renderStats(state.player);
    SD_UI.renderTeam(state.team);

    lockActionsIfRetired(state);
  }

  // ----------------------------
  // Boot
  // ----------------------------
  function boot(fromReset = false) {
    let state = fromReset ? defaultState() : (load() || defaultState());

    renderAll(state);

    // scene
    initScene(state);

    // modals
    wireNameModal(state);
    wireTrainingModal(state);

    // home actions
    wireHomeActions(state);

    // first time name
    showNameModalIfNeeded(state);

    save(state);
  }

  window.addEventListener("DOMContentLoaded", () => boot(false));
})();
