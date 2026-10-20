/* 電腦玩家
 * 簡單：只看向聽數，常常隨便打、隨便吃碰，不防守
 * 普通：向聽數 + 進張數，會判斷吃碰有沒有幫助
 * 困難：記牌（依場上看得到的牌算真正剩餘張數）、往後多算一步牌型，
 *       對手亮出三組以上時會判斷要不要棄胡，挑現物、筋牌、見光字牌打
 */
(function () {
  'use strict';
  const MJ = (globalThis.MJ = globalThis.MJ || {});

  MJ.LEVELS = {
    easy: { name: '簡單', desc: '隨興打牌，很少防守，適合練習' },
    normal: { name: '普通', desc: '會算進張、判斷吃碰' },
    hard: { name: '困難', desc: '記牌、多算一步，看你快胡會防守' },
  };

  const rnd = () => Math.random();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // 從自己角度看，每種牌還有幾張沒看到
  function unseenFor(game, pid, useVisible) {
    const u = new Array(34).fill(4);
    const me = game.players[pid];
    for (const x of me.hand) if (x.t < 34) u[x.t]--;
    for (const p of game.players) {
      if (!useVisible && p.id !== pid) continue;
      if (useVisible) for (const x of p.river) u[x.t]--;
      for (const m of p.melds) {
        if (m.type === 'ankong' && p.id !== pid) continue; // 別人的暗槓看不到
        for (const x of m.tiles) u[x.t]--;
      }
    }
    return u.map((v) => Math.max(0, v));
  }
  MJ.unseenFor = unseenFor;

  // 和手牌有關聯的牌（摸到才可能改善向聽）
  function relevant(c, x) {
    if (c[x]) return true;
    if (x >= 27) return false;
    const s = Math.floor(x / 9) * 9;
    for (let d = -2; d <= 2; d++) {
      const y = x + d;
      if (y >= s && y < s + 9 && c[y]) return true;
    }
    return false;
  }

  function ukeire(c, N, s, unseen) {
    let uk = 0;
    for (let x = 0; x < 34; x++) {
      if (!unseen[x] || !relevant(c, x)) continue;
      c[x]++;
      if (MJ.shanten(c, N) < s) uk += unseen[x];
      c[x]--;
    }
    return uk;
  }

  // 打出每一種牌之後的向聽數與進張
  function evalDiscards(c, N, unseen) {
    const out = [];
    for (let t = 0; t < 34; t++) {
      if (!c[t]) continue;
      c[t]--;
      const s = MJ.shanten(c, N);
      const uk = unseen ? ukeire(c, N, s, unseen) : 0;
      c[t]++;
      out.push({ t, s, uk });
    }
    return out;
  }
  MJ.evalDiscards = evalDiscards;

  // 二層進張：摸到有效牌後，下一步還能有多少進張（越大代表牌型越好）
  function ukeire2(c, N, s, unseen) {
    let total = 0;
    for (let x = 0; x < 34; x++) {
      if (!unseen[x] || !relevant(c, x)) continue;
      c[x]++;
      if (MJ.shanten(c, N) < s) {
        let bestU = 0;
        for (let y = 0; y < 34; y++) {
          if (!c[y] || y === x) continue;
          c[y]--;
          if (MJ.shanten(c, N) === s - 1) {
            const u = s - 1 >= 0 ? ukeire(c, N, s - 1, unseen) : 0;
            if (u > bestU) bestU = u;
          }
          c[y]++;
        }
        total += unseen[x] * bestU;
      }
      c[x]--;
    }
    return total;
  }

  function bestAfterDiscard(c, N) {
    let best = 99;
    for (let x = 0; x < 34; x++) {
      if (!c[x]) continue;
      c[x]--;
      const s = MJ.shanten(c, N);
      c[x]++;
      if (s < best) best = s;
    }
    return best;
  }

  // 牌的「保留價值」，越低越該先丟
  function keepScore(t, c) {
    if (t >= 27) return c[t] >= 2 ? 3 : 0.5;
    const r = t % 9;
    let v = r === 0 || r === 8 ? 1.5 : r === 1 || r === 7 ? 2.5 : 3;
    const s = Math.floor(t / 9) * 9;
    for (let d = -2; d <= 2; d++) {
      const y = t + d;
      if (d !== 0 && y >= s && y < s + 9 && c[y]) v += d === -1 || d === 1 ? 1 : 0.5;
    }
    return v;
  }

  function isValueHonor(t, game, pid) {
    return t >= 31 || (t >= 27 && (t - 27 === game.roundWind || t - 27 === game.seatWind(pid)));
  }

  function threatLevels(game, pid) {
    const left = game.wallLeft();
    return game.players.map((o) => {
      if (o.id === pid) return 0;
      const exposed = o.melds.filter((m) => m.type !== 'ankong').length;
      if (exposed >= 3) return 1;
      if (exposed === 2) return left < 40 ? 0.6 : 0.3;
      if (left < 20) return 0.4;
      return 0;
    });
  }

  function dangerOf(t, game, pid, unseen, threats) {
    let d = 0;
    for (const o of game.players) {
      const th = threats[o.id];
      if (!th) continue;
      if (o.river.some((x) => x.t === t)) continue; // 現物
      let base;
      if (t >= 27) {
        base = unseen[t] === 0 ? 0 : unseen[t] === 1 ? 1.5 : unseen[t] === 2 ? 3 : 4.5;
      } else {
        const r = t % 9;
        base = r === 0 || r === 8 ? 4 : r === 1 || r === 7 ? 6 : 8;
        const s = Math.floor(t / 9) * 9;
        const suji = [t - 3, t + 3].some((y) => y >= s && y < s + 9 && o.river.some((x) => x.t === y));
        if (suji) base *= 0.6;
      }
      d += th * base;
    }
    return d;
  }

  function idOfType(hand, t) {
    for (let i = hand.length - 1; i >= 0; i--) if (hand[i].t === t) return hand[i].id;
    return hand[hand.length - 1].id;
  }

  MJ.AI = {
    discard(game, pid, level) {
      const p = game.players[pid];
      const c = MJ.countsOf(p.hand);
      const N = game.needSets(pid);

      if (level === 'easy') {
        const list = evalDiscards(c, N, null);
        const minS = Math.min(...list.map((x) => x.s));
        const slack = rnd() < 0.1 ? 1 : 0;
        const cands = list.filter((x) => x.s <= minS + slack);
        return idOfType(p.hand, pick(cands).t);
      }

      if (level === 'normal') {
        const unseen = unseenFor(game, pid, false);
        const list = evalDiscards(c, N, unseen);
        list.sort((a, b) => a.s - b.s || b.uk - a.uk || keepScore(a.t, c) - keepScore(b.t, c) || rnd() - 0.5);
        return idOfType(p.hand, list[0].t);
      }

      // hard
      const unseen = unseenFor(game, pid, true);
      const list = evalDiscards(c, N, unseen);
      const minS = Math.min(...list.map((x) => x.s));
      const threats = threatLevels(game, pid);
      const maxTh = Math.max(...threats);
      // 有人亮出三組以上且自己離聽牌還遠 → 棄胡防守；其他情況只在同分時挑安全牌
      const w = maxTh >= 1 ? (minS >= 2 ? 150 : 3) : maxTh > 0 ? 2 : 0;
      if (minS >= 1 && minS <= 3) {
        const top = list.filter((x) => x.s === minS).sort((a, b) => b.uk - a.uk).slice(0, 5);
        for (const x of top) {
          c[x.t]--;
          x.uk2 = ukeire2(c, N, x.s, unseen);
          c[x.t]++;
        }
      }
      let best = null;
      for (const x of list) {
        let score = -x.s * 1000 + x.uk * 2 + (x.uk2 || 0) * 0.06 + (5 - keepScore(x.t, c));
        if (w) score -= w * dangerOf(x.t, game, pid, unseen, threats);
        x.score = score;
        if (!best || score > best.score) best = x;
      }
      return idOfType(p.hand, best.t);
    },

    selfAction(game, pid, opts, level) {
      if (opts.hu) return { type: 'hu' };
      const p = game.players[pid];
      const c = MJ.countsOf(p.hand);
      const N = game.needSets(pid);
      const bd = bestAfterDiscard(c, N);
      for (const t of opts.ankong) {
        c[t] -= 4;
        const s = MJ.shanten(c, N - 1);
        c[t] += 4;
        if (level === 'easy' || s <= bd) return { type: 'ankong', t };
      }
      for (const t of opts.jiakong) {
        c[t]--;
        const s = MJ.shanten(c, N);
        c[t]++;
        if (level === 'easy' || s <= bd) return { type: 'jiakong', t };
      }
      return null;
    },

    claim(game, pid, tile, opts, level) {
      if (opts.hu) return { type: 'hu' };
      const p = game.players[pid];
      const t = tile.t;

      const c = MJ.countsOf(p.hand);
      const N = game.needSets(pid);
      const cur = MJ.shanten(c, N);
      const valueTile = isValueHonor(t, game, pid);
      if (level === 'easy') {
        // 新手：只要不會變差就有機會吃碰，常常亂吃
        if (opts.kong && rnd() < 0.6) return { type: 'kong' };
        if (opts.pong) {
          c[t] -= 2;
          const s = bestAfterDiscard(c, N - 1);
          c[t] += 2;
          if (s <= cur && rnd() < 0.6) return { type: 'pong' };
        }
        if (opts.chi.length && rnd() < 0.5) {
          const combo = pick(opts.chi);
          c[combo[0]]--;
          c[combo[1]]--;
          const s = bestAfterDiscard(c, N - 1);
          c[combo[0]]++;
          c[combo[1]]++;
          if (s <= cur) return { type: 'chi', combo };
        }
        return null;
      }

      if (opts.kong) {
        c[t] -= 3;
        const s = MJ.shanten(c, N - 1);
        c[t] += 3;
        if (s <= cur) return { type: 'kong' };
      }
      if (opts.pong) {
        c[t] -= 2;
        const s = bestAfterDiscard(c, N - 1);
        c[t] += 2;
        if (s < cur) return { type: 'pong' };
        if (valueTile && s <= cur) return { type: 'pong' };
      }
      if (opts.chi.length) {
        let best = null;
        for (const combo of opts.chi) {
          c[combo[0]]--;
          c[combo[1]]--;
          const s = bestAfterDiscard(c, N - 1);
          c[combo[0]]++;
          c[combo[1]]++;
          if (!best || s < best.s) best = { s, combo };
        }
        if (best.s < cur) return { type: 'chi', combo: best.combo };
      }
      return null;
    },
  };

  MJ.makeAI = function (level) {
    return {
      isHuman: false,
      level,
      selfAction: (g, pid, o) => MJ.AI.selfAction(g, pid, o, level),
      discard: (g, pid) => MJ.AI.discard(g, pid, level),
      claim: (g, pid, tile, o) => MJ.AI.claim(g, pid, tile, o, level),
    };
  };
})();
