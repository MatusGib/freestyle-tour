// Ghost samples must fit the game's own opponent display, which blends samples
// shaped { pose, updatedAt }. Skipped when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { ghostSample } from "../mods/ghosts/ghost.js";
import { createRunner } from "../mods/lib/replay.js";
import { recordHeat } from "../sim/record.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("ghost samples blend with the game's own pose blending", { skip }, async () => {
  const engine = await loadGame(snapshot, ["engine", "wind", "controls", "week", "pose"]);
  const conditions = engine.weekConditions(engine.weekStart(Date.parse("2026-10-24T12:00:00Z")));
  const runner = createRunner(engine, { conditions, replay: recordHeat(engine, conditions).replay });
  runner.advance(600);
  const first = engine.riderPose(runner.state);
  runner.advance(6);
  const second = engine.riderPose(runner.state);

  const blended = engine.blendPoses(ghostSample(first, 1000), ghostSample(second, 1050), 1025);
  assert.ok(Number.isFinite(blended.x) && Number.isFinite(blended.z));
  assert.ok(Math.abs(blended.x - (first.x + second.x) / 2) < 1, `x ${blended.x} should lie between ${first.x} and ${second.x}`);

  // A flat pose (the original bug) is not what the game expects.
  const flat = (pose, updatedAt) => ({ ...pose, updatedAt, streamId: "ghost" });
  assert.throws(() => engine.blendPoses(flat(first, 1000), flat(second, 1050), 1025), TypeError);
});
