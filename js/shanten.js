/* 向聽數、聽牌、胡牌拆解
 * 十六張麻將：需要 5 組面子 + 1 對眼。
 * N = 還需要的面子數 = 5 - 已亮出的副露數
 * 向聽數 = 2N - 2*面子 - min(搭子, N-面子) - (有眼?1:0)
 *   -1 = 胡牌，0 = 聽牌
 */
(function () {
  'use strict';
  const MJ = (globalThis.MJ = globalThis.MJ || {});

  const cache = new Map();

  // 去掉被支配（面子、搭子、眼都不比別人多）的組合
  function prune(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      let drop = false;
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const b = list[j];
        if (b[0] >= a[0] && b[1] >= a[1] && b[2] >= a[2]) {
          if (b[0] > a[0] || b[1] > a[1] || b[2] > a[2] || j < i) {
            drop = true;
            break;
          }
        }
      }
      if (!drop) out.push(a);
    }
    return out;
  }

  // 對一門牌（長度 9 可組順子，或字牌長度 7 不可組順子）列出所有 [面子, 搭子, 眼] 組合
  function opts(c, allowSeq) {
    const key = (allowSeq ? 's' : 'h') + c.join('');
    const hit = cache.get(key);
    if (hit) return hit;
    const n = c.length;
    let i = 0;
    while (i < n && c[i] === 0) i++;
    if (i === n) {
      const r0 = [[0, 0, 0]];
      cache.set(key, r0);
      return r0;
    }
    const res = [];
    const add = (dm, dt, dp, sub) => {
      for (const o of sub) {
        if (dp && o[2]) continue;
        res.push([o[0] + dm, o[1] + dt, o[2] + dp]);
      }
    };
    if (c[i] >= 3) {
      c[i] -= 3;
      add(1, 0, 0, opts(c, allowSeq));
      c[i] += 3;
    }
    if (allowSeq && i + 2 < n && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      add(1, 0, 0, opts(c, allowSeq));
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      const sub = opts(c, allowSeq);
      add(0, 0, 1, sub); // 當眼
      add(0, 1, 0, sub); // 當對子搭子
      c[i] += 2;
    }
    if (allowSeq && i + 1 < n && c[i + 1]) {
      c[i]--; c[i + 1]--;
      add(0, 1, 0, opts(c, allowSeq));
      c[i]++; c[i + 1]++;
    }
    if (allowSeq && i + 2 < n && c[i + 2]) {
      c[i]--; c[i + 2]--;
      add(0, 1, 0, opts(c, allowSeq));
      c[i]++; c[i + 2]++;
    }
    c[i]--;
    add(0, 0, 0, opts(c, allowSeq)); // 孤張
    c[i]++;
    const r = prune(res);
    if (cache.size > 300000) cache.clear();
    cache.set(key, r);
    return r;
  }

  function combine(A, B) {
    const out = [];
    for (const a of A) {
      for (const b of B) {
        if (a[2] && b[2]) continue;
        out.push([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
      }
    }
    return prune(out);
  }

  /* c: 長度 34 的張數陣列；N: 需要的面子數 */
  MJ.shanten = function (c, N) {
    let combos = [[0, 0, 0]];
    for (let s = 0; s < 3; s++) combos = combine(combos, opts(c.slice(s * 9, s * 9 + 9), true));
    combos = combine(combos, opts(c.slice(27, 34), false));
    let best = 99;
    for (const x of combos) {
      const m = Math.min(x[0], N);
      const t = Math.min(x[1], N - m);
      const v = 2 * N - 2 * m - t - x[2];
      if (v < best) best = v;
    }
    return best;
  };

  MJ.isWin = function (c, N) {
    return MJ.shanten(c, N) === -1;
  };

  /* 聽哪些牌（手牌張數需為 3N+1） */
  MJ.waits = function (c, N) {
    const out = [];
    for (let t = 0; t < 34; t++) {
      if (c[t] >= 4) continue;
      c[t]++;
      if (MJ.shanten(c, N) === -1) out.push(t);
      c[t]--;
    }
    return out;
  };

  /* 胡牌手牌的所有拆法：{ pair, sets: [{type:'pung'|'chow', t}] } */
  MJ.decompositions = function (counts) {
    const c = counts.slice();
    const res = [];
    const sets = [];
    function extract(i, pair) {
      while (i < 34 && c[i] === 0) i++;
      if (i === 34) {
        res.push({ pair, sets: sets.slice() });
        return;
      }
      if (c[i] >= 3) {
        c[i] -= 3;
        sets.push({ type: 'pung', t: i });
        extract(i, pair);
        sets.pop();
        c[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        sets.push({ type: 'chow', t: i });
        extract(i, pair);
        sets.pop();
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
    }
    for (let p = 0; p < 34; p++) {
      if (c[p] >= 2) {
        c[p] -= 2;
        extract(0, p);
        c[p] += 2;
      }
    }
    return res;
  };
})();
