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
