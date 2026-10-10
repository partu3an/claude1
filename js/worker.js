/* Фоновый поток для бота, чтобы интерфейс не зависал во время расчёта. */
importScripts('chess.js', 'ai.js');
self.onmessage = (e) => {
  const { id, type, data } = e.data;
  try {
    self.postMessage({ id, ok: true, result: self.AI.runJob(type, data) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
