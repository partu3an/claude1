global.Chess = require('../js/chess.js'); const AI = require('../js/ai.js'); const P = require('../js/puzzles.js');
let bad = 0;
for (const p of P) {
  const g = new Chess(p.fen); const e0 = AI.search(g, {depth: p.mate ? p.mate*2 : 5});
  let ok = true;
  for (const u of p.solution) { const m = g.moveFromUci(u); if (!m) { ok = false; console.log('ILLEGAL', p.id, u); break; } g.make(m); }
  const st = g.status();
  if (p.mate && st.reason !== 'checkmate') { ok = false; console.log('NOT MATE', p.id); }
  const first = e0.uci === p.solution[0];
  const gEnd = new Chess(p.fen); const tag = first ? 'ok ' : 'ALT';
  console.log(tag, p.id.padEnd(16), 'engine', e0.uci, e0.score, 'sol', p.solution[0]);
  if (!ok) bad++;
}
console.log(bad ? 'FAILED ' + bad : 'all legal');
