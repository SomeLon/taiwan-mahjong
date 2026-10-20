/* 畫面與玩家操作 */
(function () {
  'use strict';
  const MJ = globalThis.MJ;
  const $ = (id) => document.getElementById(id);
  const T = (t, cls, attrs) => MJ.tileHTML(t, cls, attrs);
  const SPEEDS = { slow: 900, normal: 520, fast: 220 };
  const STAKES = { '30/10': [30, 10], '50/20': [50, 20], '100/20': [100, 20], '300/100': [300, 100] };
  const SETTINGS_KEY = 'twmj.settings.v1';
  const NAMES = ['你', '下家', '對家', '上家'];

  function loadSettings() {
    const def = { level: 'normal', mode: 'normal', rounds: 1, stakes: '50/20', speed: 'normal', hint: true };
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      return Object.assign(def, s || {});
    } catch (e) {
      return def;
    }
  }
  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
      /* 無法儲存就算了 */
    }
  }

  const fmt = (n) => (n > 0 ? '+' : '') + n.toLocaleString('zh-TW');

  const UI = {
    game: null,
    prompt: null,
    selectedId: null,
    focusT: null,
    logs: [],
    reveal: false,
    level: 'normal',

    log(msg) {
      UI.logs.push(msg);
      if (UI.logs.length > 80) UI.logs.shift();
    },
    sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    },

    /* ---------- 畫面 ---------- */
    render(game) {
      game = game || UI.game;
      if (!game || !game.wall) return;
      UI.renderTop(game);
      for (let pid = 1; pid <= 3; pid++) UI.renderOpponent(game, pid);
      UI.renderMine(game);
      for (let pid = 0; pid < 4; pid++) UI.renderRiver(game, pid);
      UI.renderInfo(game);
      UI.renderPopup(game);
      UI.markSame(game);
    },

    /* 把場上同一種牌加外框：手牌選取中的牌，或點過的牌 */
    focusType(game) {
      if (UI.selectedId !== null) {
        const sel = game.players[0].hand.find((x) => x.id === UI.selectedId);
        if (sel) return sel.t;
      }
      return UI.focusT;
    },
    markSame(game) {
      const ft = UI.focusType(game);
      document.querySelectorAll('#table .tile[data-t]').forEach((el) => {
        el.classList.toggle('same', ft !== null && ft !== undefined && +el.dataset.t === ft);
      });
    },
    toggleFocus(t) {
      UI.focusT = UI.focusT === t ? null : t;
      UI.render();
    },

    /* 吃碰槓胡、自摸的提示框，顯示在桌面中央 */
    renderPopup(game) {
      const el = $('callpop');
      const pr = UI.prompt;
      let html = '';
      if (pr && pr.kind === 'claim') {
        const o = pr.opts;
        const who = o.robKong ? `${game.name(game.current)} 加槓` : `${game.name(game.lastDiscard ? game.lastDiscard.pid : game.current)} 打出`;
        let btns = '';
        if (o.hu) btns += `<button class="btn hu" data-act="hu" type="button">胡</button>`;
        if (o.kong) btns += `<button class="btn" data-act="kong" type="button">槓</button>`;
        if (o.pong) btns += `<button class="btn" data-act="pong" type="button">碰</button>`;
        for (const combo of o.chi) {
          const ts = [combo[0], combo[1], pr.tile.t].sort((a, b) => a - b);
          btns += `<button class="btn secondary chi-btn" data-act="chi:${combo[0]},${combo[1]}" type="button">吃 ${ts
            .map((t) => T(t, t === pr.tile.t ? 'called' : ''))
            .join('')}</button>`;
        }
        btns += `<button class="btn ghost" data-act="pass" type="button">過</button>`;
        const title = o.hu ? '可以胡牌！' : o.kong ? '可以槓' : o.pong ? '可以碰' : '可以吃';
        html = `<div class="pop-title ${o.hu ? 'hot' : ''}">${title}</div>
          <div class="pop-tile">${T(pr.tile.t, 'big')}<span>${who}</span></div>
          <div class="pop-btns">${btns}</div>`;
      } else if (pr && pr.kind === 'self' && !UI.selfDismissed) {
        const o = pr.opts;
        let btns = '';
        if (o.hu) btns += `<button class="btn hu" data-act="hu" type="button">自摸</button>`;
        for (const t of o.ankong) btns += `<button class="btn" data-act="ankong:${t}" type="button">暗槓 ${MJ.tileName(t)}</button>`;
        for (const t of o.jiakong) btns += `<button class="btn" data-act="jiakong:${t}" type="button">加槓 ${MJ.tileName(t)}</button>`;
        btns += `<button class="btn ghost" data-act="dismiss" type="button">不要，繼續出牌</button>`;
        html = `<div class="pop-title ${o.hu ? 'hot' : ''}">${o.hu ? '可以自摸！' : '可以槓'}</div>
          <div class="pop-btns">${btns}</div>`;
      }
      el.innerHTML = html;
      el.hidden = !html;
    },

    renderTop(game) {
      $('topinfo').innerHTML =
        `${game.settings.fun ? '<b>🎉 歡樂場</b>　·　' : ''}難度 <b>${MJ.LEVELS[UI.level].name}</b>　·　${game.settings.base}/${game.settings.perTai}（底/台）　·　共 <b>${game.settings.rounds}</b> 圈`;
    },

    seatHead(game, pid) {
      const p = game.players[pid];
      const sc = p.score;
      const dealer = game.dealer === pid;
      return `<div class="seat-head">
        <span class="wind">${MJ.WINDS[game.seatWind(pid)]}</span>
        <span class="pname">${p.name}</span>
        ${p.isHuman ? '' : `<span class="lvl">電腦·${MJ.LEVELS[UI.level].name}</span>`}
        ${dealer ? `<span class="badge">莊${game.streak ? ' 連' + game.streak : ''}</span>` : ''}
        ${p.ting ? '<span class="badge ting">聽</span>' : ''}
        <span class="score ${sc < 0 ? 'neg' : sc > 0 ? 'pos' : ''}">${fmt(sc)}</span>
      </div>`;
    },

    meldHTML(m, own, size) {
      const cls = size || '';
      if (m.type === 'ankong') {
        if (own || UI.reveal) return `<div class="meld">${T(null, cls)}${T(m.t, cls)}${T(m.t, cls)}${T(null, cls)}</div>`;
        return `<div class="meld">${T(null, cls)}${T(null, cls)}${T(null, cls)}${T(null, cls)}</div>`;
      }
      return `<div class="meld">${m.tiles.map((x) => T(x.t, cls)).join('')}</div>`;
    },

    flowersHTML(p, cls) {
      return p.flowers.length ? `<div class="flowers">${p.flowers.map((f) => T(f.t, cls || 'mini')).join('')}</div>` : '';
    },

    renderOpponent(game, pid) {
      const p = game.players[pid];
      const el = $('seat-' + pid);
      el.classList.toggle('active', game.current === pid && !UI.reveal);
      const hand = UI.reveal
        ? `<div class="backs">${p.hand.map((x) => T(x.t)).join('')}</div>`
        : `<div class="backs">${p.hand.map(() => T(null)).join('')}</div>`;
      el.innerHTML = `${UI.seatHead(game, pid)}
        <div class="row">${UI.flowersHTML(p)}</div>
        <div class="melds">${p.melds.map((m) => UI.meldHTML(m, false)).join('')}</div>
        ${hand}`;
    },

    renderRiver(game, pid) {
      const p = game.players[pid];
      const ld = game.lastDiscard;
      $('river-' + pid).innerHTML = p.river
        .map((x) => T(x.t, (ld && ld.tile.id === x.id ? 'last ' : '') + (p.tingTileId === x.id ? 'tingmark' : '')))
        .join('');
    },

    renderInfo(game) {
      const recent = UI.logs.slice(-5).map((s) => `<div>${s}</div>`).join('');
      $('info').innerHTML = `
        <div class="round">${MJ.WINDS[Math.min(game.roundWind, 3)]}風圈 · 第 ${game.handNo} 局</div>
        <div class="label">剩餘牌數</div>
        <div class="big-num">${game.wallLeft()}</div>
        <div class="label">莊家：${game.players[game.dealer].name}${game.streak ? `（連 ${game.streak}）` : ''}</div>
        <div class="logs">${recent}</div>`;
    },

    computeHints(game) {
      const p = game.players[0];
      const c = MJ.countsOf(p.hand);
      const N = game.needSets(0);
      const unseen = MJ.unseenFor(game, 0, true);
      const res = { byType: {}, current: null };
      const describe = (cc) => {
        const ws = MJ.waits(cc, N);
        return { waits: ws.map((t) => ({ t, left: unseen[t] })), total: ws.reduce((s, t) => s + unseen[t], 0) };
      };
      if (p.hand.length === 3 * N + 2) {
        let best = 99;
        for (let t = 0; t < 34; t++) {
          if (!c[t]) continue;
          c[t]--;
          const s = MJ.shanten(c, N);
          if (s < best) best = s;
          if (s === 0) res.byType[t] = describe(c);
          c[t]++;
        }
        res.shanten = best;
      } else {
        res.shanten = MJ.shanten(c, N);
        if (res.shanten === 0) res.current = describe(c);
      }
      return res;
    },

    tenpaiDiscards(game) {
      const p = game.players[0];
      const c = MJ.countsOf(p.hand);
      const N = game.needSets(0);
      const out = new Set();
      if (p.hand.length !== 3 * N + 2) return out;
      for (let t = 0; t < 34; t++) {
        if (!c[t]) continue;
        c[t]--;
        if (MJ.shanten(c, N) === 0) out.add(t);
        c[t]++;
      }
      return out;
    },

    waitsHTML(info) {
      if (!info.waits.length) return '（聽的牌都看不到了）';
      return info.waits.map((w) => `${T(w.t)}<span>×${w.left}</span>`).join(' ') + `　共 <b>${info.total}</b> 張`;
    },

    renderMine(game) {
      const p = game.players[0];
      const el = $('seat-0');
      const pr = UI.prompt;
      el.classList.toggle('active', game.current === 0 && !UI.reveal);
      const canDiscard = pr && (pr.kind === 'self' || pr.kind === 'discard');
      const hints = UI.settings.hint && !UI.reveal ? UI.computeHints(game) : null;

      // 剛摸的牌放最右邊
      const drawnId = game.justDrawn && game.justDrawn.pid === 0 && canDiscard ? game.justDrawn.id : null;
      const tiles = p.hand.filter((x) => x.id !== drawnId);
      const drawn = p.hand.find((x) => x.id === drawnId);
      if (drawn) tiles.push(drawn);
      const handHTML = tiles
        .map((x) => {
          const cls = ['big'];
          if (x.id === UI.selectedId) cls.push('sel');
          if (drawn && x.id === drawn.id) cls.push('drawn');
          if (hints && canDiscard && hints.byType[x.t]) cls.push('tp');
          if (UI.reveal && UI.resultWinId === x.id) cls.push('win');
          return T(x.t, cls.join(' '), `data-id="${x.id}"`);
        })
        .join('');

      // 動作列（吃碰槓胡的按鈕在桌面中央）
      let actions = '';
      if (p.ting && !UI.reveal) {
        actions = `<span class="ting-badge">聽牌中</span><span class="prompt-text">電腦幫你自動摸打，胡了會自動喊胡</span>`;
      } else if (canDiscard) {
        const tp = UI.tenpaiDiscards(game);
        const sel = p.hand.find((x) => x.id === UI.selectedId);
        if (tp.size) {
          if (sel && tp.has(sel.t)) actions += `<button class="btn ting" data-act="ting" type="button">打 ${MJ.tileName(sel.t)} 聽牌（＋1台）</button>`;
          else actions += `<button class="btn ting" type="button" disabled>聽牌</button><span class="prompt-text">先選一張${UI.settings.hint ? '有綠點的' : '打了會聽的'}牌</span>`;
        }
        actions += `<span class="prompt-text">點一下選牌，再點一下打出</span>`;
      } else if (pr && pr.kind === 'claim') {
        actions = `<span class="prompt-text">請在桌面中央選擇要不要吃碰</span>`;
      } else if (!UI.reveal && game.current !== 0) {
        actions = `<span class="prompt-text">${game.name(game.current)} 思考中…</span>`;
      }

      // 提示
      let hintHTML = '';
      if (hints) {
        if (p.ting) {
          const cc = MJ.countsOf(p.hand);
          if (p.hand.length === 3 * game.needSets(0) + 2) cc[p.hand[p.hand.length - 1].t]--;
          const ws = MJ.waits(cc, game.needSets(0));
          const unseen = MJ.unseenFor(game, 0, true);
          hintHTML = `<b>聽牌中</b>：${UI.waitsHTML({ waits: ws.map((t) => ({ t, left: unseen[t] })), total: ws.reduce((a, t) => a + unseen[t], 0) })}`;
        } else if (canDiscard) {
          const sel = p.hand.find((x) => x.id === UI.selectedId);
          if (sel && hints.byType[sel.t]) hintHTML = `打 ${T(sel.t)} 聽：${UI.waitsHTML(hints.byType[sel.t])}`;
          else if (hints.shanten === -1) hintHTML = '<b>已經胡了，按「自摸」！</b>';
          else if (Object.keys(hints.byType).length) hintHTML = '<b>可以聽牌了！</b>打出有綠點的牌就聽';
          else hintHTML = `離聽牌還差 ${hints.shanten} 步（向聽數 ${hints.shanten}）`;
        } else if (hints.current) {
          hintHTML = `<b>聽牌中</b>：${UI.waitsHTML(hints.current)}`;
        } else if (hints.shanten > 0) {
          hintHTML = `向聽數 ${hints.shanten}`;
        }
      }

      el.innerHTML = `${UI.seatHead(game, 0)}
        <div class="mine-top">
          ${UI.flowersHTML(p)}
          <div class="melds">${p.melds.map((m) => UI.meldHTML(m, true)).join('')}</div>
        </div>
        <div class="hand ${canDiscard ? 'can-discard' : ''}" id="hand">${handHTML}</div>
        <div class="actionbar">${actions}</div>
        <div class="hint">${hintHTML}</div>`;
    },

    /* ---------- 操作 ---------- */
    onTileClick(id) {
      const pr = UI.prompt;
      if (!pr || (pr.kind !== 'self' && pr.kind !== 'discard') || UI.game.players[0].ting) {
        // 不是出牌時間：只做「找同樣的牌」
        const x = UI.game && UI.game.players[0].hand.find((h) => h.id === id);
        if (x) UI.toggleFocus(x.t);
        return;
      }
      UI.focusT = null;
      if (UI.selectedId === id) {
        UI.selectedId = null;
        UI.prompt = null;
        UI.selfDismissed = false;
        if (pr.kind === 'self') pr.resolve({ type: 'discard', tileId: id });
        else pr.resolve(id);
      } else {
        UI.selectedId = id;
        UI.render();
      }
    },

    onAction(act) {
      const pr = UI.prompt;
      if (!pr) return;
      if (act === 'dismiss') {
        UI.selfDismissed = true;
        UI.render();
        return;
      }
      if (act === 'ting') {
        if (pr.kind !== 'self' && pr.kind !== 'discard') return;
        const id = UI.selectedId;
        if (id === null) return;
        UI.prompt = null;
        UI.selectedId = null;
        UI.selfDismissed = false;
        if (pr.kind === 'self') pr.resolve({ type: 'discard', tileId: id, ting: true });
        else pr.resolve({ tileId: id, ting: true });
        UI.render();
        return;
      }
      UI.prompt = null;
      UI.selectedId = null;
      UI.selfDismissed = false;
      let d = null;
      if (act === 'hu') d = { type: 'hu' };
      else if (act === 'pong') d = { type: 'pong' };
      else if (act === 'kong') d = { type: 'kong' };
      else if (act.startsWith('ankong:')) d = { type: 'ankong', t: +act.split(':')[1] };
      else if (act.startsWith('jiakong:')) d = { type: 'jiakong', t: +act.split(':')[1] };
      else if (act.startsWith('chi:')) d = { type: 'chi', combo: act.split(':')[1].split(',').map(Number) };
      pr.resolve(d);
      UI.render();
    },

    /* ---------- 對話框 ---------- */
    openModal(html) {
      $('modal').innerHTML = html;
      $('overlay').hidden = false;
      $('modal').scrollTop = 0;
    },
    closeModal() {
      $('overlay').hidden = true;
      $('modal').innerHTML = '';
    },

    showStart() {
      const s = UI.settings;
      const radio = (name, val, cur, title, desc) =>
        `<label class="choice"><input type="radio" name="${name}" value="${val}" ${String(cur) === String(val) ? 'checked' : ''}><span><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;
      UI.openModal(`
        <div class="title-tiles">${[0, 13, 26, 27, 31, 32, 33, 34].map((t) => T(t)).join('')}</div>
        <h2>台灣十六張麻將</h2>
        <p class="sub">你和三位電腦對打。吃、碰、槓、補花、自摸、放槍都照台灣規則算台。</p>
        <h3>電腦難度</h3>
        <div class="choices">
          ${Object.keys(MJ.LEVELS).map((k) => radio('level', k, s.level, MJ.LEVELS[k].name, MJ.LEVELS[k].desc)).join('')}
        </div>
        <h3>模式</h3>
        <div class="choices">
          ${radio('mode', 'normal', s.mode, '一般場', '正常洗牌')}
          ${radio('mode', 'fun', s.mode, '歡樂場', '大家都更容易拿到大牌（清一色、碰碰胡、三元…）')}
        </div>
        <h3>打幾圈</h3>
        <div class="choices">
          ${radio('rounds', 1, s.rounds, '一圈', '約 4 局以上')}
          ${radio('rounds', 2, s.rounds, '半將（兩圈）', '')}
          ${radio('rounds', 4, s.rounds, '一將（四圈）', '東南西北')}
        </div>
        <h3>底 / 台</h3>
        <div class="choices two">
          ${Object.keys(STAKES).map((k) => radio('stakes', k, s.stakes, k, '')).join('')}
        </div>
        <h3>電腦出牌速度</h3>
        <div class="choices">
          ${radio('speed', 'slow', s.speed, '慢', '')}
          ${radio('speed', 'normal', s.speed, '普通', '')}
          ${radio('speed', 'fast', s.speed, '快', '')}
        </div>
        <label class="check"><input type="checkbox" id="opt-hint" ${s.hint ? 'checked' : ''}> 顯示聽牌提示（綠點代表打這張就聽牌）</label>
        <div class="modal-actions">
          <button class="btn ghost" type="button" data-modal="rules">台數表</button>
          <button class="btn big" type="button" data-modal="start">開始遊戲</button>
        </div>`);
    },

    readStart() {
      const m = $('modal');
      const val = (n) => {
        const el = m.querySelector(`input[name="${n}"]:checked`);
        return el ? el.value : null;
      };
      const s = {
        level: val('level') || 'normal',
        rounds: +(val('rounds') || 1),
        stakes: val('stakes') || '50/20',
        speed: val('speed') || 'normal',
        hint: $('opt-hint').checked,
        mode: val('mode') || 'normal',
      };
      UI.settings = s;
      saveSettings(s);
      return s;
    },

    showRules(back) {
      UI.openModal(`
        <h2>台數表</h2>
        <p class="sub">計分：每家付「底 + 台數 × 每台」。自摸三家都付，放槍只有放槍的人付。莊家相關的台只算在莊家那一家。剩下 16 張牌沒人胡就流局，莊家連莊。</p>
        <table class="rules-table">${MJ.TAI_TABLE.map((r) => `<tr><td>${r[0]}</td><td>${r[1]} 台</td><td>${r[2]}</td></tr>`).join('')}</table>
        <h3>操作</h3>
        <p class="sub">點一下手牌選取，再點一下打出。有人打出你能吃、碰、槓、胡的牌時，桌面中央會跳出按鈕；吃只能吃上家（左邊）的牌。聽牌時可以選好要打的牌按「聽牌」宣告，之後由電腦自動摸打、自動胡牌，胡了多 1 台（報聽），但不能再換牌或吃碰。</p>
        <div class="modal-actions"><button class="btn" type="button" data-modal="${back || 'close'}">知道了</button></div>`);
    },

    resultHTML(game, r) {
      let head;
      if (r.type === 'draw') {
        head = `<div class="big-result">流局</div><p class="sub">牌摸完了，莊家連莊。</p>`;
      } else {
        const w = game.players[r.winner].name;
        const how = r.special ? r.special : r.selfDraw ? '自摸' : r.robKong ? `搶槓（${game.name(r.loser)}）` : `胡牌（${game.name(r.loser)} 放槍）`;
        head = `<div class="big-result ${r.winner === 0 ? 'win' : ''}">${w} ${how}</div>`;
      }
      let body = '';
      if (r.type === 'win') {
        const p = game.players[r.winner];
        const hand = p.hand.map((x) => T(x.t, x.id === r.winTileId ? 'win' : '')).join('');
        body += `<h3>胡牌牌型</h3><div class="res-hand">
          ${p.flowers.length ? `<div class="flowers">${p.flowers.map((f) => T(f.t)).join('')}</div>` : ''}
          ${p.melds.map((m) => UI.meldHTML(m, true)).join('')}
          <div class="meld">${hand}</div></div>`;
        const items = r.items.length ? r.items : [['無台（屁胡）', 0]];
        body += `<h3>台數</h3><div class="tai-list">
          ${items.map((x) => `<div>${x[0]}</div><div class="t">${x[1]} 台</div>`).join('')}
          ${r.dealerItems.map((x) => `<div>${x[0]}（莊家那家才算）</div><div class="t">${x[1]} 台</div>`).join('')}
          <div class="total">合計</div><div class="t total">${r.tai} 台${r.dealerItems.length ? ` ＋ 莊 ${r.dealerItems.reduce((s, x) => s + x[1], 0)}` : ''}</div>
        </div>`;
        body += `<h3>收付</h3><div class="pay-list">
          ${r.detail.map((d) => `<div>${game.name(d.pid)} 付給 ${game.name(r.winner)}</div><div>${d.tai} 台</div><div class="neg">-${d.amt}</div>`).join('')}
        </div>`;
      }
      body += `<h3>目前分數</h3><div class="pay-list">
        ${game.players.map((p) => `<div>${p.name}</div><div></div><div class="${p.score < 0 ? 'neg' : p.score > 0 ? 'pos' : ''}">${fmt(p.score)}</div>`).join('')}
      </div>`;
      body += `<h3>各家手牌</h3><div class="others">
        ${game.players
          .filter((p) => r.type === 'draw' || p.id !== r.winner)
          .map((p) => `<div class="o-row"><span class="nm">${p.name}</span>${p.melds.map((m) => UI.meldHTML(m, true)).join('')}<div class="meld">${p.hand.map((x) => T(x.t)).join('')}</div></div>`)
          .join('')}
      </div>`;
      return head + body;
    },

    showResult(game, r) {
      return new Promise((resolve) => {
        UI.reveal = true;
        UI.resultWinId = r.winTileId;
        UI.render(game);
        const last = game.gameOver;
        UI.openModal(`${UI.resultHTML(game, r)}
          <div class="modal-actions"><button class="btn big" type="button" data-modal="next">${last ? '看最後結果' : '下一局'}</button></div>`);
        UI.onNext = () => {
          UI.reveal = false;
          UI.resultWinId = null;
          UI.closeModal();
          resolve();
        };
      });
    },

    showFinal(game) {
      const ranked = game.players.slice().sort((a, b) => b.score - a.score);
      const meRank = ranked.findIndex((p) => p.id === 0) + 1;
      const msg = meRank === 1 ? '恭喜你拿下第一名！' : meRank === 4 ? '這次手氣不好，再來一場吧。' : `你拿到第 ${meRank} 名。`;
      UI.openModal(`<h2>牌局結束</h2><p class="sub">${msg}（共打了 ${game.history.length} 局，電腦難度：${MJ.LEVELS[UI.level].name}）</p>
        <div class="rank-list">${ranked
          .map((p, i) => `<div class="rank-item ${i === 0 ? 'first' : ''}"><span class="no">${i + 1}</span><span>${p.name}</span><span class="sc ${p.score < 0 ? 'neg' : ''}">${fmt(p.score)}</span></div>`)
          .join('')}</div>
        <div class="modal-actions"><button class="btn big" type="button" data-modal="again">再玩一場</button></div>`);
    },

    /* ---------- 遊戲開始 ---------- */
    async run() {
      const s = UI.settings;
      UI.level = s.level;
      UI.logs = [];
      const autoDelay = () => UI.sleep(Math.max(350, SPEEDS[s.speed] || 500));
      const lastDrawn = (game, drawn) => (drawn ? drawn.id : game.players[0].hand[game.players[0].hand.length - 1].id);
      const human = {
        isHuman: true,
        selfAction(game, pid, opts, drawn) {
          if (game.players[pid].ting) {
            return autoDelay().then(() => (opts.hu ? { type: 'hu' } : { type: 'discard', tileId: lastDrawn(game, drawn) }));
          }
          return new Promise((resolve) => {
            UI.selfDismissed = false;
            UI.prompt = { kind: 'self', opts, resolve };
            UI.render(game);
          });
        },
        discard(game, pid, drawn) {
          if (game.players[pid].ting) return autoDelay().then(() => lastDrawn(game, drawn));
          return new Promise((resolve) => {
            UI.prompt = { kind: 'discard', resolve };
            UI.render(game);
          });
        },
        claim(game, pid, tile, opts) {
          if (game.players[pid].ting) return autoDelay().then(() => (opts.hu ? { type: 'hu' } : null));
          return new Promise((resolve) => {
            UI.selectedId = null;
            UI.prompt = { kind: 'claim', tile, opts, resolve };
            UI.render(game);
          });
        },
      };
      const ctrls = [human, MJ.makeAI(s.level), MJ.makeAI(s.level), MJ.makeAI(s.level)];
      const [base, perTai] = STAKES[s.stakes] || STAKES['50/20'];
      const game = new MJ.Game(
        { names: NAMES, rounds: s.rounds, base, perTai, speed: SPEEDS[s.speed] || SPEEDS.normal, fun: s.mode === 'fun' },
        ctrls,
        { render: (g) => UI.render(g), log: (m) => UI.log(m), sleep: (ms) => UI.sleep(ms) }
      );
      UI.game = game;
      while (!game.gameOver) {
        const r = await game.playRound();
        await UI.showResult(game, r);
      }
      UI.showFinal(game);
    },

    init() {
      UI.settings = loadSettings();
      $('seat-0').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (b) return UI.onAction(b.dataset.act);
        const t = e.target.closest('.tile[data-id]');
        if (t) UI.onTileClick(+t.dataset.id);
      });
      // 點牌河、副露、花牌：框出場上同樣的牌
      $('table').addEventListener('click', (e) => {
        if (e.target.closest('#callpop, #hand, [data-act]')) return;
        const t = e.target.closest('.tile[data-t]');
        if (t && UI.game) UI.toggleFocus(+t.dataset.t);
      });
      // 點對話框外面：結算畫面或台數表就關閉
      $('overlay').addEventListener('click', (e) => {
        if (e.target !== $('overlay')) return;
        const b = $('modal').querySelector('[data-modal="next"], [data-modal="close"]');
        if (b) b.click();
      });
      $('callpop').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (b) UI.onAction(b.dataset.act);
      });
      $('modal').addEventListener('click', (e) => {
        const b = e.target.closest('[data-modal]');
        if (!b) return;
        const k = b.dataset.modal;
        if (k === 'start') {
          UI.readStart();
          UI.closeModal();
          UI.run().catch((err) => {
            console.error(err);
            alert('發生錯誤：' + err.message);
          });
        } else if (k === 'rules') {
          if ($('opt-hint')) UI.readStart();
          UI.showRules('back-start');
        } else if (k === 'back-start') {
          UI.showStart();
        } else if (k === 'close') {
          UI.closeModal();
        } else if (k === 'next') {
          if (UI.onNext) UI.onNext();
        } else if (k === 'again') {
          location.reload();
        }
      });
      $('btn-rules').addEventListener('click', () => {
        if (!$('overlay').hidden) return;
        UI.showRules('close');
      });
      $('btn-restart').addEventListener('click', () => {
        if (!UI.game || confirm('確定要放棄這場重新開始嗎？')) location.reload();
      });
      UI.showStart();
    },
  };

  MJ.UI = UI;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', UI.init);
    else UI.init();
  }
})();
