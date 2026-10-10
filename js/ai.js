/* Шахматный бот: оценка позиции, поиск альфа-бета с итеративным углублением,
 * форсированные варианты (quiescence), таблица транспозиций. Плюс разбор партии. */
(function (root) {
  'use strict';
  const Chess = root.Chess || (typeof require !== 'undefined' ? require('./chess.js') : null);

  const MATE = 100000, INF = 1e9;
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

  const PST = {
    p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  };
  const KING_MID = [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20];
  const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];

  const centerDist = (s) => { const r = s >> 3, f = s & 7; return Math.max(3 - r, r - 4) + Math.max(3 - f, f - 4); };
  const dist = (a, b) => Math.abs((a >> 3) - (b >> 3)) + Math.abs((a & 7) - (b & 7));

  /** Оценка в сантипешках с точки зрения стороны, которая ходит. */
  function evaluate(g) {
    const b = g.board;
    let score = 0, wMat = 0, bMat = 0, wNP = 0, bNP = 0, wB = 0, bB = 0;
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (p === '.' || p === 'K' || p === 'k') continue;
      if (p < 'a') {
        const t = p.toLowerCase(), v = VAL[t];
        score += v + PST[t][s]; wMat += v;
        if (t !== 'p') wNP += v;
        if (t === 'b') wB++;
      } else {
        const v = VAL[p];
        score -= v + PST[p][s ^ 56]; bMat += v;
        if (p !== 'p') bNP += v;
        if (p === 'b') bB++;
      }
    }
    const endgame = wNP + bNP <= 1700;
    const KT = endgame ? KING_END : KING_MID, kw = g.kings.w, kb = g.kings.b;
    if (kw >= 0) score += KT[kw];
    if (kb >= 0) score -= KT[kb ^ 56];
    if (wB >= 2) score += 30;
    if (bB >= 2) score -= 30;
    // Добивание голого короля: прижать к краю и подвести своего короля
    if (endgame && kw >= 0 && kb >= 0) {
      const diff = wMat - bMat;
      if (diff >= 400) score += 10 * centerDist(kb) + 4 * (14 - dist(kw, kb));
      else if (diff <= -400) score -= 10 * centerDist(kw) + 4 * (14 - dist(kw, kb));
    }
    return g.turn === 'w' ? score : -score;
  }

  const moveKey = (m) => m.from * 64 + m.to + (m.promo ? ' qrbn'.indexOf(m.promo) * 4096 : 0);

  function orderMoves(moves, ttKey, killers) {
    for (const m of moves) {
      let s = 0;
      if (ttKey !== undefined && moveKey(m) === ttKey) s = 1e6;
      else if (m.captured !== '.') s = 1e5 + 10 * VAL[m.captured.toLowerCase()] - VAL[m.piece.toLowerCase()];
      else if (m.promo) s = 9e4 + VAL[m.promo];
      else if (killers && (killers[0] === moveKey(m) || killers[1] === moveKey(m))) s = 5e4;
      m._o = s;
    }
    moves.sort((a, b) => b._o - a._o);
  }

  /**
   * Поиск лучшего хода.
   * opts: depth — максимальная глубина, timeMs — ограничение по времени,
   *       noise — случайный разброс оценки корневых ходов (ослабляет бота).
   */
  function search(g, opts) {
    opts = opts || {};
    const maxDepth = opts.depth || 3, timeMs = opts.timeMs || 0, noise = opts.noise || 0;
    const t0 = Date.now();
    let nodes = 0, stop = false;
    const tt = new Map(), killers = [];

    const toTT = (s, ply) => (s > MATE - 1000 ? s + ply : s < -MATE + 1000 ? s - ply : s);
    const fromTT = (s, ply) => (s > MATE - 1000 ? s - ply : s < -MATE + 1000 ? s + ply : s);
    const tick = () => { if ((++nodes & 2047) === 0 && timeMs && Date.now() - t0 > timeMs) stop = true; return stop; };

    function quiesce(alpha, beta, qd) {
      if (tick()) return 0;
      const stand = evaluate(g);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (qd >= 6) return stand;
      const moves = g.moves({ captures: true });
      orderMoves(moves);
      for (const m of moves) {
        if (!m.promo && stand + VAL[m.captured.toLowerCase()] + 200 < alpha) continue;
        g.make(m);
        const s = -quiesce(-beta, -alpha, qd + 1);
        g.undo();
        if (stop) return 0;
        if (s >= beta) return s;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }

    function negamax(depth, alpha, beta, ply) {
      if (tick()) return 0;
      if (g.half >= 100 || g.isRepetition(2)) return 0;
      const inCheck = g.inCheck();
      if (inCheck && ply < 14) depth++;
      if (depth <= 0) return quiesce(alpha, beta, 0);
      const alpha0 = alpha;
      const e = tt.get(g.hash);
      if (e && e.depth >= depth) {
        const s = fromTT(e.score, ply);
        if (e.flag === 0) return s;
        if (e.flag === 1 && s >= beta) return s;
        if (e.flag === 2 && s <= alpha) return s;
      }
      const moves = g.moves();
      if (!moves.length) return inCheck ? -MATE + ply : 0;
      orderMoves(moves, e && e.move, killers[ply]);
      let best = -INF, bestMove;
      for (const m of moves) {
        g.make(m);
        const s = -negamax(depth - 1, -beta, -alpha, ply + 1);
        g.undo();
        if (stop) return 0;
        if (s > best) { best = s; bestMove = m; }
        if (s > alpha) alpha = s;
        if (alpha >= beta) {
          if (m.captured === '.') {
            const k = killers[ply] || (killers[ply] = [0, 0]);
            if (k[0] !== moveKey(m)) { k[1] = k[0]; k[0] = moveKey(m); }
          }
          break;
        }
      }
      if (tt.size > 400000) tt.clear();
      tt.set(g.hash, { depth, score: toTT(best, ply), flag: best <= alpha0 ? 2 : best >= beta ? 1 : 0, move: moveKey(bestMove) });
      return best;
    }

    const rootMoves = g.moves();
    if (!rootMoves.length) return null;
    orderMoves(rootMoves);
    let scored = rootMoves.map((m) => ({ m, s: 0 }));
    let done = 0;
    for (let d = 1; d <= maxDepth; d++) {
      const next = scored.map((x) => ({ m: x.m, s: -INF }));
      let alpha = -INF;
      for (const x of next) {
        g.make(x.m);
        x.s = noise ? -negamax(d - 1, -INF, INF, 1) : -negamax(d - 1, -INF, -alpha, 1);
        g.undo();
        if (stop) break;
        if (x.s > alpha) alpha = x.s;
      }
      if (stop && d > 1) break;
      next.sort((a, b) => b.s - a.s);
      scored = next;
      done = d;
      if (stop || Math.abs(scored[0].s) > MATE - 1000) break;
      if (timeMs && Date.now() - t0 > timeMs * 0.45) break;
    }
    let pick = scored[0];
    if (noise) {
      let bestV = -INF;
      for (const x of scored) {
        if (Math.abs(x.s) > MATE - 1000) { if (x.s > 0 && x.s + 1e6 > bestV) { bestV = x.s + 1e6; pick = x; } continue; }
        const v = x.s + (Math.random() * 2 - 1) * noise;
        if (v > bestV) { bestV = v; pick = x; }
      }
    }
    return { move: pick.m, uci: Chess.uci(pick.m), score: pick.s, bestScore: scored[0].s, depth: done, nodes, ms: Date.now() - t0 };
  }

  /** Ход бота с учётом уровня сложности. */
  function think(g, level) {
    level = level || {};
    const moves = g.moves();
    if (!moves.length) return null;
    if (level.random && Math.random() < level.random) {
      const m = moves[Math.floor(Math.random() * moves.length)];
      return { move: m, uci: Chess.uci(m), score: 0, depth: 0 };
    }
    let opts = { depth: level.depth, timeMs: level.timeMs, noise: level.noise || 0 };
    // В дебюте добавляем немного разнообразия, чтобы партии не повторялись
    if (g.full <= 4 && opts.noise < 15) opts = { depth: Math.min(opts.depth || 3, 3), noise: 15 };
    return search(g, opts);
  }

  /**
   * Разбор одного хода партии: позиция перед ходом в g, сыгранный ход uci.
   * Возвращает лучший ход, оценки и лучший ответ соперника. Ход делается в g.
   */
  function analyzePly(g, uci, depth) {
    const best = search(g, { depth });
    const m = g.moveFromUci(uci);
    if (!m) throw new Error('Недопустимый ход ' + uci);
    const san = g.san(m);
    g.make(m);
    let played, reply = null;
    if (!g.moves().length) played = g.inCheck() ? MATE - 1 : 0;
    else if (g.half >= 100 || g.isRepetition(3)) played = 0;
    else {
      const r = search(g, { depth: Math.max(1, depth - 1) });
      played = -r.score;
      reply = r.uci;
    }
    if (best.uci === uci) played = Math.max(played, best.score);
    return { uci, san, best: best.uci, bestScore: best.score, played, reply };
  }

  const AI = { MATE, VAL, evaluate, search, think, analyzePly };

  /** Обработчик заданий — общий для Web Worker и запасного режима в основном потоке. */
  AI.runJob = function (type, data) {
    const g = Chess.fromMoves(data.fen, data.moves);
    if (type === 'think') {
      const r = think(g, data.level);
      return r && { uci: r.uci, score: r.score, depth: r.depth };
    }
    if (type === 'best') {
      const r = search(g, { depth: data.depth || 3, timeMs: data.timeMs || 0 });
      return r && { uci: r.uci, score: r.score, depth: r.depth };
    }
    if (type === 'ply') return analyzePly(g, data.uci, data.depth || 3);
    throw new Error('Неизвестное задание ' + type);
  };

  root.AI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof self !== 'undefined' ? self : globalThis);
