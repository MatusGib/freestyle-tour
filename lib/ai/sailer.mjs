// Sails AI heats in a worker thread, so the local server keeps answering while
// a heat is planned (about 20 seconds). The worker takes one heat at a time, in
// the order asked, and starts on the first request.
import { Worker } from "node:worker_threads";

export function createSailer({ root, snapshot }) {
  let worker = null;
  let next = 0;
  const waiting = new Map();
  const failAll = (error) => {
    for (const { reject } of waiting.values()) reject(error);
    waiting.clear();
    worker = null;
  };
  const start = () => {
    worker = new Worker(new URL("./worker.mjs", import.meta.url), { workerData: { root, snapshot } });
    worker.unref();
    worker.on("message", ({ id, heat, error }) => {
      const job = waiting.get(id);
      waiting.delete(id);
      if (error) job.reject(new Error(error));
      else job.resolve(heat);
    });
    worker.on("error", failAll);
  };
  return {
    // Resolves to { replay, score, attempts, tricks, steps }.
    sail(conditions, target, { seconds } = {}) {
      if (!worker) start();
      const id = next++;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ id, conditions, target, seconds });
      });
    },
    close() {
      return worker?.terminate();
    },
  };
}
