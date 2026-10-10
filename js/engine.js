/* Клиент движка: отправляет задания в Web Worker. Если воркер недоступен
 * (например, страница открыта как файл), считает в основном потоке. */
(function (root) {
  'use strict';
  class Engine {
    constructor() { this.worker = null; this.local = false; this.seq = 0; this.jobs = new Map(); }

    _ensure() {
      if (this.local) return null;
      if (this.worker) return this.worker;
      try {
        const w = new Worker(root.ENGINE_WORKER_URL || 'js/worker.js');
        w.onmessage = (e) => {
          const job = this.jobs.get(e.data.id);
          if (!job) return;
          this.jobs.delete(e.data.id);
          if (e.data.ok) job.resolve(e.data.result); else job.reject(new Error(e.data.error));
        };
        w.onerror = (e) => {
          if (e.preventDefault) e.preventDefault();
          this.local = true;
          this.worker = null;
          const pending = [...this.jobs.values()];
          this.jobs.clear();
          pending.forEach((job) => this._runLocal(job));
        };
        this.worker = w;
      } catch (err) {
        this.local = true;
      }
      return this.worker;
    }

    _runLocal(job) {
      const token = this.cancelToken;
      setTimeout(() => {
        if (token !== this.cancelToken) return;
        try { job.resolve(root.AI.runJob(job.type, job.data)); } catch (err) { job.reject(err); }
      }, 20);
    }

    run(type, data) {
      return new Promise((resolve, reject) => {
        const job = { id: ++this.seq, type, data, resolve, reject };
        const w = this._ensure();
        if (w) { this.jobs.set(job.id, job); w.postMessage({ id: job.id, type, data }); }
        else this._runLocal(job);
      });
    }

    /** Прервать текущие расчёты: обещания отменённых заданий никогда не выполнятся. */
    cancel() {
      this.cancelToken = (this.cancelToken || 0) + 1;
      if (this.worker && this.jobs.size) { this.worker.terminate(); this.worker = null; }
      this.jobs.clear();
    }
  }
  root.Engine = Engine;
})(typeof self !== 'undefined' ? self : globalThis);
