// Recordings made with the game's own controls replay exactly. Skipped when no
// snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { createRunner, decodeEvents } from "../mods/lib/replay.js";
import { DEMO_STEPS, recordHeat } from "../sim/record.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";
const hash = (state) => createHash("sha256").update(JSON.stringify(state)).digest("hex");

async function setup() {
  const engine = await loadGame(snapshot, ["engine", "wind", "controls", "week"]);
  const conditions = engine.weekConditions(engine.weekStart(Date.parse("2026-10-24T12:00:00Z")));
  return { engine, conditions, live: recordHeat(engine, conditions) };
}

test("a recorded heat replays to the same state and attempts", { skip }, async () => {
  const { engine, conditions, live } = await setup();
  assert.ok(live.state.heat.attempts.some((a) => a.status === "landed" && a.score > 0), "the demo script should land a move");
  assert.ok(decodeEvents(live.replay, engine.keyCodes).some((e) => e.type === "stick"), "the recording should include stick events");
  const runner = createRunner(engine, { conditions, replay: live.replay });
  runner.advance(DEMO_STEPS);
  assert.equal(runner.done, true);
  assert.deepEqual(runner.state.heat.attempts, live.state.heat.attempts);
  assert.equal(hash(runner.state), hash(live.state));
});

test("seeking across checkpoints matches a straight run", { skip }, async () => {
  const { engine, conditions, live } = await setup();
  const straight = (n) => {
    const r = createRunner(engine, { conditions, replay: live.replay });
    r.advance(n);
    return hash(r.state);
  };
  const runner = createRunner(engine, { conditions, replay: live.replay });
  runner.advance(DEMO_STEPS);
  for (const target of [300, 1900, 700, DEMO_STEPS]) {
    runner.seek(target);
    assert.equal(hash(runner.state), straight(target), `state at step ${target}`);
  }
});
