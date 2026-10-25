// The worker turns a recorded heat into the AI's pose track for the 1v1 relay.
// Skipped when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSailer } from "../lib/ai/sailer.mjs";
import { sailHeat } from "../lib/ai/sail.mjs";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { createRunner } from "../mods/lib/replay.js";
import { DEFAULT_WIND, roomIdsFor } from "../server/weekly.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("the pose track has a pose every 4 steps and when each attempt settled", { skip }, async (t) => {
  const engine = await loadGame(snapshot, ["engine", "wind", "controls", "week", "pose"]);
  const conditions = engine.roomConditions(roomIdsFor(engine.roomConditions, DEFAULT_WIND, "probe").next().value);
  const heat = sailHeat(engine, conditions, 40, { seconds: 20 });
  const sailer = createSailer({ root: ROOT });
  t.after(() => sailer.close());
  const { poses, settledAt } = await sailer.poses(conditions, heat.replay);
  assert.equal(poses.length, heat.steps / 4 + 1);
  const runner = createRunner(engine, { conditions, replay: heat.replay });
  runner.advance(400);
  assert.deepEqual(poses[100], engine.riderPose(runner.state));
  const settled = heat.attempts.filter((a) => a.status !== "pending");
  assert.ok(settled.length > 0, "the planner should settle a move in 20 seconds");
  for (const attempt of settled) assert.ok(settledAt[attempt.id] > attempt.startedAt && settledAt[attempt.id] <= 20, `attempt ${attempt.id} settled at ${settledAt[attempt.id]}`);
});
