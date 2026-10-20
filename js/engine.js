/* 牌局流程（與畫面無關，可在 Node 裡測試）
 * 玩家順序：0 自己(下方) → 1 下家(右) → 2 對家(上) → 3 上家(左)
 * controller 介面：
 *   selfAction(game, pid, opts, drawn) -> {type:'hu'|'ankong'|'jiakong'|'discard', t?, tileId?} | null
 *   discard(game, pid, drawn) -> tileId
 *   claim(game, pid, tile, opts) -> {type:'hu'|'kong'|'pong'|'chi', combo?} | null
 */
(function () {
  'use strict';
  const MJ = (globalThis.MJ = globalThis.MJ || {});
  const DEAD = MJ.DEAD_WALL;

  class RoundEnd {
    constructor(result) {
      this.result = result;
    }
  }

  class Game {
    constructor(settings, controllers, ui) {
      this.settings = settings;
      this.controllers = controllers;
      this.ui = ui || {};
      this.rng = settings.rng || Math.random;
      this.players = [0, 1, 2, 3].map((i) => ({
        id: i,
        name: settings.names[i],
        isHuman: !!controllers[i].isHuman,
        score: 0,
        hand: [],
        melds: [],
        flowers: [],
        river: [],
      }));
      this.dealer = settings.firstDealer !== undefined ? settings.firstDealer : Math.floor(this.rng() * 4);
      this.streak = 0;
      this.dealerPasses = 0;
      this.roundWind = 0;
      this.handNo = 0;
      this.wall = [];
      this.history = [];
    }

    log(msg) {
      if (this.ui.log) this.ui.log(msg);
    }
    render() {
      if (this.ui.render) this.ui.render(this);
    }
    async wait(factor) {
      if (this.ui.sleep) await this.ui.sleep((this.settings.speed || 0) * (factor === undefined ? 1 : factor));
    }
    get gameOver() {
      return this.roundWind >= this.settings.rounds;
    }
    seatWind(pid) {
      return (pid - this.dealer + 4) % 4;
    }
    needSets(pid) {
      return 5 - this.players[pid].melds.length;
    }
    wallLeft() {
      return Math.max(0, this.wall.length - DEAD);
    }
    name(pid) {
      return this.players[pid].name;
    }

    setupRound() {
      this.handNo++;
      this.wall = MJ.buildWall(this.rng);
      for (const p of this.players) {
        p.hand = [];
        p.melds = [];
        p.flowers = [];
        p.river = [];
      }
      this.lastDiscard = null;
      this.justDrawn = null;
      this.current = this.dealer;
      this.anyCall = false;
      this.discardCount = 0;
      this.drawCount = [0, 0, 0, 0];
      for (let r = 0; r < 4; r++) {
        for (let k = 0; k < 4; k++) {
          const pid = (this.dealer + k) % 4;
          for (let j = 0; j < 4; j++) this.players[pid].hand.push(this.wall.shift());
        }
      }
      for (const p of this.players) MJ.sortTiles(p.hand);
    }

    revealFlower(pid, tile) {
      const p = this.players[pid];
      p.flowers.push(tile);
      p.flowers.sort((a, b) => a.t - b.t);
      this.log(`${p.name} 補花 ${MJ.tileName(tile.t)}`);
      if (p.flowers.length === 8) this.settleSpecial(pid, null, '八仙過海');
      for (const q of this.players) {
        if (q.id !== pid && q.flowers.length === 7) this.settleSpecial(q.id, pid, '七搶一');
      }
    }

    initialFlowers() {
      for (let k = 0; k < 4; k++) {
        const pid = (this.dealer + k) % 4;
        const hand = this.players[pid].hand;
        let i;
        while ((i = hand.findIndex((x) => MJ.isFlower(x.t))) >= 0) {
          const tile = hand.splice(i, 1)[0];
          this.revealFlower(pid, tile);
          if (this.wall.length <= DEAD) throw new RoundEnd({ type: 'draw' });
          hand.push(this.wall.pop());
        }
        MJ.sortTiles(hand);
      }
    }

    drawTile(pid, fromBack) {
      if (this.wall.length <= DEAD) throw new RoundEnd({ type: 'draw' });
      let tile = fromBack ? this.wall.pop() : this.wall.shift();
      while (MJ.isFlower(tile.t)) {
        this.revealFlower(pid, tile);
        if (this.wall.length <= DEAD) throw new RoundEnd({ type: 'draw' });
        tile = this.wall.pop();
      }
      this.players[pid].hand.push(tile);
      this.drawCount[pid]++;
      this.justDrawn = { pid, id: tile.id };
      return tile;
    }

    selfOptions(pid, afterCall) {
      const p = this.players[pid];
      const c = MJ.countsOf(p.hand);
      const N = this.needSets(pid);
      const o = { hu: false, ankong: [], jiakong: [] };
      if (afterCall) return o;
      o.hu = MJ.shanten(c, N) === -1;
      if (this.wall.length > DEAD) {
        for (let t = 0; t < 34; t++) if (c[t] === 4) o.ankong.push(t);
        for (const m of p.melds) if (m.type === 'pung' && c[m.t] > 0) o.jiakong.push(m.t);
      }
      return o;
    }

    claimOptions(pid, from, tile) {
      const p = this.players[pid];
      const c = MJ.countsOf(p.hand);
      const t = tile.t;
      const N = this.needSets(pid);
      const o = { hu: false, pong: false, kong: false, chi: [] };
      c[t]++;
      o.hu = MJ.shanten(c, N) === -1;
      c[t]--;
      if (N > 0) {
        if (c[t] >= 2) o.pong = true;
        if (c[t] >= 3 && this.wall.length > DEAD) o.kong = true;
        if (pid === (from + 1) % 4 && t < 27) {
          const r = t % 9;
          if (r >= 2 && c[t - 2] && c[t - 1]) o.chi.push([t - 2, t - 1]);
          if (r >= 1 && r <= 7 && c[t - 1] && c[t + 1]) o.chi.push([t - 1, t + 1]);
          if (r <= 6 && c[t + 1] && c[t + 2]) o.chi.push([t + 1, t + 2]);
        }
      }
      return o.hu || o.pong || o.kong || o.chi.length ? o : null;
    }

    takeFromHand(pid, t) {
      const hand = this.players[pid].hand;
      const i = hand.findIndex((x) => x.t === t);
      return hand.splice(i, 1)[0];
    }

    doCall(claim, from, tile) {
      const pid = claim.pid;
      const p = this.players[pid];
      const t = tile.t;
      let meld;
      if (claim.type === 'pong') {
        meld = { type: 'pung', t, tiles: [this.takeFromHand(pid, t), this.takeFromHand(pid, t), tile], from };
        this.log(`${p.name} 碰 ${MJ.tileName(t)}`);
      } else if (claim.type === 'kong') {
        meld = { type: 'kong', t, tiles: [this.takeFromHand(pid, t), this.takeFromHand(pid, t), this.takeFromHand(pid, t), tile], from };
        this.log(`${p.name} 槓 ${MJ.tileName(t)}`);
      } else {
        const [a, b] = claim.combo;
        const tiles = [this.takeFromHand(pid, a), this.takeFromHand(pid, b), tile].sort((x, y) => x.t - y.t);
        meld = { type: 'chow', t: tiles[0].t, tiles, from, called: tile.id };
        this.log(`${p.name} 吃 ${MJ.tileName(t)}`);
      }
      p.melds.push(meld);
      this.anyCall = true;
    }

    doAnkong(pid, t) {
      const p = this.players[pid];
      const tiles = [0, 1, 2, 3].map(() => this.takeFromHand(pid, t));
      p.melds.push({ type: 'ankong', t, tiles });
      this.log(`${p.name} 暗槓`);
    }

    doJiakong(pid, t) {
      const p = this.players[pid];
      const tile = this.takeFromHand(pid, t);
      const m = p.melds.find((x) => x.type === 'pung' && x.t === t);
      m.type = 'kong';
      m.tiles.push(tile);
      this.log(`${p.name} 加槓 ${MJ.tileName(t)}`);
      return { tile, meld: m };
    }

    async robKongCheck(pid, tile, meld) {
      for (let k = 1; k <= 3; k++) {
        const q = (pid + k) % 4;
        const c = MJ.countsOf(this.players[q].hand);
        c[tile.t]++;
        if (MJ.shanten(c, this.needSets(q)) !== -1) continue;
        const d = await this.controllers[q].claim(this, q, tile, { hu: true, pong: false, kong: false, chi: [], robKong: true });
        if (d && d.type === 'hu') {
          meld.type = 'pung';
          meld.tiles.pop();
          this.settleWin(q, pid, { winTile: tile.t, tileObj: tile, robKong: true });
        }
      }
    }

    async resolveClaims(from, tile) {
      const order = [1, 2, 3].map((k) => (from + k) % 4);
      const opts = {};
      for (const pid of order) {
        const o = this.claimOptions(pid, from, tile);
        if (o) opts[pid] = o;
      }
      const dec = {};
      for (const pid of order) {
        if (!opts[pid] || this.players[pid].isHuman) continue;
        dec[pid] = await this.controllers[pid].claim(this, pid, tile, opts[pid]);
      }
      const rank = (t) => (t === 'hu' ? 3 : t === 'pong' || t === 'kong' ? 2 : t === 'chi' ? 1 : 0);
      const pick = () => {
        let best = null;
        for (const pid of order) {
          const d = dec[pid];
          if (!d) continue;
          if (!best || rank(d.type) > rank(best.type)) best = Object.assign({}, d, { pid });
        }
        return best;
      };
      const human = order.find((pid) => this.players[pid].isHuman && opts[pid]);
      if (human !== undefined) {
        const best = pick();
        const o = Object.assign({}, opts[human], { chi: opts[human].chi.slice() });
        if (best) {
          const br = rank(best.type);
          const beats = (r) => r > br || (r === br && r === 3 && order.indexOf(human) < order.indexOf(best.pid));
          if (!beats(3)) o.hu = false;
          if (!beats(2)) {
            o.pong = false;
            o.kong = false;
          }
          if (!beats(1)) o.chi = [];
        }
        if (o.hu || o.pong || o.kong || o.chi.length) {
          const d = await this.controllers[human].claim(this, human, tile, o);
          if (d) dec[human] = d;
        }
      }
      return pick();
    }

    async playRound() {
      this.setupRound();
      this.log(`—— ${MJ.WINDS[this.roundWind]}風圈 第 ${this.handNo} 局，莊家：${this.name(this.dealer)}${this.streak ? `（連 ${this.streak}）` : ''} ——`);
      this.render();
      let result;
      try {
        this.initialFlowers();
        this.render();
        await this.wait(1);
        let cur = this.dealer;
        let needDraw = true;
        let fromBack = false;
        let afterCall = false;
        for (;;) {
          this.current = cur;
          const p = this.players[cur];
          const ctrl = this.controllers[cur];
          let drawn = null;
          let kongDraw = false;
          if (needDraw) {
            drawn = this.drawTile(cur, fromBack);
            kongDraw = fromBack;
            this.render();
          } else {
            this.justDrawn = null;
          }

          let preDiscard = null;
          for (;;) {
            const opts = this.selfOptions(cur, afterCall);
            if (!(opts.hu || opts.ankong.length || opts.jiakong.length)) break;
            if (!p.isHuman) await this.wait(0.6);
            const act = await ctrl.selfAction(this, cur, opts, drawn);
            if (!act) break;
            if (act.type === 'discard') {
              preDiscard = act.tileId;
              break;
            }
            if (act.type === 'hu') {
              this.settleWin(cur, null, { winTile: drawn ? drawn.t : null, kongDraw });
            }
            if (act.type === 'ankong') {
              this.doAnkong(cur, act.t);
              this.render();
              await this.wait(0.6);
              drawn = this.drawTile(cur, true);
              kongDraw = true;
              this.render();
              continue;
            }
            if (act.type === 'jiakong') {
              const r = this.doJiakong(cur, act.t);
              this.render();
              await this.wait(0.6);
              await this.robKongCheck(cur, r.tile, r.meld);
              drawn = this.drawTile(cur, true);
              kongDraw = true;
              this.render();
              continue;
            }
            break;
          }

          let tileId = preDiscard;
          if (tileId === null) {
            if (!p.isHuman) await this.wait(1);
            tileId = await ctrl.discard(this, cur, drawn);
          }
          const idx = p.hand.findIndex((x) => x.id === tileId);
          const tile = p.hand.splice(idx < 0 ? p.hand.length - 1 : idx, 1)[0];
          MJ.sortTiles(p.hand);
          p.river.push(tile);
          this.justDrawn = null;
          this.lastDiscard = { pid: cur, tile };
          this.discardCount++;
          this.log(`${p.name} 打出 ${MJ.tileName(tile.t)}`);
          this.render();
          await this.wait(0.5);

          const claim = await this.resolveClaims(cur, tile);
          if (!claim) {
            cur = (cur + 1) % 4;
            needDraw = true;
            fromBack = false;
            afterCall = false;
            continue;
          }
          if (claim.type === 'hu') {
            this.settleWin(claim.pid, cur, { winTile: tile.t, tileObj: tile, riverLast: this.wall.length <= DEAD });
          }
          p.river.pop();
          this.lastDiscard = null;
          this.doCall(claim, cur, tile);
          cur = claim.pid;
          this.current = cur;
          this.render();
          await this.wait(0.6);
          if (claim.type === 'kong') {
            needDraw = true;
            fromBack = true;
            afterCall = false;
          } else {
            needDraw = false;
            afterCall = true;
          }
        }
      } catch (e) {
        if (!(e instanceof RoundEnd)) throw e;
        result = e.result;
      }
      result.dealer = this.dealer;
      result.streak = this.streak;
      result.roundWind = this.roundWind;
      result.handNo = this.handNo;
      if (result.type === 'draw') this.log('流局');
      this.history.push(result);
      this.finishRound(result);
      this.render();
      return result;
    }

    dealerTai() {
      return 1 + 2 * this.streak;
    }

    pay(winner, loser, tai) {
      const base = this.settings.base;
      const per = this.settings.perTai;
      const payers = loser === null ? [0, 1, 2, 3].filter((i) => i !== winner) : [loser];
      const payments = [0, 0, 0, 0];
      const detail = [];
      for (const q of payers) {
        const extra = winner === this.dealer || q === this.dealer ? this.dealerTai() : 0;
        const t = tai + extra;
        const amt = base + per * t;
        payments[q] -= amt;
        payments[winner] += amt;
        detail.push({ pid: q, tai: t, amt });
      }
      for (let i = 0; i < 4; i++) this.players[i].score += payments[i];
      return { payments, detail };
    }

    dealerItems(winner, loser) {
      const involved = winner === this.dealer || loser === null || loser === this.dealer;
      if (!involved) return [];
      const items = [['莊家', 1]];
      if (this.streak) items.push([`連${this.streak}拉${this.streak}`, 2 * this.streak]);
      return items;
    }

    settleWin(winner, loser, info) {
      const p = this.players[winner];
      if (loser !== null) {
        p.hand.push(info.tileObj);
        const lr = this.players[loser].river;
        if (lr[lr.length - 1] === info.tileObj) lr.pop();
      }
      const winTileObj = loser !== null ? info.tileObj : p.hand.find((x) => this.justDrawn && x.id === this.justDrawn.id) || p.hand[p.hand.length - 1];
      const winTile = info.winTile !== null && info.winTile !== undefined ? info.winTile : winTileObj.t;
      const c = MJ.countsOf(p.hand);
      const N = this.needSets(winner);
      const before = c.slice();
      before[winTile]--;
      const waitsCount = MJ.waits(before, N).length;
      const selfDraw = loser === null;
      const flags = {
        kongDraw: !!info.kongDraw,
        robKong: !!info.robKong,
        lastTile: selfDraw ? this.wall.length <= DEAD : !!info.riverLast,
        tianhu: selfDraw && winner === this.dealer && this.drawCount[winner] === 1 && this.discardCount === 0,
        dihu: selfDraw && winner !== this.dealer && this.drawCount[winner] === 1 && !this.anyCall,
      };
      const sc = MJ.scoreWin({
        concealed: c,
        melds: p.melds,
        flowers: p.flowers.map((f) => f.t),
        winTile,
        selfDraw,
        seatWind: this.seatWind(winner),
        roundWind: this.roundWind,
        waitsCount,
        flags,
      });
      const pay = this.pay(winner, loser, sc.tai);
      MJ.sortTiles(p.hand);
      this.log(selfDraw ? `${p.name} 自摸！` : `${p.name} 胡牌！${this.name(loser)} 放槍`);
      throw new RoundEnd({
        type: 'win',
        winner,
        loser,
        selfDraw,
        winTile,
        winTileId: winTileObj ? winTileObj.id : null,
        items: sc.items,
        tai: sc.tai,
        dealerItems: this.dealerItems(winner, loser),
        payments: pay.payments,
        detail: pay.detail,
        robKong: !!info.robKong,
      });
    }

    settleSpecial(winner, loser, name) {
      const items = [[name, 8]];
      const pay = this.pay(winner, loser, 8);
      this.log(`${this.name(winner)} ${name}！`);
      throw new RoundEnd({
        type: 'win',
        special: name,
        winner,
        loser,
        selfDraw: loser === null,
        winTile: null,
        items,
        tai: 8,
        dealerItems: this.dealerItems(winner, loser),
        payments: pay.payments,
        detail: pay.detail,
      });
    }

    finishRound(result) {
      if (result.type === 'win' && result.winner !== this.dealer) {
        this.dealer = (this.dealer + 1) % 4;
        this.streak = 0;
        this.dealerPasses++;
        this.roundWind = Math.floor(this.dealerPasses / 4);
      } else {
        this.streak++;
      }
    }
  }

  MJ.Game = Game;
  MJ.RoundEnd = RoundEnd;
})();
