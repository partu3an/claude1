/* Задачи. solution — ходы в формате UCI: ход ученика, ответ соперника, снова ход ученика...
 * mate: N — задача на мат в N ходов (любой матующий ход тоже засчитывается). */
(function (root) {
  'use strict';
  const PUZZLES = [
    { id: 'm1-back', cat: 'Мат в 1', title: 'Мат по последней горизонтали', mate: 1,
      fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', solution: ['d1d8'],
      hint: 'Чёрного короля заперли его собственные пешки.' },
    { id: 'm1-knight', cat: 'Мат в 1', title: 'Спёртый мат', mate: 1,
      fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', solution: ['g5f7'],
      hint: 'Королю некуда отступить. Какая фигура перепрыгнет защиту?' },
    { id: 'm1-scholar', cat: 'Мат в 1', title: 'Детский мат', mate: 1,
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', solution: ['h5f7'],
      hint: 'Пункт f7 защищён только королём, а слон c4 смотрит прямо на него.' },
    { id: 'm1-fool', cat: 'Мат в 1', title: 'Дурацкий мат', mate: 1,
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', solution: ['d8h4'],
      hint: 'Белые ослабили диагональ e1–h4.' },
    { id: 'm1-black-rank', cat: 'Мат в 1', title: 'Чёрные ставят мат', mate: 1,
      fen: '3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', solution: ['d8d1'],
      hint: 'У белого короля нет «форточки».' },
    { id: 'm1-queen-king', cat: 'Мат в 1', title: 'Ферзь и король', mate: 1,
      fen: 'k7/8/1K6/8/8/8/8/7Q w - - 0 1', solution: ['h1h8'],
      hint: 'Король b6 уже отнял у чёрного короля поля a7, b7.' },
    { id: 'm1-arabic', cat: 'Мат в 1', title: 'Арабский мат', mate: 1,
      fen: '7k/7p/5N2/8/8/8/8/6RK w - - 0 1', solution: ['g1g8'],
      hint: 'Конь f6 защищает поле g8.' },

    { id: 'm2-philidor', cat: 'Мат в 2', title: 'Жертва ферзя', mate: 2,
      fen: '5r1k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1', solution: ['b3g8', 'f8g8', 'h6f7'],
      hint: 'Отдайте ферзя, чтобы ладья сама закрыла королю поле g8.' },
    { id: 'm2-ladder', cat: 'Мат в 2', title: 'Ладейная лесенка', mate: 2,
      fen: '7k/8/8/8/8/8/R7/1R4K1 w - - 0 1', solution: ['a2a7', 'h8g8', 'b1b8'],
      hint: 'Одна ладья отрезает горизонталь, вторая ставит мат.' },
    { id: 'm2-rook-king', cat: 'Мат в 2', title: 'Король помогает ладье', mate: 2,
      fen: '6k1/8/5K2/8/8/8/8/7R w - - 0 1', solution: ['h1h7', 'g8f8', 'h7h8'],
      hint: 'Сначала отнимите у короля седьмую горизонталь.' },

    { id: 'fork-knight', cat: 'Вилка', title: 'Конь бьёт две фигуры', fen: 'r3k3/pp3ppp/8/1N6/8/8/PP3PPP/4K3 w - - 0 1',
      solution: ['b5c7', 'e8d7', 'c7a8'], hint: 'Найдите шах конём, который нападает ещё и на ладью.' },
    { id: 'fork-queen', cat: 'Вилка', title: 'Двойной удар ферзём', fen: '4k3/pp3ppp/8/8/7b/8/PP3PPP/3QK3 w - - 0 1',
      solution: ['d1a4', 'e8f8', 'a4h4'], hint: 'Ферзь может объявить шах и одновременно напасть на слона по четвёртой горизонтали.' },
    { id: 'fork-pawn', cat: 'Вилка', title: 'Пешечная вилка', fen: '4k3/pp3ppp/3b1n2/8/3PP3/8/PP3PPP/4K3 w - - 0 1',
      solution: ['e4e5'], hint: 'Самая скромная фигура может напасть сразу на две.' },

    { id: 'pin-bishop', cat: 'Связка', title: 'Связка ферзя', fen: '4k3/3q4/8/8/P7/8/8/4KB2 w - - 0 1',
      solution: ['f1b5', 'd7b5', 'a4b5'], hint: 'Поставьте слона так, чтобы за ферзём оказался король.' },
    { id: 'pin-rook', cat: 'Связка', title: 'Связанный конь', fen: '4k3/4n3/8/3P4/8/8/8/4RK2 w - - 0 1',
      solution: ['d5d6'], hint: 'Конь e7 не может уйти: за ним король. Нападите на него пешкой.' },

    { id: 'skewer-rook', cat: 'Сквозной удар', title: 'Через короля', fen: '8/8/2k4q/8/8/8/8/R5K1 w - - 0 1',
      solution: ['a1a6', 'c6d5', 'a6h6'], hint: 'Шах по шестой горизонтали, а за королём — ферзь.' },

    { id: 'disc-knight', cat: 'Открытое нападение', title: 'Вскрытый удар ладьи', fen: '8/1k6/4q3/8/4N3/8/8/4R2K w - - 0 1',
      solution: ['e4c5', 'b7b6', 'e1e6'], hint: 'Конь уходит с шахом и открывает ладье дорогу к ферзю.' },

    { id: 'hang-queen', cat: 'Выигрыш материала', title: 'Незащищённая фигура', fen: 'r1b1kbnr/pppp1ppp/2n5/4p1q1/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 0 1',
      solution: ['c1g5'], hint: 'Какая фигура соперника стоит без защиты?' },
  ];
  root.PUZZLES = PUZZLES;
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PUZZLES;
})(typeof self !== 'undefined' ? self : globalThis);
