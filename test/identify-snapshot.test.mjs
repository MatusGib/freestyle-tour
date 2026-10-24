// Every code signature must match exactly once in the current snapshot.
// Skipped when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { SIGNATURES } from "../mods/lib/identify.js";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("every signature matches exactly once in the current snapshot", { skip }, async () => {
  const game = await loadGame(snapshot, ["engine", "wind", "controls", "week", "pose"]);
  for (const signatures of Object.values(SIGNATURES)) {
    for (const label of Object.keys(signatures)) assert.notEqual(game[label], undefined, `${label} not found`);
  }
  assert.equal(typeof game.step, "function");
  assert.equal(typeof game.heatRules.seconds, "number");
  assert.equal(game.keyCodes[0], "Space");
  assert.equal(typeof game.Recorder, "function");
  assert.equal(typeof game.riderPose, "function");
});

test("the weekly calendar starts weeks on Monday at midnight in Warsaw", { skip }, async () => {
  const { weekStart, nextWeekStart, weekConditions } = await loadGame(snapshot, ["week"]);
  const start = weekStart(Date.parse("2026-10-24T12:00:00Z"));
  assert.equal(new Date(start).toISOString(), "2026-10-18T22:00:00.000Z");
  assert.equal(new Date(nextWeekStart(start)).toISOString(), "2026-10-25T23:00:00.000Z");
  assert.deepEqual(Object.keys(weekConditions(start)).sort(), ["gustKnots", "knots", "seed"]);
});
