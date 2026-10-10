const Chess = require('../js/chess.js');
function perft(g, d) { if (d === 0) return 1; let n = 0; for (const m of g.moves()) { g.make(m); n += perft(g, d - 1); g.undo(); } return n; }
const cases = [
  [Chess.START_FEN, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
let ok = true;
for (const [fen, exp] of cases) exp.forEach((e, i) => {
  const g = new Chess(fen); const h0 = g.hash; const n = perft(g, i + 1);
  if (n !== e || g.hash !== h0 || g.fen() !== new Chess(fen).fen()) { ok = false; console.log('FAIL', fen, i + 1, n, e); }
});
const g = new Chess();
for (const s of ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O']) { const m = g.moveFromSan(s); if (!m) { ok=false; console.log('SAN fail', s); break; } g.make(m); }
console.log(g.fen());
console.log(ok ? 'perft OK' : 'perft FAILED');
