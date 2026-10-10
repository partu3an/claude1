global.Chess = require('../js/chess.js'); const L = require('../js/lessons.js');
let bad = 0;
for (const l of L) l.steps.forEach((s, i) => {
  try {
    const g = s.moves ? Chess.fromMoves(Chess.START_FEN, s.moves) : new Chess(s.fen === 'start' ? Chess.START_FEN : s.fen);
    const t = s.task;
    if (t && t.pre) for (const u of t.pre) { const m = g.moveFromUci(u); if (!m) throw 'pre ' + u; g.make(m); }
    if (t && t.solution) for (const u of t.solution) { const m = g.moveFromUci(u); if (!m) throw 'sol ' + u; g.make(m); }
    if (t && t.type === 'mate') { if (!g.moves().some(m => { g.make(m); const r = g.status().reason === 'checkmate'; g.undo(); return r; })) throw 'no mate'; }
    if (t && t.type === 'collect') { if (!g.moves().length) throw 'no moves'; }
  } catch (e) { bad++; console.log('FAIL', l.id, i, e); }
});
console.log(bad ? 'FAILED' : 'lessons OK');
