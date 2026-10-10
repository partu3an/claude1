/* Правила шахмат: генерация ходов, шах/мат/пат, нотация SAN, FEN.
 * Доска — массив из 64 клеток, индекс = ряд * 8 + вертикаль, ряд 0 — восьмая горизонталь.
 * Фигуры — буквы FEN: заглавные белые, строчные чёрные, '.' — пустая клетка. */
(function (root) {
  'use strict';

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FILES = 'abcdefgh';
  const sqName = (s) => FILES[s & 7] + (8 - (s >> 3));
  const sqIndex = (n) => (8 - parseInt(n[1], 10)) * 8 + FILES.indexOf(n[0]);
  const colorOf = (p) => (p === '.' ? null : p < 'a' ? 'w' : 'b');

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  const KN_OFF = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const RAYS = [], KNIGHT = [], KING = [];
  for (let s = 0; s < 64; s++) {
    const r = s >> 3, f = s & 7;
    RAYS[s] = DIRS.map(([dr, df]) => {
      const a = [];
      for (let rr = r + dr, ff = f + df; rr >= 0 && rr < 8 && ff >= 0 && ff < 8; rr += dr, ff += df) a.push(rr * 8 + ff);
      return a;
    });
    const step = (offs) => offs.map(([dr, df]) => [r + dr, f + df])
      .filter(([rr, ff]) => rr >= 0 && rr < 8 && ff >= 0 && ff < 8).map(([rr, ff]) => rr * 8 + ff);
    KNIGHT[s] = step(KN_OFF);
    KING[s] = step(DIRS);
  }

  // Права на рокировку: 1 = K, 2 = Q, 4 = k, 8 = q
  const CR_MASK = new Array(64).fill(15);
  CR_MASK[60] = 12; CR_MASK[63] = 14; CR_MASK[56] = 13;
  CR_MASK[4] = 3; CR_MASK[7] = 11; CR_MASK[0] = 7;
  const CASTLE_ROOK = { 62: [63, 61], 58: [56, 59], 6: [7, 5], 2: [0, 3] };

  // Хеширование Зобриста (32 бита) для повторений и таблицы транспозиций
  const PIDX = { P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5, p: 6, n: 7, b: 8, r: 9, q: 10, k: 11 };
  let seed = 0x2545f491;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const ZP = new Int32Array(12 * 64).map(rnd);
  const ZC = new Int32Array(16).map(rnd);
  const ZEP = new Int32Array(8).map(rnd);
  const ZSIDE = rnd();
  const Z = (p, s) => ZP[PIDX[p] * 64 + s];

  class Chess {
    constructor(fen) { this.load(fen || START_FEN); }

    load(fen) {
      const parts = String(fen).trim().split(/\s+/);
      const rows = parts[0].split('/');
      if (rows.length !== 8) throw new Error('Неверный FEN: нужно 8 горизонталей');
      const board = new Array(64).fill('.');
      const kings = { w: -1, b: -1 };
      for (let r = 0; r < 8; r++) {
        let f = 0;
        for (const ch of rows[r]) {
          if (/[1-8]/.test(ch)) { f += +ch; continue; }
          if (!/[pnbrqkPNBRQK]/.test(ch) || f > 7) throw new Error('Неверный FEN: ' + rows[r]);
          board[r * 8 + f] = ch;
          if (ch === 'K') kings.w = r * 8 + f;
          if (ch === 'k') kings.b = r * 8 + f;
          f++;
        }
        if (f !== 8) throw new Error('Неверный FEN: ' + rows[r]);
      }
      this.board = board;
      this.kings = kings;
      this.turn = parts[1] === 'b' ? 'b' : 'w';
      const cs = parts[2] || '-';
      let cr = 0;
      if (cs.includes('K') && board[60] === 'K' && board[63] === 'R') cr |= 1;
      if (cs.includes('Q') && board[60] === 'K' && board[56] === 'R') cr |= 2;
      if (cs.includes('k') && board[4] === 'k' && board[7] === 'r') cr |= 4;
      if (cs.includes('q') && board[4] === 'k' && board[0] === 'r') cr |= 8;
      this.castling = cr;
      this.ep = parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1;
      this.half = parseInt(parts[4], 10) || 0;
      this.full = parseInt(parts[5], 10) || 1;
      this.stack = [];
      this.hash = this.computeHash();
      this.hashes = [this.hash];
      return this;
    }

    computeHash() {
      let h = 0;
      for (let s = 0; s < 64; s++) if (this.board[s] !== '.') h ^= Z(this.board[s], s);
      h ^= ZC[this.castling];
      if (this.ep >= 0) h ^= ZEP[this.ep & 7];
      if (this.turn === 'b') h ^= ZSIDE;
      return h;
    }

    fen() {
      const rows = [];
      for (let r = 0; r < 8; r++) {
        let row = '', empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.board[r * 8 + f];
          if (p === '.') { empty++; continue; }
          if (empty) { row += empty; empty = 0; }
          row += p;
        }
        if (empty) row += empty;
        rows.push(row);
      }
      let cs = '';
      if (this.castling & 1) cs += 'K';
      if (this.castling & 2) cs += 'Q';
      if (this.castling & 4) cs += 'k';
      if (this.castling & 8) cs += 'q';
      return `${rows.join('/')} ${this.turn} ${cs || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
    }

    get(sq) { return this.board[typeof sq === 'string' ? sqIndex(sq) : sq]; }

    attacked(sq, by) {
      const b = this.board, r = sq >> 3, f = sq & 7;
      if (by === 'w') {
        if (r < 7) {
          if (f > 0 && b[sq + 7] === 'P') return true;
          if (f < 7 && b[sq + 9] === 'P') return true;
        }
      } else if (r > 0) {
        if (f > 0 && b[sq - 9] === 'p') return true;
        if (f < 7 && b[sq - 7] === 'p') return true;
      }
      const w = by === 'w';
      const N = w ? 'N' : 'n', K = w ? 'K' : 'k', R = w ? 'R' : 'r', B = w ? 'B' : 'b', Q = w ? 'Q' : 'q';
      const kn = KNIGHT[sq];
      for (let i = 0; i < kn.length; i++) if (b[kn[i]] === N) return true;
      const kg = KING[sq];
      for (let i = 0; i < kg.length; i++) if (b[kg[i]] === K) return true;
      const rays = RAYS[sq];
      for (let d = 0; d < 8; d++) {
        const ray = rays[d], slider = d < 4 ? R : B;
        for (let i = 0; i < ray.length; i++) {
          const p = b[ray[i]];
          if (p === '.') continue;
          if (p === Q || p === slider) return true;
          break;
        }
      }
      return false;
    }

    inCheck(color) {
      color = color || this.turn;
      const k = this.kings[color];
      return k >= 0 && this.attacked(k, color === 'w' ? 'b' : 'w');
    }

    pseudo(capturesOnly) {
      const b = this.board, white = this.turn === 'w', moves = [];
      const enemy = (q) => q !== '.' && (q < 'a') !== white;
      const add = (from, to, piece, captured, flag, promo) =>
        moves.push({ from, to, piece, captured, flag: flag || '', promo: promo || '' });
      for (let s = 0; s < 64; s++) {
        const p = b[s];
        if (p === '.' || (p < 'a') !== white) continue;
        const t = white ? p.toLowerCase() : p;
        if (t === 'p') {
          const dir = white ? -8 : 8, lastRow = white ? 0 : 7, startRow = white ? 6 : 1;
          const one = s + dir, f = s & 7;
          const promoAll = (to, cap) => { for (const pr of 'qrbn') add(s, to, p, cap, '', pr); };
          if (b[one] === '.') {
            if ((one >> 3) === lastRow) promoAll(one, '.');
            else if (!capturesOnly) {
              add(s, one, p, '.');
              if ((s >> 3) === startRow && b[one + dir] === '.') add(s, one + dir, p, '.', 'd');
            }
          }
          for (const df of [-1, 1]) {
            if (f + df < 0 || f + df > 7) continue;
            const to = one + df, q = b[to];
            if (enemy(q)) { if ((to >> 3) === lastRow) promoAll(to, q); else add(s, to, p, q); }
            else if (to === this.ep && q === '.') add(s, to, p, white ? 'p' : 'P', 'e');
          }
        } else if (t === 'n' || t === 'k') {
          const tg = (t === 'n' ? KNIGHT : KING)[s];
          for (let i = 0; i < tg.length; i++) {
            const to = tg[i], q = b[to];
            if (q === '.') { if (!capturesOnly) add(s, to, p, '.'); } else if (enemy(q)) add(s, to, p, q);
          }
          if (t === 'k' && !capturesOnly) this._castles(s, white, add);
        } else {
          const d0 = t === 'b' ? 4 : 0, d1 = t === 'r' ? 4 : 8;
          for (let d = d0; d < d1; d++) {
            const ray = RAYS[s][d];
            for (let i = 0; i < ray.length; i++) {
              const to = ray[i], q = b[to];
              if (q === '.') { if (!capturesOnly) add(s, to, p, '.'); continue; }
              if (enemy(q)) add(s, to, p, q);
              break;
            }
          }
        }
      }
      return moves;
    }

    _castles(s, white, add) {
      const b = this.board, cr = this.castling, them = white ? 'b' : 'w';
      const free = (...sq) => sq.every((x) => b[x] === '.');
      const safe = (...sq) => sq.every((x) => !this.attacked(x, them));
      if (white && s === 60) {
        if ((cr & 1) && b[63] === 'R' && free(61, 62) && safe(60, 61, 62)) add(60, 62, 'K', '.', 'k');
        if ((cr & 2) && b[56] === 'R' && free(59, 58, 57) && safe(60, 59, 58)) add(60, 58, 'K', '.', 'q');
      } else if (!white && s === 4) {
        if ((cr & 4) && b[7] === 'r' && free(5, 6) && safe(4, 5, 6)) add(4, 6, 'k', '.', 'k');
        if ((cr & 8) && b[0] === 'r' && free(3, 2, 1) && safe(4, 3, 2)) add(4, 2, 'k', '.', 'q');
      }
    }

    make(m) {
      const b = this.board, white = this.turn === 'w';
      this.stack.push({ m, castling: this.castling, ep: this.ep, half: this.half, hash: this.hash });
      let h = this.hash ^ Z(m.piece, m.from);
      b[m.from] = '.';
      if (m.flag === 'e') {
        const cs = m.to + (white ? 8 : -8);
        h ^= Z(b[cs], cs);
        b[cs] = '.';
      } else if (m.captured !== '.') h ^= Z(m.captured, m.to);
      const placed = m.promo ? (white ? m.promo.toUpperCase() : m.promo) : m.piece;
      b[m.to] = placed;
      h ^= Z(placed, m.to);
      if (m.flag === 'k' || m.flag === 'q') {
        const [rf, rt] = CASTLE_ROOK[m.to];
        const R = b[rf];
        b[rf] = '.'; b[rt] = R;
        h ^= Z(R, rf) ^ Z(R, rt);
      }
      if (m.piece === 'K') this.kings.w = m.to;
      else if (m.piece === 'k') this.kings.b = m.to;
      h ^= ZC[this.castling];
      this.castling &= CR_MASK[m.from] & CR_MASK[m.to];
      h ^= ZC[this.castling];
      if (this.ep >= 0) h ^= ZEP[this.ep & 7];
      this.ep = m.flag === 'd' ? (m.from + m.to) >> 1 : -1;
      if (this.ep >= 0) h ^= ZEP[this.ep & 7];
      this.half = (m.piece === 'P' || m.piece === 'p' || m.captured !== '.') ? 0 : this.half + 1;
      if (!white) this.full++;
      this.turn = white ? 'b' : 'w';
      h ^= ZSIDE;
      this.hash = h;
      this.hashes.push(h);
    }

    undo() {
      const u = this.stack.pop();
      if (!u) return null;
      const m = u.m, b = this.board;
      this.turn = this.turn === 'w' ? 'b' : 'w';
      const white = this.turn === 'w';
      b[m.from] = m.piece;
      if (m.flag === 'e') { b[m.to] = '.'; b[m.to + (white ? 8 : -8)] = m.captured; }
      else b[m.to] = m.captured;
      if (m.flag === 'k' || m.flag === 'q') {
        const [rf, rt] = CASTLE_ROOK[m.to];
        b[rf] = b[rt]; b[rt] = '.';
      }
      if (m.piece === 'K') this.kings.w = m.from;
      else if (m.piece === 'k') this.kings.b = m.from;
      this.castling = u.castling;
      this.ep = u.ep;
      this.half = u.half;
      if (!white) this.full--;
      this.hash = u.hash;
      this.hashes.pop();
      return m;
    }

    moves(opts) {
      const us = this.turn, them = us === 'w' ? 'b' : 'w', res = [];
      const list = this.pseudo(opts && opts.captures);
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        this.make(m);
        const k = this.kings[us];
        if (k < 0 || !this.attacked(k, them)) res.push(m);
        this.undo();
      }
      if (opts && opts.square !== undefined) {
        const s = typeof opts.square === 'string' ? sqIndex(opts.square) : opts.square;
        return res.filter((m) => m.from === s);
      }
      return res;
    }

    isRepetition(count) {
      const hs = this.hashes, h = this.hash, last = hs.length - 1;
      let n = 0;
      for (let i = last; i >= 0 && i >= last - this.half; i -= 2) if (hs[i] === h && ++n >= count) return true;
      return false;
    }

    insufficient() {
      const rest = this.board.filter((p) => p !== '.' && p !== 'K' && p !== 'k');
      if (rest.length === 0) return true;
      if (rest.length === 1 && /[nbNB]/.test(rest[0])) return true;
      if (rest.every((p) => p === 'b' || p === 'B')) {
        const colors = new Set();
        this.board.forEach((p, s) => { if (p === 'b' || p === 'B') colors.add(((s >> 3) + (s & 7)) & 1); });
        return colors.size === 1;
      }
      return false;
    }

    status() {
      const ms = this.moves();
      if (!ms.length) {
        if (this.inCheck()) return { over: true, result: this.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
        return { over: true, result: '1/2-1/2', reason: 'stalemate' };
      }
      if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty' };
      if (this.isRepetition(3)) return { over: true, result: '1/2-1/2', reason: 'repetition' };
      if (this.insufficient()) return { over: true, result: '1/2-1/2', reason: 'material' };
      return { over: false };
    }

    san(m, legal) {
      legal = legal || this.moves();
      let s;
      if (m.flag === 'k') s = 'O-O';
      else if (m.flag === 'q') s = 'O-O-O';
      else {
        const t = m.piece.toUpperCase();
        if (t === 'P') {
          s = m.captured !== '.' ? FILES[m.from & 7] + 'x' : '';
          s += sqName(m.to);
          if (m.promo) s += '=' + m.promo.toUpperCase();
        } else {
          s = t;
          const amb = legal.filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
          if (amb.length) {
            const sameFile = amb.some((o) => (o.from & 7) === (m.from & 7));
            const sameRank = amb.some((o) => (o.from >> 3) === (m.from >> 3));
            if (!sameFile) s += FILES[m.from & 7];
            else if (!sameRank) s += 8 - (m.from >> 3);
            else s += sqName(m.from);
          }
          if (m.captured !== '.') s += 'x';
          s += sqName(m.to);
        }
      }
      this.make(m);
      if (this.inCheck()) s += this.moves().length ? '+' : '#';
      this.undo();
      return s;
    }

    moveFromUci(u) {
      if (!u) return null;
      const from = sqIndex(u.slice(0, 2)), to = sqIndex(u.slice(2, 4)), pr = (u[4] || '').toLowerCase();
      return this.moves().find((m) => m.from === from && m.to === to && m.promo === pr) || null;
    }

    moveFromSan(text) {
      const norm = (x) => x.replace(/[+#!?]/g, '').replace(/0/g, 'O').replace(/e\.p\./g, '').replace(/[x=:]/g, '');
      const want = norm(text.trim());
      const legal = this.moves();
      for (const m of legal) if (norm(this.san(m, legal)) === want) return m;
      // допускаем запись в виде e2e4
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(text.trim())) return this.moveFromUci(text.trim());
      return null;
    }

    history() { return this.stack.map((u) => u.m); }
  }

  Chess.uci = (m) => sqName(m.from) + sqName(m.to) + (m.promo || '');
  Chess.fromMoves = (fen, ucis) => {
    const g = new Chess(fen);
    for (const u of ucis || []) {
      const m = g.moveFromUci(u);
      if (!m) throw new Error('Недопустимый ход ' + u);
      g.make(m);
    }
    return g;
  };
  Chess.START_FEN = START_FEN;
  Chess.sqName = sqName;
  Chess.sqIndex = sqIndex;
  Chess.colorOf = colorOf;

  root.Chess = Chess;
  if (typeof module !== 'undefined' && module.exports) module.exports = Chess;
})(typeof self !== 'undefined' ? self : globalThis);
