// A worker thread that sails AI heats for the local server. It loads the
// snapshot's engine once, sails each requested heat, and checks that the
// recording replays to the same score before answering.
import { parentPort, workerData } from "node:worker_threads";
import { createRunner } from "../../mods/lib/replay.js";
import { loadGame, openSnapshot } from "../snapshot.mjs";
import { sailHeat } from "./sail.mjs";

const engine = await loadGame(openSnapshot(workerData.root, workerData.snapshot), ["engine", "wind", "controls", "week"]);

parentPort.on("message", ({ id, conditions, target, seconds }) => {
  try {
    const { state, ...heat } = sailHeat(engine, conditions, target, { seconds });
    const runner = createRunner(engine, { conditions, replay: heat.replay });
    runner.advance(heat.steps);
    const replayed = engine.heatTotals(runner.state.heat).total;
    if (replayed !== heat.score) throw new Error(`the recording replays to ${replayed}, not ${heat.score}`);
    parentPort.postMessage({ id, heat });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
