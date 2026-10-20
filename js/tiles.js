/* 台灣十六張麻將 - 牌的定義與工具
 * 牌型編號 t：
 *   0-8   一萬~九萬
 *   9-17  一筒~九筒
 *   18-26 一條~九條
 *   27-30 東南西北
 *   31-33 中發白
 *   34-41 花牌 春夏秋冬梅蘭竹菊
 * 實體牌物件：{ id, t }
 */
(function () {
  'use strict';
  const MJ = (globalThis.MJ = globalThis.MJ || {});

  const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const SUITS = ['萬', '筒', '條'];
  const HONORS = ['東', '南', '西', '北', '中', '發', '白'];
  const FLOWERS = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];

  MJ.NUM = NUM;
  MJ.SUITS = SUITS;
  MJ.HONORS = HONORS;
  MJ.FLOWERS = FLOWERS;
  MJ.WINDS = ['東', '南', '西', '北'];
  MJ.DEAD_WALL = 16; // 留 16 張（八墩）不摸，剩到這裡就流局

  MJ.isFlower = (t) => t >= 34;
  MJ.isHonor = (t) => t >= 27 && t < 34;
  MJ.isNumber = (t) => t < 27;
  MJ.suitOf = (t) => (t < 27 ? Math.floor(t / 9) : -1);

  MJ.tileName = function (t) {
    if (t < 27) return NUM[t % 9] + SUITS[Math.floor(t / 9)];
    if (t < 34) return HONORS[t - 27];
    return FLOWERS[t - 34];
  };

  MJ.countsOf = function (tiles) {
    const c = new Array(34).fill(0);
    for (const x of tiles) if (x.t < 34) c[x.t]++;
    return c;
  };

  MJ.sortTiles = function (tiles) {
    return tiles.sort((a, b) => a.t - b.t || a.id - b.id);
  };

  MJ.shuffle = function (arr, rng) {
    const r = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  };

  MJ.buildWall = function (rng) {
    const w = [];
    let id = 0;
    for (let t = 0; t < 34; t++) for (let k = 0; k < 4; k++) w.push({ id: id++, t });
    for (let f = 34; f < 42; f++) w.push({ id: id++, t: f });
    return MJ.shuffle(w, rng);
  };

  /* 歡樂場牌牆：每家分配一個「主題」（某一門花色或字牌），
   * 發牌與摸牌時有較高機率拿到主題內的牌、以及手上已有的同一種牌，
   * 讓清一色、混一色、碰碰胡、暗刻、三元、四喜等大牌更常出現。
   * 牌還是 144 張不重複，只是排列順序有偏向。 */
  MJ.buildFunWall = function (dealer, rng) {
    const r = rng || Math.random;
    const remaining = MJ.buildWall(r);
    const themes = MJ.shuffle([0, 1, 2, 3], r); // 0~2 萬筒條，3 字牌
    const second = themes.map(() => Math.floor(r() * 3)); // 字牌主題搭配的花色
    const mixHonor = themes.map(() => r() < 0.5); // 花色主題要不要帶字（混一色）
    const inTheme = (pid, t) => {
      if (t >= 34) return false;
      const th = themes[pid];
      if (th === 3) return t >= 27 || Math.floor(t / 9) === second[pid];
      if (t >= 27) return mixHonor[pid];
      return Math.floor(t / 9) === th;
    };
    const held = [0, 1, 2, 3].map(() => new Array(34).fill(0));
    // 第 i 張牌會落到誰手上：前 64 張是發牌（每家每次 4 張），之後大約依序輪流摸
    const owner = (i) => (i < 64 ? (dealer + Math.floor((i % 16) / 4)) % 4 : (dealer + (i - 64)) % 4);
    const BIASED = 128; // 牌尾（補花、補槓與留牌）維持隨機
    const wall = [];
    for (let i = 0; i < 144; i++) {
      let idx = -1;
      if (i < BIASED) {
        const pid = owner(i);
        const q = i < 64 ? 0.6 : 0.5;
        if (r() < q) {
          const cand = [];
          const same = [];
          for (let j = 0; j < remaining.length; j++) {
            const t = remaining[j].t;
            if (!inTheme(pid, t)) continue;
            cand.push(j);
            if (held[pid][t] >= 1 && held[pid][t] <= 2) same.push(j);
          }
          const use = same.length && r() < 0.4 ? same : cand;
          if (use.length) idx = use[Math.floor(r() * use.length)];
        }
      }
      if (idx < 0) idx = Math.floor(r() * remaining.length);
      const tile = remaining.splice(idx, 1)[0];
      wall.push(tile);
      if (i < BIASED && tile.t < 34) held[owner(i)][tile.t]++;
    }
    return wall;
  };

  /* 產生一張牌的 HTML。t 為 null 代表牌背 */
  MJ.tileHTML = function (t, cls, attrs) {
    cls = cls || '';
    attrs = attrs || '';
    if (t === null || t === undefined) return `<div class="tile back ${cls}" ${attrs}></div>`;
    let sc;
    let inner;
    if (t < 27) {
      const s = Math.floor(t / 9);
      sc = ['m', 'p', 's'][s];
      inner = `<span class="tn">${NUM[t % 9]}</span><span class="ts">${SUITS[s]}</span>`;
    } else if (t < 34) {
      sc = 'z s-z' + (t - 27);
      inner = t === 33 ? '<span class="tb"></span>' : `<span class="th">${HONORS[t - 27]}</span>`;
    } else {
      sc = 'f';
      inner = `<span class="th">${FLOWERS[t - 34]}</span><span class="fnum">${((t - 34) % 4) + 1}</span>`;
    }
    return `<div class="tile s-${sc} ${cls}" data-t="${t}" ${attrs} title="${MJ.tileName(t)}">${inner}</div>`;
  };
})();
