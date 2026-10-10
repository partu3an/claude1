/* Интерактивная доска: клик и перетаскивание, подсветка, стрелки, выбор фигуры при превращении.
 * Доска ничего не знает о правилах — допустимые ходы ей сообщают через колбэки. */
(function (root) {
  'use strict';
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const FILES = 'abcdefgh';
  const glyph = (p) => GLYPH[p.toLowerCase()] + '︎';
  const reduceMotion = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class Board {
    /**
     * opts.targets(sq) -> массив клеток, куда может пойти фигура с sq (пустой — фигуру трогать нельзя)
     * opts.onMove(from, to, promo) — ученик сделал ход
     * opts.onSquare(sq) -> true, если клик обработан (для заданий «найди клетку»)
     */
    constructor(container, opts) {
      this.opts = opts || {};
      this.flipped = false;
      this.position = new Array(64).fill('.');
      this.selected = -1;
      this.marks = {};
      this.arrows = [];
      this.last = null;
      this.check = -1;

      this.el = document.createElement('div');
      this.el.className = 'board';
      this.grid = document.createElement('div');
      this.grid.className = 'board-grid';
      this.cells = [];
      for (let i = 0; i < 64; i++) {
        const c = document.createElement('div');
        this.grid.appendChild(c);
        this.cells.push(c);
      }
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('viewBox', '0 0 8 8');
      this.svg.setAttribute('class', 'board-arrows');
      this.svg.setAttribute('aria-hidden', 'true');
      this.el.append(this.grid, this.svg);
      container.appendChild(this.el);

      this.el.addEventListener('pointerdown', (e) => this._down(e));
      this.el.addEventListener('contextmenu', (e) => e.preventDefault());
      this._move = (e) => this._drag(e);
      this._up = (e) => this._release(e);
      this.render();
    }

    sqAt(i) { return this.flipped ? 63 - i : i; }
    cellOf(sq) { return this.cells[this.flipped ? 63 - sq : sq]; }

    setFlipped(f) { this.flipped = !!f; this.render(); }

    /** state: {board, last:{from,to}, check, animate} */
    set(state) {
      const prev = this.position;
      this.position = state.board.slice();
      this.last = state.last || null;
      this.check = state.check === undefined ? -1 : state.check;
      this.selected = -1;
      this.render();
      if (state.animate && this.last && !reduceMotion()) this._animate(this.last.from, this.last.to, prev);
    }

    setMarks(marks) { this.marks = marks || {}; this.render(); }
    setArrows(arrows) { this.arrows = arrows || []; this._drawArrows(); }

    render() {
      const targets = this.selected >= 0 ? this._targets(this.selected) : [];
      for (let i = 0; i < 64; i++) {
        const sq = this.sqAt(i), cell = this.cells[i], r = sq >> 3, f = sq & 7;
        const cls = ['sq', (r + f) % 2 ? 'dark' : 'light'];
        if (this.last && (this.last.from === sq || this.last.to === sq)) cls.push('last');
        if (sq === this.selected) cls.push('sel');
        if (sq === this.check) cls.push('check');
        if (this.marks[sq]) cls.push('mark-' + this.marks[sq]);
        const p = this.position[sq];
        if (targets.includes(sq)) cls.push(p === '.' ? 'dot' : 'ring');
        cell.className = cls.join(' ');
        cell.dataset.sq = sq;
        let html = '';
        if (p !== '.') html += `<span class="piece ${p < 'a' ? 'w' : 'b'}">${glyph(p)}</span>`;
        const row = i >> 3, col = i & 7;
        if (col === 0) html += `<span class="coord rank">${8 - r}</span>`;
        if (row === 7) html += `<span class="coord file">${FILES[f]}</span>`;
        cell.innerHTML = html;
      }
      this._drawArrows();
    }

    _targets(sq) { return (this.opts.targets && this.opts.targets(sq)) || []; }

    _squareFromPoint(x, y) {
      const rect = this.grid.getBoundingClientRect();
      const col = Math.floor(((x - rect.left) / rect.width) * 8), row = Math.floor(((y - rect.top) / rect.height) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
      return this.sqAt(row * 8 + col);
    }

    _down(e) {
      if (e.button !== undefined && e.button !== 0) return;
      const sq = this._squareFromPoint(e.clientX, e.clientY);
      if (sq < 0) return;
      if (this.opts.onSquare && this.opts.onSquare(sq)) return;
      if (this.selected >= 0 && this.selected !== sq && this._targets(this.selected).includes(sq)) {
        this._try(this.selected, sq);
        return;
      }
      if (this._targets(sq).length) {
        e.preventDefault();
        const wasSelected = this.selected === sq;
        this.selected = sq;
        this.render();
        const piece = this.cellOf(sq).querySelector('.piece');
        this.drag = { from: sq, x: e.clientX, y: e.clientY, piece, moved: false, wasSelected };
        root.addEventListener('pointermove', this._move);
        root.addEventListener('pointerup', this._up);
        root.addEventListener('pointercancel', this._up);
      } else if (this.selected >= 0) {
        this.selected = -1;
        this.render();
      }
    }

    _drag(e) {
      const d = this.drag;
      if (!d || !d.piece) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true;
      d.piece.classList.add('dragging');
      d.piece.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
    }

    _release(e) {
      root.removeEventListener('pointermove', this._move);
      root.removeEventListener('pointerup', this._up);
      root.removeEventListener('pointercancel', this._up);
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.moved) {
        const to = this._squareFromPoint(e.clientX, e.clientY);
        if (to >= 0 && to !== d.from && this._targets(d.from).includes(to)) { this._try(d.from, to, true); return; }
        if (d.piece) { d.piece.classList.remove('dragging'); d.piece.style.transform = ''; }
      } else if (d.wasSelected) {
        this.selected = -1;
        this.render();
      }
    }

    _try(from, to, dropped) {
      const p = this.position[from];
      const promoRank = p === 'P' ? 0 : p === 'p' ? 7 : -1;
      this.selected = -1;
      if (promoRank >= 0 && (to >> 3) === promoRank) {
        this.render();
        this._askPromotion(to, p < 'a', (pr) => { if (pr) this.opts.onMove(from, to, pr); });
        return;
      }
      this._dropped = !!dropped;
      this.opts.onMove(from, to, '');
      this._dropped = false;
    }

    _askPromotion(to, white, done) {
      const box = document.createElement('div');
      box.className = 'promo';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', 'Выберите фигуру');
      for (const pr of ['q', 'r', 'b', 'n']) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'promo-btn';
        b.innerHTML = `<span class="piece ${white ? 'w' : 'b'}">${glyph(pr)}</span>`;
        b.setAttribute('aria-label', { q: 'Ферзь', r: 'Ладья', b: 'Слон', n: 'Конь' }[pr]);
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', (e) => { e.stopPropagation(); box.remove(); done(pr); });
        box.appendChild(b);
      }
      const cancel = (e) => { if (!box.contains(e.target)) { box.remove(); done(null); this.el.removeEventListener('pointerdown', cancel, true); } };
      this.el.addEventListener('pointerdown', cancel, true);
      const i = this.flipped ? 63 - to : to;
      box.style.left = ((i & 7) * 12.5) + '%';
      box.style[(i >> 3) === 0 ? 'top' : 'bottom'] = '0';
      this.el.appendChild(box);
      box.querySelector('button').focus();
    }

    _animate(from, to, prev) {
      if (this._dropped || prev[from] === '.') return;
      const piece = this.cellOf(to).querySelector('.piece');
      if (!piece) return;
      const a = this.cellOf(from).getBoundingClientRect(), b = this.cellOf(to).getBoundingClientRect();
      piece.style.transition = 'none';
      piece.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
      piece.getBoundingClientRect();
      piece.style.transition = 'transform 180ms ease-out';
      piece.style.transform = '';
      piece.addEventListener('transitionend', () => { piece.style.transition = ''; }, { once: true });
    }

    _drawArrows() {
      const ns = 'http://www.w3.org/2000/svg';
      this.svg.innerHTML = '';
      for (const a of this.arrows) {
        const from = typeof a.from === 'string' ? Chess.sqIndex(a.from) : a.from;
        const to = typeof a.to === 'string' ? Chess.sqIndex(a.to) : a.to;
        const fi = this.flipped ? 63 - from : from, ti = this.flipped ? 63 - to : to;
        const x1 = (fi & 7) + 0.5, y1 = (fi >> 3) + 0.5, x2 = (ti & 7) + 0.5, y2 = (ti >> 3) + 0.5;
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (!len) continue;
        const ux = (x2 - x1) / len, uy = (y2 - y1) / len, px = -uy, py = ux;
        const sx = x1 + ux * 0.2, sy = y1 + uy * 0.2, ex = x2 - ux * 0.12, ey = y2 - uy * 0.12;
        const hx = ex - ux * 0.42, hy = ey - uy * 0.42, w = 0.08, hw = 0.24;
        const pts = [[sx + px * w, sy + py * w], [hx + px * w, hy + py * w], [hx + px * hw, hy + py * hw], [ex, ey],
          [hx - px * hw, hy - py * hw], [hx - px * w, hy - py * w], [sx - px * w, sy - py * w]];
        const poly = document.createElementNS(ns, 'polygon');
        poly.setAttribute('points', pts.map((p) => p.map((v) => v.toFixed(3)).join(',')).join(' '));
        poly.setAttribute('class', 'arrow arrow-' + (a.kind || 'info'));
        this.svg.appendChild(poly);
      }
    }
  }

  Board.glyph = glyph;
  root.Board = Board;
})(typeof self !== 'undefined' ? self : globalThis);
