/* Интерфейс сайта: игра с ботом, разбор ошибок, уроки и задачи. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MATE = AI.MATE;
  const isMate = (s) => Math.abs(s) > MATE - 1000;
  const mateIn = (s) => Math.ceil((MATE - Math.abs(s)) / 2);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const Store = {
    get(k, d) { try { const v = localStorage.getItem('chess-class.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('chess-class.' + k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } },
  };

  const NOM = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };
  const ACC = { p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля' };
  const FIG = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
  const fig = (san) => esc(san).replace(/[KQRBN]/g, (c) => `<span class="fig">${FIG[c]}\uFE0E</span>`);

  const LEVELS = [
    { name: 'Новичок', desc: 'Часто ходит наугад и зевает фигуры. Для самых первых партий.', depth: 1, noise: 250, random: 0.35 },
    { name: 'Начинающий', desc: 'Забирает то, что плохо лежит, но не видит угроз.', depth: 1, noise: 80, random: 0.1 },
    { name: 'Любитель', desc: 'Считает на ход вперёд, иногда ошибается.', depth: 2, noise: 35 },
    { name: 'Клубный', desc: 'Замечает простую тактику и редко подставляет фигуры.', depth: 3, noise: 12 },
    { name: 'Сильный', desc: 'Считает варианты на несколько ходов. Нужна внимательная игра.', depth: 5, timeMs: 2000 },
    { name: 'Мастер', desc: 'Максимальная сила: думает до 4 секунд на ход.', depth: 9, timeMs: 4000 },
  ];

  const REASONS = {
    checkmate: 'мат', stalemate: 'пат', fifty: 'правило 50 ходов', repetition: 'троекратное повторение',
    material: 'недостаточно материала', resign: 'сдача',
  };

  const stateOf = (g, last) => ({
    board: g.board,
    last: last || (g.stack.length ? g.stack[g.stack.length - 1].m : null),
    check: g.inCheck() ? g.kings[g.turn] : -1,
  });
  const targetsOf = (g, sq) => [...new Set(g.moves({ square: sq }).map((m) => m.to))];
  const findMove = (g, from, to, promo) => g.moves().find((m) => m.from === from && m.to === to && (m.promo || '') === (promo || ''));
  const fmtScore = (s) => {
    if (isMate(s)) return (s > 0 ? '#' : '#−') + mateIn(s);
    const v = s / 100;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
  };

  function renderMoveList(ol, sans, startTurn, opts) {
    opts = opts || {};
    const items = [];
    const offset = startTurn === 'b' ? 1 : 0;
    for (let i = -offset; i < sans.length; i += 2) {
      const num = Math.floor((i + offset) / 2) + 1;
      const cell = (j) => {
        if (j < 0) return '<span class="mv empty">…</span>';
        if (j >= sans.length) return '';
        const badge = opts.badge ? opts.badge(j) : '';
        const cur = opts.current === j ? ' current' : '';
        return `<button type="button" class="mv${cur}${opts.cls ? ' ' + opts.cls(j) : ''}" data-ply="${j}">${fig(sans[j])}${badge}</button>`;
      };
      items.push(`<li><span class="num">${num}.</span>${cell(i)}${cell(i + 1)}</li>`);
    }
    ol.innerHTML = items.join('');
    const cur = ol.querySelector('.current') || ol.lastElementChild;
    if (cur && opts.scroll !== false) {
      const top = cur.offsetTop - ol.offsetTop;
      if (top < ol.scrollTop || top > ol.scrollTop + ol.clientHeight - 30) ol.scrollTop = top - ol.clientHeight / 2;
    }
  }

  function material(board) {
    const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    let score = 0;
    for (const p of board) {
      if (p === '.' || p === 'K' || p === 'k') continue;
      const c = p < 'a' ? 'w' : 'b', t = p.toLowerCase();
      count[c][t]++;
      score += (c === 'w' ? 1 : -1) * { p: 1, n: 3, b: 3, r: 5, q: 9 }[t];
    }
    const lost = (c) => {
      let s = '';
      for (const t of ['q', 'r', 'b', 'n', 'p']) for (let i = count[c][t]; i < start[t]; i++) s += Board.glyph(t);
      return s;
    };
    return { lostW: lost('w'), lostB: lost('b'), score };
  }

  /* ---------------------------------------------------------------- Игра */
  const Play = {
    engine: new Engine(),
    init() {
      this.board = new Board($('play-board'), {
        targets: (sq) => (this.canMove() ? targetsOf(this.g, sq) : []),
        onMove: (f, t, pr) => { const m = findMove(this.g, f, t, pr); if (m) this.move(m); },
      });
      const saved = Store.get('current', null);
      this.level = Store.get('level', 2);
      this.sideChoice = Store.get('side', 'w');
      this.flip = false;
      this.renderControls();
      $('new-game').addEventListener('click', () => this.newGame());
      $('play-undo').addEventListener('click', () => this.undo());
      $('play-hint').addEventListener('click', () => this.hint());
      $('play-flip').addEventListener('click', () => { this.flip = !this.flip; this.render(); });
      $('play-resign').addEventListener('click', () => this.resign());
      $('play-review').addEventListener('click', () => this.sendToReview());
      $('play-review-now').addEventListener('click', () => this.sendToReview());
      let restored = false;
      if (saved && saved.moves) {
        try {
          this.g = Chess.fromMoves(saved.fen, saved.moves);
          Object.assign(this, { startFen: saved.fen, moves: saved.moves, sans: saved.sans, user: saved.user, over: saved.over || null });
          this.gameLevel = saved.level ?? this.level;
          restored = true;
        } catch (e) { /* сохранённая партия повреждена */ }
      }
      if (!restored) this.newGame();
      else { this.render(); if (!this.over && this.g.turn !== this.user) this.botMove(); }
    },
    renderControls() {
      $('levels').innerHTML = LEVELS.map((l, i) =>
        `<button type="button" role="radio" aria-checked="${i === this.level}" data-level="${i}"><span class="lv-n">${i + 1}</span><span class="lv-name">${l.name}</span></button>`).join('');
      $('levels').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        this.level = +b.dataset.level; Store.set('level', this.level); this.renderControls();
      }));
      $('level-desc').textContent = LEVELS[this.level].desc;
      document.querySelectorAll('#side button').forEach((b) => {
        b.setAttribute('aria-checked', b.dataset.side === this.sideChoice);
        b.onclick = () => { this.sideChoice = b.dataset.side; Store.set('side', this.sideChoice); this.renderControls(); };
      });
    },
    canMove() { return !this.over && !this.thinking && this.g.turn === this.user; },
    newGame() {
      this.engine.cancel();
      this.token = (this.token || 0) + 1;
      this.thinking = false;
      this.user = this.sideChoice === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : this.sideChoice;
      this.startFen = Chess.START_FEN;
      this.g = new Chess();
      this.moves = []; this.sans = []; this.over = null; this.flip = false;
      this.gameLevel = this.level;
      this.hintArrow = null;
      this.save();
      this.render();
      if (this.user === 'b') this.botMove();
    },
    save() {
      Store.set('current', { fen: this.startFen, moves: this.moves, sans: this.sans, user: this.user, over: this.over, level: this.gameLevel });
    },
    move(m, fromBot) {
      const san = this.g.san(m);
      this.g.make(m);
      this.moves.push(Chess.uci(m));
      this.sans.push(san);
      this.hintArrow = null;
      const st = this.g.status();
      if (st.over) this.finish(st);
      this.save();
      this.render(true);
      if (!this.over && this.g.turn !== this.user && !fromBot) this.botMove();
    },
    async botMove() {
      const token = ++this.token;
      this.thinking = true;
      this.render();
      const lv = LEVELS[this.gameLevel ?? this.level];
      const t0 = Date.now();
      const r = await this.engine.run('think', { fen: this.startFen, moves: this.moves, level: lv });
      const wait = 350 - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      if (token !== this.token) return;
      this.thinking = false;
      const m = r && this.g.moveFromUci(r.uci);
      if (m) this.move(m, true); else this.render();
    },
    undo() {
      if (!this.moves.length) return;
      this.engine.cancel();
      this.token++;
      this.thinking = false;
      this.over = null;
      do { this.g.undo(); this.moves.pop(); this.sans.pop(); } while (this.moves.length && this.g.turn !== this.user);
      this.hintArrow = null;
      this.save();
      this.render();
      if (this.g.turn !== this.user) this.botMove();
    },
    async hint() {
      if (!this.canMove()) return;
      $('play-status').textContent = 'Ищу хороший ход…';
      const token = this.token;
      const r = await this.engine.run('best', { fen: this.startFen, moves: this.moves, depth: 6, timeMs: 1500 });
      if (token !== this.token || !r) return;
      const m = this.g.moveFromUci(r.uci);
      this.hintArrow = { from: m.from, to: m.to, kind: 'best' };
      this.hintsUsed = (this.hintsUsed || 0) + 1;
      this.render();
      $('play-status').innerHTML = `Подсказка: <b>${fig(this.g.san(m))}</b>`;
    },
    resign() {
      if (this.over || !this.moves.length) return;
      this.engine.cancel();
      this.token++;
      this.thinking = false;
      this.finish({ over: true, result: this.user === 'w' ? '0-1' : '1-0', reason: 'resign' });
      this.save();
      this.render();
    },
    finish(st) {
      this.over = st;
      const won = (st.result === '1-0' && this.user === 'w') || (st.result === '0-1' && this.user === 'b');
      const lost = st.result !== '1/2-1/2' && !won;
      const stats = Store.get('stats', {});
      const key = String(this.gameLevel ?? this.level);
      const s = stats[key] || { w: 0, l: 0, d: 0 };
      if (won) s.w++; else if (lost) s.l++; else s.d++;
      stats[key] = s;
      Store.set('stats', stats);
      this.storeLast();
    },
    storeLast() {
      Store.set('lastGame', {
        fen: this.startFen, moves: this.moves.slice(), user: this.user,
        title: `Партия против бота «${LEVELS[this.gameLevel ?? this.level].name}»`,
        result: this.over ? this.over.result : '*', date: Date.now(),
      });
    },
    sendToReview() {
      if (!this.moves.length) return;
      this.storeLast();
      location.hash = 'review';
      Review.loadLast();
    },
    render(animate) {
      const g = this.g;
      this.board.setFlipped((this.user === 'b') !== this.flip);
      this.board.set({ ...stateOf(g), animate });
      this.board.setArrows(this.hintArrow ? [this.hintArrow] : []);
      const lv = LEVELS[this.gameLevel ?? this.level];
      const mat = material(g.board);
      const strip = (who, color) => {
        const lost = color === 'w' ? mat.lostB : mat.lostW;
        const adv = (color === 'w' ? 1 : -1) * mat.score;
        return `<span class="who"><span class="dot ${color}"></span>${who}</span><span class="taken ${color === 'w' ? 'b' : 'w'}">${lost}</span>${adv > 0 ? `<span class="adv">+${adv}</span>` : ''}`;
      };
      const botColor = this.user === 'w' ? 'b' : 'w';
      const bottomIsUser = !this.flip;
      $('play-bottom').innerHTML = bottomIsUser ? strip('Вы', this.user) : strip(`Бот · ${lv.name}`, botColor);
      $('play-top').innerHTML = bottomIsUser ? strip(`Бот · ${lv.name}`, botColor) : strip('Вы', this.user);
      renderMoveList($('play-moves'), this.sans, new Chess(this.startFen).turn);
      const status = $('play-status');
      if (this.over) {
        const r = this.over;
        const won = (r.result === '1-0' && this.user === 'w') || (r.result === '0-1' && this.user === 'b');
        const text = r.result === '1/2-1/2' ? `Ничья: ${REASONS[r.reason]}.` : won ? `Победа! ${r.reason === 'resign' ? 'Бот сдался.' : 'Вы поставили мат.'}` : `Поражение: ${REASONS[r.reason]}.`;
        status.textContent = 'Партия окончена';
        $('play-result-text').textContent = `${text} Посмотрите, где были ошибки и как можно было сыграть сильнее.`;
        $('play-result').hidden = false;
      } else {
        $('play-result').hidden = true;
        if (this.thinking) status.textContent = 'Бот думает…';
        else if (!this.hintArrow) status.textContent = (g.inCheck() ? 'Шах! ' : '') + (g.turn === this.user ? 'Ваш ход' : 'Ход бота');
      }
      $('play-undo').disabled = !this.moves.length;
      $('play-resign').disabled = !!this.over || !this.moves.length;
      $('play-hint').disabled = !this.canMove();
      $('play-review-now').hidden = !!this.over || this.moves.length < 2;
      const stats = Store.get('stats', {});
      const s = stats[String(this.level)];
      $('play-stats').textContent = s ? `Против уровня «${LEVELS[this.level].name}»: побед ${s.w}, поражений ${s.l}, ничьих ${s.d}.` : '';
    },
  };

  /* ---------------------------------------------------------------- Разбор */
  const CLS = {
    best: { label: 'Лучший ход', mark: '!', kind: 'best' },
    good: { label: 'Хороший ход', mark: '', kind: 'good' },
    inaccuracy: { label: 'Неточность', mark: '?!', kind: 'inacc' },
    mistake: { label: 'Ошибка', mark: '?', kind: 'mistake' },
    blunder: { label: 'Зевок', mark: '??', kind: 'blunder' },
  };
  const clampCp = (s) => Math.max(-1500, Math.min(1500, s));
  const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

  function classify(r) {
    if (r.uci === r.best) return 'best';
    const loss = clampCp(r.bestScore) - clampCp(r.played);
    if (isMate(r.bestScore) && r.bestScore > 0 && !(isMate(r.played) && r.played > 0)) return r.played >= 500 ? 'mistake' : 'blunder';
    if (loss >= 300) return 'blunder';
    if (loss >= 120) return 'mistake';
    if (loss >= 50) return 'inaccuracy';
    return 'good';
  }

  function explain(r, before) {
    const cls = classify(r);
    const bm = before.moveFromUci(r.best);
    const bestSan = fig(before.san(bm));
    const pm = before.moveFromUci(r.uci);
    const parts = [];
    if (cls === 'best') {
      parts.push(isMate(r.bestScore) && r.bestScore > 0 ? `Лучший ход: ведёт к мату в ${mateIn(r.bestScore)}.` : 'Это лучший ход в позиции.');
      return parts.join(' ');
    }
    if (cls === 'good') return `Хороший ход. Движок предпочитает ${bestSan}, но разница небольшая.`;
    before.make(pm);
    const rm = r.reply ? before.moveFromUci(r.reply) : null;
    const replySan = rm ? fig(before.san(rm)) : '';
    before.undo();
    if (isMate(r.bestScore) && r.bestScore > 0 && !(isMate(r.played) && r.played > 0)) {
      parts.push(`Здесь был мат в ${mateIn(r.bestScore)}, начиная с хода <b>${bestSan}</b>.`);
    } else if (isMate(r.played) && r.played < 0) {
      parts.push(`После этого хода у соперника есть форсированный мат${rm ? `, начиная с <b>${replySan}</b>` : ''}.`);
    } else if (rm && rm.captured !== '.' && cls !== 'inaccuracy') {
      const t = rm.captured.toLowerCase();
      if (rm.to === pm.to) parts.push(`Вы поставили ${ACC[t]} под удар: соперник отвечает <b>${replySan}</b>.`);
      else parts.push(`Теперь соперник забирает ${ACC[t]} на ${Chess.sqName(rm.to)} ходом <b>${replySan}</b>.`);
    } else if (rm && cls !== 'inaccuracy') {
      parts.push(`Соперник получает сильный ответ <b>${replySan}</b>.`);
    }
    if (!(isMate(r.bestScore) && r.bestScore > 0)) {
      if (bm.captured !== '.' && pm.captured === '.') parts.push(`Можно было взять ${ACC[bm.captured.toLowerCase()]}: <b>${bestSan}</b>.`);
      else parts.push(`Сильнее было <b>${bestSan}</b>.`);
    }
    return parts.join(' ');
  }

  const Review = {
    engine: new Engine(),
    init() {
      this.board = new Board($('review-board'), { targets: () => [] });
      $('rv-load-last').addEventListener('click', () => this.loadLast());
      $('rv-load-last').disabled = !Store.get('lastGame', null);
      $('rv-load-pgn').addEventListener('click', () => this.loadPgn());
      $('rv-first').addEventListener('click', () => this.go(0));
      $('rv-prev').addEventListener('click', () => this.go(this.idx - 1));
      $('rv-next').addEventListener('click', () => this.go(this.idx + 1));
      $('rv-last').addEventListener('click', () => this.go(this.data ? this.data.moves.length : 0));
      $('rv-err-prev').addEventListener('click', () => this.jumpError(-1));
      $('rv-err-next').addEventListener('click', () => this.jumpError(1));
      $('rv-train').addEventListener('click', () => this.addToTraining());
      $('rv-depth').value = String(Store.get('depth', 4));
      $('rv-depth').addEventListener('change', () => { Store.set('depth', +$('rv-depth').value); if (this.data) this.start(this.data); });
      $('rv-moves').addEventListener('click', (e) => { const b = e.target.closest('[data-ply]'); if (b) this.go(+b.dataset.ply); });
      document.addEventListener('keydown', (e) => {
        if ($('view-review').hidden || /input|textarea|select/i.test(e.target.tagName)) return;
        if (e.key === 'ArrowLeft') { this.go(this.idx - 1); e.preventDefault(); }
        if (e.key === 'ArrowRight') { this.go(this.idx + 1); e.preventDefault(); }
      });
    },
    ensure() {
      if (this.data) return;
      if (!this.loadLast(true)) this.loadSample();
    },
    loadSample() {
      // Пример: короткая партия с типичными ошибками новичка
      const text = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#';
      this.loadText(text, 'w', 'Пример: ловушка Блэкберна');
    },
    loadLast() {
      const last = Store.get('lastGame', null);
      $('rv-load-last').disabled = !last;
      if (!last || !last.moves || !last.moves.length) return false;
      try {
        const g = new Chess(last.fen), sans = [];
        for (const u of last.moves) { const m = g.moveFromUci(u); sans.push(g.san(m)); g.make(m); }
        this.start({ fen: last.fen, moves: last.moves, sans, mine: last.user, title: last.title });
        return true;
      } catch (e) { return false; }
    },
    loadPgn() {
      this.loadText($('rv-pgn').value, $('rv-side').value, 'Ваша партия');
    },
    loadText(text, side, title) {
      $('rv-error').hidden = true;
      try {
        const d = parsePgn(text);
        if (!d.moves.length) throw new Error('В тексте не найдено ни одного хода.');
        this.start({ ...d, mine: side, title });
      } catch (e) {
        $('rv-error').textContent = e.message;
        $('rv-error').hidden = false;
      }
    },
    async start(data) {
      this.engine.cancel();
      const token = this.token = (this.token || 0) + 1;
      this.data = data;
      this.results = [];
      this.idx = 0;
      this.startTurn = new Chess(data.fen).turn;
      this.render();
      const depth = +$('rv-depth').value;
      $('rv-progress').hidden = false;
      for (let i = 0; i < data.moves.length; i++) {
        $('rv-progress-text').textContent = `Разбираю ход ${i + 1} из ${data.moves.length}`;
        $('rv-progress-bar').style.width = (100 * i / data.moves.length) + '%';
        const r = await this.engine.run('ply', { fen: data.fen, moves: data.moves.slice(0, i), uci: data.moves[i], depth });
        if (token !== this.token) return;
        this.results[i] = r;
        this.renderAnalysis();
      }
      $('rv-progress').hidden = true;
      if (this.idx === 0) { const first = this.errorPlies(true)[0]; if (first !== undefined) this.idx = first; }
      this.render();
    },
    moverAt(i) { return (i % 2 === 0) === (this.startTurn === 'w') ? 'w' : 'b'; },
    isMine(i) { const m = this.data.mine; return m === 'both' || !m || m === this.moverAt(i); },
    errorPlies(mineOnly) {
      return this.results.map((r, i) => (r && ['mistake', 'blunder', 'inaccuracy'].includes(classify(r)) && (!mineOnly || this.isMine(i)) ? i : -1)).filter((i) => i >= 0);
    },
    jumpError(dir) {
      const errs = this.errorPlies(false);
      const next = dir > 0 ? errs.find((i) => i > this.idx) : [...errs].reverse().find((i) => i < this.idx);
      if (next !== undefined) this.go(next);
    },
    go(i) {
      if (!this.data) return;
      this.idx = Math.max(0, Math.min(this.data.moves.length, i));
      this.render();
    },
    whiteEvalAfter(i) {
      const r = this.results[i];
      if (!r) return null;
      return this.moverAt(i) === 'w' ? r.played : -r.played;
    },
    render() {
      if (!this.data) return;
      const d = this.data, i = this.idx, n = d.moves.length;
      const g = Chess.fromMoves(d.fen, d.moves.slice(0, i));
      const flip = d.mine === 'b';
      this.board.setFlipped(flip);
      this.board.set(stateOf(g));
      const r = this.results[i];
      const arrows = [];
      if (i < n) {
        const pm = g.moveFromUci(d.moves[i]);
        const cls = r ? classify(r) : null;
        arrows.push({ from: pm.from, to: pm.to, kind: cls ? CLS[cls].kind : 'info' });
        if (r && r.best !== r.uci) { const bm = g.moveFromUci(r.best); arrows.push({ from: bm.from, to: bm.to, kind: 'best' }); }
      }
      this.board.setArrows(arrows);
      const num = Math.floor((i + (this.startTurn === 'b' ? 1 : 0)) / 2) + 1;
      $('review-caption').innerHTML = i < n
        ? `<span class="who">${esc(d.title || 'Партия')}</span><span class="cap-note">Позиция перед ходом ${num}${this.moverAt(i) === 'b' ? '…' : '.'} ${fig(d.sans[i])}</span>`
        : `<span class="who">${esc(d.title || 'Партия')}</span><span class="cap-note">Итоговая позиция</span>`;
      this.renderAnalysis();
    },
    renderAnalysis() {
      const d = this.data, i = this.idx, n = d.moves.length;
      renderMoveList($('rv-moves'), d.sans, this.startTurn, {
        current: i < n ? i : n - 1,
        cls: (j) => (this.results[j] ? 'c-' + CLS[classify(this.results[j])].kind : 'pending'),
        badge: (j) => { const r = this.results[j]; const c = r && CLS[classify(r)]; return c && c.mark ? `<span class="badge">${c.mark}</span>` : ''; },
      });
      // Комментарий к выбранному ходу
      const r = this.results[i];
      const com = $('rv-comment');
      if (i >= n) {
        com.innerHTML = '<p class="com-head">Конец партии</p><p>Пройдите по ходам стрелками или нажмите на ход в списке.</p>';
      } else if (!r) {
        com.innerHTML = `<p class="com-head">${fig(d.sans[i])}</p><p class="muted">Ход ещё не разобран…</p>`;
      } else {
        const before = Chess.fromMoves(d.fen, d.moves.slice(0, i));
        const c = classify(r), info = CLS[c];
        const sign = this.moverAt(i) === 'w' ? 1 : -1;
        com.innerHTML = `<p class="com-head"><span class="pill p-${info.kind}">${info.label}</span> ${fig(d.sans[i])}${info.mark}</p>
          <p>${explain(r, before)}</p>
          <p class="evals"><span>Оценка до хода: <b>${fmtScore(sign * r.bestScore)}</b></span><span>после: <b>${fmtScore(sign * r.played)}</b></span></p>`;
      }
      // Итоги по сторонам
      const done = this.results.filter(Boolean).length;
      if (done) {
        const side = (c) => {
          let acc = 0, k = 0;
          const cnt = { inaccuracy: 0, mistake: 0, blunder: 0 };
          this.results.forEach((x, j) => {
            if (!x || this.moverAt(j) !== c) return;
            const cl = classify(x);
            if (cnt[cl] !== undefined) cnt[cl]++;
            const drop = Math.max(0, winPct(clampCp(x.bestScore)) - winPct(clampCp(x.played)));
            acc += Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
            k++;
          });
          const mine = d.mine === c ? ' <span class="you">вы</span>' : '';
          return `<div class="side"><p class="side-name"><span class="dot ${c}"></span>${c === 'w' ? 'Белые' : 'Чёрные'}${mine}</p>
            <p class="acc">${k ? Math.round(acc / k) : '—'}<small>% точность</small></p>
            <ul class="tally"><li><span class="pill p-inacc">?!</span>${cnt.inaccuracy}</li><li><span class="pill p-mistake">?</span>${cnt.mistake}</li><li><span class="pill p-blunder">??</span>${cnt.blunder}</li></ul></div>`;
        };
        $('rv-summary').innerHTML = side('w') + side('b');
      } else $('rv-summary').innerHTML = '';
      this.renderGraph();
      const mineErr = done === n ? this.errorPlies(true).filter((j) => classify(this.results[j]) !== 'inaccuracy') : [];
      const btn = $('rv-train');
      btn.hidden = !mineErr.length;
      btn.textContent = `Тренировать мои ошибки (${mineErr.length})`;
      $('rv-prev').disabled = $('rv-first').disabled = i === 0;
      $('rv-next').disabled = $('rv-last').disabled = i >= n;
    },
    renderGraph() {
      const d = this.data, n = d.moves.length, box = $('review-graph');
      if (!this.results.length) { box.innerHTML = ''; return; }
      const W = 600, H = 96, step = W / Math.max(1, n);
      const y = (cp) => H / 2 - (H / 2 - 4) * (2 / (1 + Math.exp(-0.004 * clampCp(cp))) - 1);
      const first = this.results[0] ? (this.startTurn === 'w' ? this.results[0].bestScore : -this.results[0].bestScore) : 0;
      const pts = [[0, y(first)]];
      for (let j = 0; j < n; j++) { const e = this.whiteEvalAfter(j); if (e === null) break; pts.push([(j + 1) * step, y(e)]); }
      const line = pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
      const area = `0,${H} ${line} ${pts[pts.length - 1][0].toFixed(1)},${H}`;
      const dots = this.results.map((r, j) => {
        if (!r) return '';
        const c = classify(r);
        if (!['mistake', 'blunder'].includes(c)) return '';
        return `<circle cx="${((j + 1) * step).toFixed(1)}" cy="${y(this.whiteEvalAfter(j)).toFixed(1)}" r="4" class="g-${CLS[c].kind}"/>`;
      }).join('');
      const cx = (Math.min(this.idx, n) * step).toFixed(1);
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Оценка позиции по ходу партии: выше середины — перевес белых">
        <rect x="0" y="0" width="${W}" height="${H}" class="g-bg"/>
        <polygon points="${area}" class="g-area"/>
        <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="g-mid"/>
        <polyline points="${line}" class="g-line"/>
        <line x1="${cx}" x2="${cx}" y1="0" y2="${H}" class="g-cur"/>
        ${dots}</svg>`;
      box.onclick = (e) => {
        const rect = box.getBoundingClientRect();
        const ply = Math.round(((e.clientX - rect.left) / rect.width) * n);
        this.go(Math.max(0, ply - 1));
      };
    },
    addToTraining() {
      const d = this.data;
      const list = Store.get('mistakes', []);
      const have = new Set(list.map((x) => x.fen));
      let added = 0;
      for (const j of this.errorPlies(true)) {
        const r = this.results[j];
        if (classify(r) === 'inaccuracy') continue;
        const g = Chess.fromMoves(d.fen, d.moves.slice(0, j));
        const fen = g.fen();
        if (have.has(fen)) continue;
        have.add(fen);
        list.push({ id: 'my-' + Date.now().toString(36) + j, fen, best: r.best, bestSan: g.san(g.moveFromUci(r.best)), bestScore: r.bestScore,
          played: d.sans[j], cls: classify(r), from: d.title || 'Партия' });
        added++;
      }
      Store.set('mistakes', list.slice(-60));
      location.hash = 'puzzles';
      Puzzles.openMistakes(added);
    },
  };

  function parsePgn(text) {
    let fen = Chess.START_FEN;
    const fm = text.match(/\[FEN\s+"([^"]+)"\]/i);
    if (fm) fen = fm[1];
    let body = text.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    let prev;
    do { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } while (prev !== body);
    body = body.replace(/\$\d+/g, ' ').replace(/\d+\s*\.(\s*\.\.)?/g, ' ').replace(/…/g, ' ');
    const tokens = body.split(/\s+/).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(t));
    const g = new Chess(fen), moves = [], sans = [];
    tokens.forEach((t, k) => {
      const m = g.moveFromSan(t);
      if (!m) throw new Error(`Не удалось прочитать ход «${t}» (полуход ${k + 1}). Проверьте запись: например, Nf3, exd5, O-O, e8=Q.`);
      sans.push(g.san(m));
      moves.push(Chess.uci(m));
      g.make(m);
    });
    return { fen, moves, sans };
  }

  /* ---------------------------------------------------------------- Обучение */
  const Learn = {
    engine: new Engine(),
    init() {
      this.board = new Board($('learn-board'), {
        targets: (sq) => this.targets(sq),
        onMove: (f, t, pr) => this.userMove(f, t, pr),
        onSquare: (sq) => this.squareClick(sq),
      });
      this.done = new Set(Store.get('lessonsDone', []));
      const pos = Store.get('lessonPos', { l: 0, s: 0 });
      this.li = Math.min(pos.l, LESSONS.length - 1);
      this.si = Math.min(pos.s, LESSONS[this.li].steps.length - 1);
      $('learn-prev').addEventListener('click', () => this.stepBy(-1));
      $('learn-next').addEventListener('click', () => this.stepBy(1));
      $('learn-reset').addEventListener('click', () => this.load());
      $('learn-toc').addEventListener('click', (e) => { const b = e.target.closest('[data-lesson]'); if (b) { this.li = +b.dataset.lesson; this.si = 0; this.load(); } });
      this.load();
    },
    get lesson() { return LESSONS[this.li]; },
    get step() { return this.lesson.steps[this.si]; },
    stepBy(d) {
      let s = this.si + d;
      if (s >= this.lesson.steps.length) {
        this.markDone();
        if (this.li < LESSONS.length - 1) { this.li++; s = 0; } else s = this.lesson.steps.length - 1;
      } else if (s < 0) {
        if (this.li > 0) { this.li--; s = this.lesson.steps.length - 1; } else s = 0;
      }
      this.si = s;
      this.load();
    },
    markDone() { this.done.add(this.lesson.id); Store.set('lessonsDone', [...this.done]); },
    load() {
      this.engine.cancel();
      this.token = (this.token || 0) + 1;
      Store.set('lessonPos', { l: this.li, s: this.si });
      const st = this.step, task = st.task;
      this.g = st.moves ? Chess.fromMoves(Chess.START_FEN, st.moves) : new Chess(st.fen === 'start' ? Chess.START_FEN : st.fen);
      this.solved = !task;
      this.side = task && task.pre ? (this.g.turn === 'w' ? 'b' : 'w') : this.g.turn;
      this.busy = false;
      this.pos = 0;
      this.sqIdx = 0;
      this.feedback('');
      const marks = {};
      (st.marks || []).forEach((s) => { marks[Chess.sqIndex(s)] = 'focus'; });
      if (st.showMoves) {
        const from = Chess.sqIndex(st.showMoves);
        const saveTurn = this.g.turn;
        this.g.turn = Chess.colorOf(this.g.board[from]);
        this.g.moves({ square: from }).forEach((m) => { marks[m.to] = 'reach'; });
        this.g.turn = saveTurn;
      }
      this.board.setFlipped(false);
      this.board.set(stateOf(this.g, st.moves ? undefined : null));
      this.board.setMarks(marks);
      this.board.setArrows((st.arrows || []).map(([f, t]) => ({ from: f, to: t, kind: 'info' })));
      $('learn-group').textContent = this.lesson.group;
      $('learn-title').textContent = this.lesson.title;
      $('learn-text').innerHTML = `<p>${st.text}</p>`;
      $('learn-steps').innerHTML = this.lesson.steps.map((_, k) => `<span class="step${k === this.si ? ' on' : k < this.si ? ' past' : ''}"></span>`).join('') +
        `<span class="step-count">Шаг ${this.si + 1} из ${this.lesson.steps.length}</span>`;
      $('learn-caption').innerHTML = `<span class="who">${esc(this.lesson.title)}</span><span class="cap-note">${task ? this.taskCaption() : 'Изучите позицию'}</span>`;
      $('learn-prev').disabled = this.li === 0 && this.si === 0;
      const last = this.li === LESSONS.length - 1 && this.si === this.lesson.steps.length - 1;
      $('learn-next').textContent = this.si === this.lesson.steps.length - 1 ? (last ? 'Завершить' : 'Следующий урок') : 'Далее';
      $('learn-reset').hidden = !task;
      this.renderToc();
      if (task && task.type === 'squares') this.promptSquare();
      if (task && task.pre) this.playPre(task.pre);
    },
    taskCaption() {
      const t = this.step.task;
      return { squares: 'Найдите клетку', collect: 'Соберите все пешки', move: 'Сделайте ход', mate: 'Поставьте мат', play: 'Играйте до мата' }[t.type];
    },
    renderToc() {
      let html = '', group = '';
      LESSONS.forEach((l, k) => {
        if (l.group !== group) { if (group) html += '</div>'; group = l.group; html += `<p class="toc-group">${esc(group)}</p><div class="toc-items">`; }
        html += `<button type="button" class="toc-item${k === this.li ? ' current' : ''}${this.done.has(l.id) ? ' done' : ''}" data-lesson="${k}">${esc(l.title)}</button>`;
      });
      $('learn-toc').innerHTML = html + '</div>';
    },
    feedback(html, kind) {
      const f = $('learn-feedback');
      f.className = 'feedback' + (kind ? ' ' + kind : '');
      f.innerHTML = html;
    },
    promptSquare() {
      const t = this.step.task;
      if (this.sqIdx >= t.targets.length) { this.success('Отлично! Вы знаете названия клеток.'); return; }
      this.feedback(`Нажмите на клетку <b class="sq-name">${t.targets[this.sqIdx]}</b>`, 'ask');
    },
    squareClick(sq) {
      const t = this.step.task;
      if (!t || t.type !== 'squares' || this.solved) return false;
      const want = Chess.sqIndex(t.targets[this.sqIdx]);
      if (sq === want) {
        this.board.setMarks({ [sq]: 'good' });
        this.sqIdx++;
        this.promptSquare();
      } else {
        this.board.setMarks({ [sq]: 'bad' });
        this.feedback(`Это <b>${Chess.sqName(sq)}</b>. Найдите <b class="sq-name">${t.targets[this.sqIdx]}</b>`, 'bad');
      }
      return true;
    },
    targets(sq) {
      const t = this.step.task;
      if (!t || this.solved || this.busy || t.type === 'squares') return [];
      const p = this.g.board[sq];
      if (p === '.' || Chess.colorOf(p) !== this.g.turn) return [];
      if (t.type !== 'collect' && Chess.colorOf(p) !== this.side) return [];
      return targetsOf(this.g, sq);
    },
    async playPre(list) {
      this.busy = true;
      await sleep(600);
      for (const u of list) {
        const m = this.g.moveFromUci(u);
        this.g.make(m);
        this.board.set({ ...stateOf(this.g), animate: true });
        await sleep(400);
      }
      this.busy = false;
    },
    userMove(from, to, promo) {
      const t = this.step.task;
      const m = findMove(this.g, from, to, promo);
      if (!m || !t) return;
      const uci = Chess.uci(m);
      if (t.type === 'collect') {
        this.g.make(m);
        this.g.turn = 'w';
        this.g.ep = -1;
        this.board.set({ ...stateOf(this.g, m), animate: true });
        this.board.setMarks({});
        const left = this.g.board.filter((p) => p !== '.' && p >= 'a').length;
        if (!left) this.success('Все пешки собраны!');
        else this.feedback(`Осталось пешек: <b>${left}</b>`, 'ask');
        return;
      }
      if (t.type === 'play') { this.playMove(m); return; }
      let ok = false;
      if (t.type === 'mate') { this.g.make(m); ok = this.g.status().reason === 'checkmate'; this.g.undo(); }
      else if (t.accept === 'king') ok = m.piece.toLowerCase() === 'k';
      else if (t.accept === 'block') ok = m.piece.toLowerCase() !== 'k' && m.captured === '.';
      else ok = t.solution[this.pos] === uci;
      this.g.make(m);
      this.board.set({ ...stateOf(this.g, m), animate: true });
      this.board.setMarks({});
      if (!ok) {
        this.busy = true;
        const msg = t.type === 'mate' ? 'Это не мат: у соперника остаётся защита. Попробуйте ещё раз.' : 'Не тот ход. Попробуйте ещё раз.';
        this.feedback(msg, 'bad');
        setTimeout(() => { this.g.undo(); this.board.set(stateOf(this.g)); this.busy = false; }, 900);
        return;
      }
      this.pos++;
      if (t.solution && this.pos < t.solution.length) {
        this.busy = true;
        this.feedback('Верно! Смотрим ответ соперника…', 'good');
        setTimeout(() => {
          const r = this.g.moveFromUci(t.solution[this.pos]);
          this.g.make(r);
          this.pos++;
          this.board.set({ ...stateOf(this.g, r), animate: true });
          this.busy = false;
          if (this.pos >= t.solution.length) this.success('Задание выполнено!');
          else this.feedback('Продолжайте: какой ход теперь?', 'ask');
        }, 600);
        return;
      }
      this.success(t.type === 'mate' ? 'Мат! Отлично.' : 'Верно!');
    },
    async playMove(m) {
      this.g.make(m);
      this.board.set({ ...stateOf(this.g, m), animate: true });
      let st = this.g.status();
      if (st.over) return this.playOver(st);
      this.busy = true;
      this.feedback('Бот думает…', 'ask');
      const token = this.token;
      const fen = this.step.fen;
      const moves = this.g.stack.map((u) => Chess.uci(u.m));
      const r = await this.engine.run('best', { fen, moves, depth: 3 });
      if (token !== this.token) return;
      await sleep(250);
      const bm = this.g.moveFromUci(r.uci);
      this.g.make(bm);
      this.board.set({ ...stateOf(this.g, bm), animate: true });
      this.busy = false;
      st = this.g.status();
      if (st.over) return this.playOver(st);
      this.feedback(`Сделано ходов: <b>${Math.ceil(this.g.stack.length / 2)}</b>. Продолжайте прижимать короля к краю.`, 'ask');
    },
    playOver(st) {
      if (st.reason === 'checkmate') this.success(`Мат за ${Math.ceil(this.g.stack.length / 2)} ходов!`);
      else { this.solved = true; this.feedback(`Ничья (${REASONS[st.reason]}). Нажмите «Заново» и попробуйте ещё раз.`, 'bad'); }
    },
    success(text) {
      this.solved = true;
      this.feedback(text, 'good');
      if (this.si === this.lesson.steps.length - 1) { this.markDone(); this.renderToc(); }
    },
  };

  /* ---------------------------------------------------------------- Задачи */
  const Puzzles = {
    engine: new Engine(),
    init() {
      this.board = new Board($('pz-board'), {
        targets: (sq) => (this.canMove() ? targetsOf(this.g, sq) : []),
        onMove: (f, t, pr) => { const m = findMove(this.g, f, t, pr); if (m) this.userMove(m); },
      });
      this.solvedSet = new Set(Store.get('solved', []));
      $('pz-hint').addEventListener('click', () => this.hint());
      $('pz-solution').addEventListener('click', () => this.showSolution());
      $('pz-retry').addEventListener('click', () => this.open(this.cur.id));
      $('pz-next').addEventListener('click', () => this.next());
      $('pz-toc').addEventListener('click', (e) => {
        const b = e.target.closest('[data-pz]');
        if (b) this.open(b.dataset.pz);
        if (e.target.closest('#pz-clear')) { Store.set('mistakes', Store.get('mistakes', []).filter((x) => !this.solvedSet.has(x.id))); this.renderToc(); }
      });
      const last = Store.get('puzzle', PUZZLES[0].id);
      this.open(this.all().some((p) => p.id === last) ? last : PUZZLES[0].id);
    },
    mine() {
      return Store.get('mistakes', []).map((x) => ({
        id: x.id, cat: 'Мои ошибки', title: `${x.from}: вместо ${x.played}`, fen: x.fen, solution: [x.best], bestScore: x.bestScore, mineItem: true,
        hint: 'В партии здесь был сыгран слабый ход. Найдите ход сильнее.',
      }));
    },
    all() { return this.mine().concat(PUZZLES); },
    openMistakes(added) {
      const mine = this.mine();
      if (mine.length) this.open(mine[mine.length - Math.max(1, added || 1)].id);
      this.feedback(added ? `Добавлено позиций: <b>${added}</b>. Найдите в каждой ход сильнее, чем в партии.` : 'Эти позиции уже есть в тренировке.', 'ask');
    },
    canMove() { return this.g && !this.solved && !this.busy && this.g.turn === this.color; },
    open(id) {
      this.engine.cancel();
      this.token = (this.token || 0) + 1;
      const p = this.all().find((x) => x.id === id) || PUZZLES[0];
      Store.set('puzzle', p.id);
      this.cur = p;
      this.g = new Chess(p.fen);
      this.color = this.g.turn;
      this.pos = 0;
      this.solved = false;
      this.busy = false;
      this.free = false;
      this.failed = false;
      this.board.setFlipped(this.color === 'b');
      this.board.set(stateOf(this.g, null));
      this.board.setMarks({});
      this.board.setArrows([]);
      const side = this.color === 'w' ? 'белых' : 'чёрных';
      $('pz-cat').textContent = p.cat;
      $('pz-title').textContent = p.title;
      $('pz-task').innerHTML = p.mate ? `Ход ${side}. Поставьте мат в ${p.mate} ${p.mate === 1 ? 'ход' : 'хода'}.` : p.mineItem ? `Ход ${side}. Найдите лучший ход.` : `Ход ${side}. Найдите выигрыш.`;
      $('pz-caption').innerHTML = `<span class="who"><span class="dot ${this.color}"></span>Ход ${side}</span><span class="cap-note">${esc(p.cat)}</span>`;
      this.feedback('');
      this.renderToc();
    },
    renderToc() {
      const groups = {};
      for (const p of this.all()) (groups[p.cat] = groups[p.cat] || []).push(p);
      let html = '';
      for (const [cat, list] of Object.entries(groups)) {
        html += `<p class="toc-group">${esc(cat)}</p><div class="toc-items grid">`;
        list.forEach((p, k) => {
          html += `<button type="button" class="toc-item num${p.id === this.cur.id ? ' current' : ''}${this.solvedSet.has(p.id) ? ' done' : ''}" data-pz="${p.id}" title="${esc(p.title)}">${k + 1}</button>`;
        });
        html += '</div>';
        if (cat === 'Мои ошибки' && list.some((p) => this.solvedSet.has(p.id))) html += '<button type="button" class="btn ghost small" id="pz-clear">Убрать решённые</button>';
      }
      $('pz-toc').innerHTML = html;
      const all = this.all();
      $('pz-count').textContent = `${all.filter((p) => this.solvedSet.has(p.id)).length} / ${all.length}`;
    },
    feedback(html, kind) { const f = $('pz-feedback'); f.className = 'feedback' + (kind ? ' ' + kind : ''); f.innerHTML = html; },
    async userMove(m) {
      const p = this.cur, uci = Chess.uci(m);
      const expected = p.solution[this.pos];
      this.board.setMarks({});
      this.g.make(m);
      this.board.set({ ...stateOf(this.g, m), animate: true });
      const userMovesDone = Math.ceil((this.pos + 1) / 2);
      if (this.g.status().reason === 'checkmate') return this.win('Мат! Задача решена.');
      let ok = !this.free && uci === expected, reply = null;
      if (!ok && (p.mate || p.mineItem)) {
        this.busy = true;
        this.feedback('Проверяю ход…', 'ask');
        const token = this.token;
        const left = p.mate ? p.mate - userMovesDone : 0;
        const moves = this.g.stack.map((u) => Chess.uci(u.m));
        const r = await this.engine.run('best', { fen: p.fen, moves, depth: p.mate ? Math.max(2, left * 2 + 1) : 3 });
        if (token !== this.token) return;
        this.busy = false;
        if (p.mate && r && left > 0 && r.score <= -MATE + 2 * left + 1) { ok = true; this.free = true; reply = r.uci; }
        if (p.mineItem && r && p.bestScore - (-r.score) <= 40) return this.win('Тоже сильный ход! Позиция решена.');
      }
      if (!ok) {
        this.failed = true;
        this.busy = true;
        this.feedback('Не лучший ход. Попробуйте ещё раз.', 'bad');
        setTimeout(() => { this.g.undo(); this.board.set(stateOf(this.g)); this.busy = false; }, 900);
        return;
      }
      this.pos++;
      if (!this.free && this.pos >= p.solution.length) return this.win(p.mineItem ? 'Верно! Это лучший ход.' : 'Верно! Задача решена.');
      if (!reply) reply = p.solution[this.pos];
      this.busy = true;
      this.feedback('Верно! Ответ соперника…', 'good');
      await sleep(550);
      const rm = this.g.moveFromUci(reply);
      if (!rm) { this.busy = false; return this.win('Задача решена.'); }
      this.g.make(rm);
      this.pos++;
      this.board.set({ ...stateOf(this.g, rm), animate: true });
      this.busy = false;
      if (!this.free && this.pos >= p.solution.length) return this.win('Задача решена.');
      this.feedback('Продолжайте.', 'ask');
    },
    win(text) {
      this.solved = true;
      if (!this.failed && !this.shown) { this.solvedSet.add(this.cur.id); Store.set('solved', [...this.solvedSet]); }
      this.feedback(this.failed ? text + ' (с ошибкой — попробуйте потом ещё раз)' : text, 'good');
      this.renderToc();
    },
    hint() {
      const m = this.g.moveFromUci(this.cur.solution[this.pos]);
      const parts = [];
      if (this.cur.hint) parts.push(esc(this.cur.hint));
      if (m && !this.free) {
        this.board.setMarks({ [m.from]: 'focus' });
        parts.push(`Ходит ${NOM[m.piece.toLowerCase()]} с поля ${Chess.sqName(m.from)}.`);
      }
      this.failed = true;
      this.feedback(parts.join(' '), 'ask');
    },
    async showSolution() {
      this.open(this.cur.id);
      this.failed = true;
      this.busy = true;
      const token = this.token;
      const p = this.cur;
      const sans = [];
      for (const u of p.solution) {
        await sleep(600);
        if (token !== this.token) return;
        const m = this.g.moveFromUci(u);
        sans.push(this.g.san(m));
        this.g.make(m);
        this.board.set({ ...stateOf(this.g, m), animate: true });
      }
      this.solved = true;
      this.busy = false;
      this.feedback(`Решение: <b>${sans.map(fig).join(' ')}</b>`, 'ask');
    },
    next() {
      const all = this.all();
      const k = all.findIndex((x) => x.id === this.cur.id);
      const after = all.slice(k + 1).concat(all.slice(0, k + 1));
      const nxt = after.find((x) => !this.solvedSet.has(x.id)) || after[0];
      this.open(nxt.id);
    },
  };

  /* ---------------------------------------------------------------- Навигация */
  const VIEWS = ['play', 'review', 'learn', 'puzzles'];
  function route() {
    const h = location.hash.replace('#', '');
    const v = VIEWS.includes(h) ? h : 'play';
    VIEWS.forEach((name) => { $('view-' + name).hidden = name !== v; });
    if (v === 'review' && Review.board) Review.ensure();
    document.querySelectorAll('.tabs a').forEach((a) => {
      if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', route);

  Play.init();
  Review.init();
  Learn.init();
  Puzzles.init();
  route();
})();
