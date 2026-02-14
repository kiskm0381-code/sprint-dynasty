// data.js
// ゲームの固定データ・ユーティリティ

(function () {
  const NAMES_JP = [
    "田中 陸","鈴木 湊","佐藤 悠真","高橋 蓮","伊藤 隼人","山本 颯太","渡辺 蒼","小林 海斗",
    "吉田 迅","山田 奏","中村 湊斗","松本 直人","井上 慧","木村 陽翔","斎藤 蒼真","森 玲央",
  ];

  const RARE_NAMES = [
    "神代 玲音","天城 颯","白銀 凛","久遠 ルカ","八雲 迅風","鏡城 レイ","鷹司 恒一","星宮 アオ"
  ];

  const ICONS = ["1","2","3","4","5","6","7","8","9"];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

  function rollRarity(pRare = 0.08) {
    return Math.random() < pRare ? "rare" : "normal";
  }

  // stats are 0..100
  function genStatsByGrade(grade, rarity) {
    // 弱小校なので平均は控えめ。ただしレアは尖る
    const base = grade === 1 ? 38 : grade === 2 ? 48 : 56;
    const spread = grade === 1 ? 14 : grade === 2 ? 14 : 12;

    const rareBoost = rarity === "rare" ? 10 : 0;

    const SPD = clamp(base + randInt(-spread, spread) + rareBoost, 15, 95);
    const ACC = clamp(base + randInt(-spread, spread) + rareBoost, 15, 95);
    const POW = clamp(base + randInt(-spread, spread) + (rarity === "rare" ? 12 : 0), 15, 98);
    const TEC = clamp(base + randInt(-spread, spread) + (rarity === "rare" ? 12 : 0), 15, 98);
    const STA = clamp(base + randInt(-spread, spread), 15, 95);
    const MEN = clamp(base + randInt(-spread, spread), 15, 95);

    return { SPD, ACC, POW, TEC, STA, MEN };
  }

  function personalityTag(stats) {
    // 伸び方の偏り（見せ方だけ。実際の伸び補正は後でui/game側に入れられる）
    const pairs = [
      ["SPD","スピード型"],
      ["ACC","加速型"],
      ["POW","パワー型"],
      ["TEC","技巧型"],
      ["STA","持久型"],
      ["MEN","勝負強い"],
    ];
    pairs.sort((a,b)=>stats[b[0]]-stats[a[0]]);
    return pairs[0][1];
  }

  function totalPower(stats) {
    return Math.round((stats.SPD + stats.ACC + stats.POW + stats.TEC + stats.STA + stats.MEN) / 6);
  }

  function randomJapaneseName(isRare) {
    if (isRare) return RARE_NAMES[randInt(0, RARE_NAMES.length - 1)];
    return NAMES_JP[randInt(0, NAMES_JP.length - 1)];
  }

  function randomPlayerName() {
    const opts = ["ケイスケ","ハル","ソウタ","レン","ミナト","ユウマ","アオ","レオ"];
    return opts[randInt(0, opts.length - 1)];
  }

  function makeTeamMembers() {
    // 8人（主人公を除く）: 1〜3年が混ざる。入学時点で2,3年にもレア混入。
    const members = [];
    for (let i = 0; i < 8; i++) {
      const grade = randInt(1, 3);
      const rarity = rollRarity(grade === 1 ? 0.10 : 0.06); // 新入生はレア若干高め
      const name = randomJapaneseName(rarity === "rare");
      const stats = genStatsByGrade(grade, rarity);
      const tag = personalityTag(stats);
      const pow = totalPower(stats);
      members.push({
        id: `m${i+1}`,
        name,
        grade,
        rarity,
        stats,
        tag,
        pow,
        icon: ICONS[i % ICONS.length]
      });
    }
    return members;
  }

  // 隠し成長特性（後で活かす）
  function genGrowthTraits() {
    return {
      growth: randInt(85, 115),      // 練習効率の基礎倍率(%)
      awaken: randInt(2, 8),         // 覚醒確率の土台(%)
      swing: randInt(6, 14),         // レースブレ幅の土台（後で）
    };
  }

  window.SD_DATA = {
    clamp,
    randInt,
    rollRarity,
    genStatsByGrade,
    personalityTag,
    totalPower,
    randomPlayerName,
    makeTeamMembers,
    genGrowthTraits,
  };
})();
