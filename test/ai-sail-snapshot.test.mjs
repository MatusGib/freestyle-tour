// The planner sails with the snapshot's engine, and its recordings replay
// exactly. Skipped when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sailHeat } from "../lib/ai/sail.mjs";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { createRunner } from "../mods/lib/replay.js";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";
const hash = (state) => createHash("sha256").update(JSON.stringify(state)).digest("hex");

async function setup() {
  const engine = await loadGame(snapshot, ["engine", "wind", "controls", "week"]);
  return { engine, conditions: engine.weekConditions(engine.weekStart(Date.parse("2026-10-24T12:00:00Z"))) };
}

test("a planned heat replays to the same state, and the same plan comes out every time", { skip }, async () => {
  const { engine, conditions } = await setup();
  const heat = sailHeat(engine, conditions, 40, { seconds: 20 });
  assert.equal(heat.steps, 2400);
  assert.ok(heat.attempts.length > 0, "the planner should try a move in 20 seconds");
  const runner = createRunner(engine, { conditions, replay: heat.replay });
  runner.advance(heat.steps);
  assert.deepEqual(runner.state.heat.attempts, heat.attempts);
  assert.equal(hash(runner.state), hash(heat.state));
  assert.deepEqual(sailHeat(engine, conditions, 40, { seconds: 20 }).replay, heat.replay);
});
