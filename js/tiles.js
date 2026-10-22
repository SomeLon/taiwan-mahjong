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

  /* ---------- 牌面圖案（SVG）：筒畫圓餅、條畫竹子、一條畫雀鳥 ---------- */
  const B = '#1d5ea8'; // 藍
  const G = '#1b7a49'; // 綠
  const R = '#c0322a'; // 紅

  // 一個筒子圓餅：外圈色、白圈、內圈色、白心
  function dot(x, y, r, c) {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.72).toFixed(2)}" fill="#fff"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.5).toFixed(2)}" fill="${c}"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.18).toFixed(2)}" fill="#fff"/>`;
  }
  // 一根竹子：圓角長條，中間與兩端有竹節
  function stick(x, y, h, c, rot) {
    const w = 5.2;
    const t = rot ? ` transform="rotate(${rot} ${x} ${y})"` : '';
    const top = y - h / 2;
    return `<g${t}><rect x="${x - w / 2}" y="${top}" width="${w}" height="${h}" rx="2.1" fill="${c}"/>` +
      `<rect x="${x - w / 2 - 0.5}" y="${top - 0.3}" width="${w + 1}" height="1.6" rx="0.8" fill="${c}"/>` +
      `<rect x="${x - w / 2 - 0.5}" y="${top + h - 1.3}" width="${w + 1}" height="1.6" rx="0.8" fill="${c}"/>` +
      `<rect x="${x - w / 2 - 0.4}" y="${y - 0.7}" width="${w + 0.8}" height="1.4" rx="0.7" fill="${c}"/>` +
      `<line x1="${x}" y1="${top + 1.8}" x2="${x}" y2="${top + h - 1.8}" stroke="#fff" stroke-width="0.8" stroke-opacity="0.75"/></g>`;
  }

  const DOTS = {
    1: () =>
      `<circle cx="15" cy="21" r="12.5" fill="${G}"/><circle cx="15" cy="21" r="10.6" fill="#fff"/>` +
      Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return `<circle cx="${(15 + 8.6 * Math.cos(a)).toFixed(2)}" cy="${(21 + 8.6 * Math.sin(a)).toFixed(2)}" r="1.5" fill="${B}"/>`;
      }).join('') +
      `<circle cx="15" cy="21" r="6" fill="${R}"/><circle cx="15" cy="21" r="4.1" fill="#fff"/><circle cx="15" cy="21" r="2.6" fill="${R}"/><circle cx="15" cy="21" r="0.9" fill="#fff"/>`,
    2: () => dot(15, 11, 6.8, G) + dot(15, 31, 6.8, B),
    3: () => dot(7.5, 8.5, 5.6, B) + dot(15, 21, 5.6, R) + dot(22.5, 33.5, 5.6, G),
    4: () => dot(8.5, 11, 6, B) + dot(21.5, 11, 6, G) + dot(8.5, 31, 6, G) + dot(21.5, 31, 6, B),
    5: () => dot(7.5, 8.5, 5.3, B) + dot(22.5, 8.5, 5.3, G) + dot(15, 21, 5.3, R) + dot(7.5, 33.5, 5.3, G) + dot(22.5, 33.5, 5.3, B),
    6: () => [8, 21, 34].map((y, i) => dot(8.5, y, 5.3, i ? R : G) + dot(21.5, y, 5.3, i ? R : G)).join(''),
    7: () =>
      dot(6.5, 5.5, 4.2, G) + dot(15, 10, 4.2, G) + dot(23.5, 14.5, 4.2, G) +
      [26, 36].map((y) => dot(9.5, y, 4.6, R) + dot(20.5, y, 4.6, R)).join(''),
    8: () => [6, 16, 26, 36].map((y) => dot(9, y, 4.7, B) + dot(21, y, 4.7, B)).join(''),
    9: () => [[8, B], [21, R], [34, G]].map(([y, c]) => dot(6, y, 4.5, c) + dot(15, y, 4.5, c) + dot(24, y, 4.5, c)).join(''),
  };

  const BIRD =
    // 尾羽
    `<path d="M10 30 Q2 33 3 41 Q8 35 12 34Z" fill="${B}"/>` +
    `<path d="M12 31 Q8 37 11 41 Q13 36 15 33Z" fill="${G}"/>` +
    `<path d="M14 31 Q15 38 19 41 Q18 35 17 32Z" fill="${R}"/>` +
    // 身體與翅膀
    `<ellipse cx="15.5" cy="22" rx="7.5" ry="10" transform="rotate(-18 15.5 22)" fill="${G}"/>` +
    `<path d="M12 17 Q19 18 20 27 Q15 30 11 26 Q13 22 12 17Z" fill="${B}"/>` +
    `<path d="M13 21 L18 23 M13 24 L18 26" stroke="#fff" stroke-width="0.8" stroke-opacity="0.7"/>` +
    // 頭、冠、嘴、眼
    `<circle cx="20" cy="9.5" r="4.6" fill="${G}"/>` +
    `<path d="M18 5.5 Q19 1 21.5 2 Q20.5 4 21 5.6Z" fill="${R}"/>` +
    `<path d="M24.2 8.6 L28.5 10.2 L24.2 11.6Z" fill="${R}"/>` +
    `<circle cx="21.2" cy="8.8" r="1.25" fill="#fff"/><circle cx="21.5" cy="8.8" r="0.65" fill="#111"/>` +
    // 腳
    `<path d="M15 31 L14 36 M18 30 L18.5 35" stroke="${R}" stroke-width="1.3" stroke-linecap="round"/>`;

  const BAMS = {
    1: () => BIRD,
    2: () => stick(15, 11, 15, G) + stick(15, 31, 15, B),
    3: () => stick(15, 11, 15, B) + stick(9, 31, 15, G) + stick(21, 31, 15, G),
    4: () => stick(9, 11, 15, B) + stick(21, 11, 15, G) + stick(9, 31, 15, G) + stick(21, 31, 15, B),
    5: () => stick(7.5, 10, 13, G) + stick(22.5, 10, 13, B) + stick(15, 21, 13, R) + stick(7.5, 32, 13, B) + stick(22.5, 32, 13, G),
    6: () => [7, 15, 23].map((x) => stick(x, 11, 15, G) + stick(x, 31, 15, B)).join(''),
    7: () => stick(15, 6.5, 10, R) + [7, 15, 23].map((x) => stick(x, 20.5, 11, G) + stick(x, 34, 11, G)).join(''),
    8: () =>
      [[6, 18], [12, -18], [18, 18], [24, -18]].map(([x, r]) => stick(x, 11, 15, G, r)).join('') +
      [[6, -18], [12, 18], [18, -18], [24, 18]].map(([x, r]) => stick(x, 31, 15, G, r)).join(''),
    9: () => [8, 21, 34].map((y) => stick(6, y, 11, G) + stick(15, y, 11, R) + stick(24, y, 11, B)).join(''),
  };

  const svgCache = {};
  function faceSVG(t) {
    if (svgCache[t]) return svgCache[t];
    const n = (t % 9) + 1;
    const body = t < 18 ? DOTS[n]() : BAMS[n]();
    const svg = `<svg class="tf" viewBox="0 0 30 42" aria-hidden="true">${body}</svg>`;
    svgCache[t] = svg;
    return svg;
  }

  /* 產生一張牌的 HTML。t 為 null 代表牌背 */
  MJ.tileHTML = function (t, cls, attrs) {
    cls = cls || '';
    attrs = attrs || '';
    if (t === null || t === undefined) return `<div class="tile back ${cls}" ${attrs}></div>`;
    let sc;
    let inner;
    if (t < 9) {
      // 萬子：上面國字數字、下面紅色「萬」
      sc = 'm';
      inner = `<span class="tn">${NUM[t]}</span><span class="ts">萬</span>`;
    } else if (t < 27) {
      sc = t < 18 ? 'p' : 's';
      inner = faceSVG(t);
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
