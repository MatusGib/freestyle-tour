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
    worker.on("message", ({ id, heat, track, error }) => {
      const job = waiting.get(id);
      waiting.delete(id);
      if (error) job.reject(new Error(error));
      else job.resolve(heat ?? track);
    });
    worker.on("error", failAll);
  };
  const ask = (message) => {
    if (!worker) start();
    const id = next++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, ...message });
    });
  };
  return {
    // Resolves to { replay, score, attempts, tricks, steps }.
    sail: (conditions, target, { seconds } = {}) => ask({ conditions, target, seconds }),
    // Resolves to { poses, settledAt }: the recorded heat's poses, 30 a second,
    // and when each attempt was settled, by attempt id.
    poses: (conditions, replay) => ask({ kind: "poses", conditions, replay }),
    close() {
      return worker?.terminate();
    },
  };
}
