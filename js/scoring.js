/* 台數計算（台灣十六張常見台數） */
(function () {
  'use strict';
  const MJ = (globalThis.MJ = globalThis.MJ || {});

  function flowerItems(ctx) {
    const items = [];
    const fl = new Set(ctx.flowers);
    const seat = ctx.seatWind;
    const seasons = [34, 35, 36, 37].every((f) => fl.has(f));
    const plants = [38, 39, 40, 41].every((f) => fl.has(f));
    if (seasons) items.push(['春夏秋冬（花槓）', 2]);
    else if (fl.has(34 + seat)) items.push(['正花 ' + MJ.tileName(34 + seat), 1]);
    if (plants) items.push(['梅蘭竹菊（花槓）', 2]);
    else if (fl.has(38 + seat)) items.push(['正花 ' + MJ.tileName(38 + seat), 1]);
    return items;
  }

  function finalize(items) {
    return { items, tai: items.reduce((s, x) => s + x[1], 0) };
  }

  function evalDecomp(ctx, d) {
    const items = [];
    const add = (n, t) => items.push([n, t]);
    const w = ctx.winTile;
    const fItems = flowerItems(ctx);

    if (ctx.flags.tianhu) return finalize([['天胡', 24]].concat(fItems));
    if (ctx.flags.dihu) return finalize([['地胡', 16]].concat(fItems));

    // 放槍時，胡的那張若只能湊成刻子，那組刻子算明刻
    let winElsewhere = false;
    if (!ctx.selfDraw) {
      if (d.pair === w) winElsewhere = true;
      for (const s of d.sets) if (s.type === 'chow' && w >= s.t && w <= s.t + 2) winElsewhere = true;
    }
    const sets = [];
    for (const s of d.sets) {
      if (s.type === 'pung') sets.push({ kind: 'pung', t: s.t, concealed: ctx.selfDraw || winElsewhere || s.t !== w });
      else sets.push({ kind: 'chow', t: s.t, concealed: true });
    }
    for (const m of ctx.melds) {
      if (m.type === 'chow') sets.push({ kind: 'chow', t: m.t, concealed: false });
      else sets.push({ kind: 'pung', t: m.t, concealed: m.type === 'ankong' });
    }

    const types = [];
    for (let t = 0; t < 34; t++) if (ctx.concealed[t]) types.push(t);
    for (const m of ctx.melds) types.push(m.t);
    const hasHonor = types.some((t) => t >= 27);
    const suits = new Set(types.filter((t) => t < 27).map((t) => Math.floor(t / 9)));
    const menqing = ctx.melds.every((m) => m.type === 'ankong');
    const pungs = sets.filter((s) => s.kind === 'pung');

    if (menqing && ctx.selfDraw) add('門清自摸', 3);
    else if (menqing) add('門清', 1);
    else if (ctx.selfDraw) add('自摸', 1);

    // 風牌
    const windP = pungs.filter((s) => s.t >= 27 && s.t <= 30).map((s) => s.t - 27);
    const pairWind = d.pair >= 27 && d.pair <= 30;
    if (windP.length === 4) add('大四喜', 16);
    else if (windP.length === 3 && pairWind) add('小四喜', 8);
    else {
      if (windP.includes(ctx.roundWind)) add('圈風 ' + MJ.WINDS[ctx.roundWind], 1);
      if (windP.includes(ctx.seatWind)) add('門風 ' + MJ.WINDS[ctx.seatWind], 1);
    }

    // 三元牌
    const dragonP = pungs.filter((s) => s.t >= 31).map((s) => s.t);
    const pairDragon = d.pair >= 31;
    if (dragonP.length === 3) add('大三元', 8);
    else if (dragonP.length === 2 && pairDragon) add('小三元', 4);
    else for (const t of dragonP) add('三元牌 ' + MJ.tileName(t), 1);

    // 一色、碰碰胡
    if (suits.size === 0) add('字一色', 16);
    else {
      if (pungs.length === 5) add('碰碰胡', 4);
      if (suits.size === 1) {
        if (hasHonor) add('混一色', 4);
        else add('清一色', 8);
      }
    }

    // 暗刻
    const cp = pungs.filter((s) => s.concealed).length;
    if (cp === 5) add('五暗刻', 8);
    else if (cp === 4) add('四暗刻', 5);
    else if (cp === 3) add('三暗刻', 2);

    // 平胡：五組順子、無字無花、非自摸、非獨聽
    const allChow = sets.every((s) => s.kind === 'chow');
    if (allChow && !hasHonor && ctx.flowers.length === 0 && !ctx.selfDraw && ctx.waitsCount > 1) add('平胡', 2);

    // 全求人 / 獨聽
    const quanqiu = ctx.melds.length === 5 && ctx.melds.every((m) => m.type !== 'ankong') && !ctx.selfDraw;
    if (quanqiu) add('全求人', 2);
    else if (ctx.waitsCount === 1) add('獨聽', 1);

    if (ctx.flags.kongDraw && ctx.selfDraw) add('槓上開花', 1);
    if (ctx.flags.lastTile) add(ctx.selfDraw ? '海底撈月' : '河底撈魚', 1);
    if (ctx.flags.robKong) add('搶槓', 1);

    return finalize(items.concat(fItems));
  }

  /* ctx = { concealed(含胡牌那張的34陣列), melds, flowers(牌型陣列), winTile, selfDraw,
   *         seatWind, roundWind, waitsCount, flags:{kongDraw,lastTile,robKong,tianhu,dihu} } */
  MJ.scoreWin = function (ctx) {
    const ds = MJ.decompositions(ctx.concealed);
    let best = null;
    for (const d of ds) {
      const r = evalDecomp(ctx, d);
      if (!best || r.tai > best.tai) best = r;
    }
    if (!best) best = finalize(flowerItems(ctx));
    return best;
  };

  /* 規則說明用的台數表 */
  MJ.TAI_TABLE = [
    ['莊家', '1', '莊家胡牌或莊家放槍/被自摸時加計'],
    ['連莊 / 拉莊', '每連 1 次 +2', '連N拉N：連一拉一 2 台，連二拉二 4 台…'],
    ['門清', '1', '沒有吃、碰、明槓'],
    ['自摸', '1', ''],
    ['門清自摸', '3', '門清又自摸（取代上面兩項）'],
    ['圈風 / 門風', '各 1', '該風的刻子或槓'],
    ['三元牌', '各 1', '中、發、白的刻子或槓'],
    ['正花', '各 1', '與自己座位相符的花'],
    ['花槓', '2', '春夏秋冬或梅蘭竹菊湊齊'],
    ['獨聽', '1', '邊張、中洞、單吊只聽一張'],
    ['槓上開花', '1', '槓後補牌自摸'],
    ['海底撈月 / 河底撈魚', '1', '最後一張自摸 / 最後一張放槍'],
    ['搶槓', '1', '胡別人加槓的牌'],
    ['平胡', '2', '五組順子、無字無花、非自摸、非獨聽'],
    ['全求人', '2', '五組全靠吃碰、單吊別人放槍'],
    ['三暗刻', '2', ''],
    ['碰碰胡', '4', '五組都是刻子'],
    ['混一色', '4', '一種花色加字牌'],
    ['小三元', '4', '兩組三元刻 + 三元眼'],
    ['四暗刻', '5', ''],
    ['清一色', '8', '只有一種花色'],
    ['五暗刻', '8', ''],
    ['大三元', '8', '中發白三組刻子'],
    ['小四喜', '8', '三組風刻 + 風眼'],
    ['八仙過海 / 七搶一', '8', '湊齊八張花 / 七張花搶別人的第八張'],
    ['地胡', '16', '閒家第一次摸牌就自摸'],
    ['大四喜', '16', '東南西北四組刻子'],
    ['字一色', '16', '全部字牌'],
    ['天胡', '24', '莊家第一手就胡'],
  ];
})();
