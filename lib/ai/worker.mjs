// A worker thread that sails AI heats for the local server. It loads the
// snapshot's engine once, sails each requested heat, and checks that the
// recording replays to the same score before answering. It also turns a
// recording into a pose track for the 1v1 relay.
import { parentPort, workerData } from "node:worker_threads";
import { createRunner } from "../../mods/lib/replay.js";
import { loadGame, openSnapshot } from "../snapshot.mjs";
import { sailHeat } from "./sail.mjs";

const engine = await loadGame(openSnapshot(workerData.root, workerData.snapshot), ["engine", "wind", "controls", "week", "pose"]);

// The rider's pose every `every` steps of a recorded heat (4 steps: 30 a
// second), and the heat time at which each attempt was settled (no longer
// pending), by attempt id, so a live score can follow the heat.
function poseTrack(conditions, replay, every = 4) {
  const runner = createRunner(engine, { conditions, replay });
  const poses = [engine.riderPose(runner.state)];
  const settledAt = {};
  while (!runner.done) {
    runner.advance(every);
    poses.push(engine.riderPose(runner.state));
    for (const attempt of runner.state.heat.attempts) {
      if (attempt.status !== "pending" && !(attempt.id in settledAt)) settledAt[attempt.id] = runner.state.totalTime;
    }
  }
  return { poses, settledAt };
}

parentPort.on("message", ({ id, kind = "sail", conditions, target, seconds, replay }) => {
  try {
    if (kind === "poses") {
      parentPort.postMessage({ id, track: poseTrack(conditions, replay) });
      return;
    }
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
