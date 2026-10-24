// The sailer sails heats in a worker thread. Skipped when no snapshot has been
// taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSailer } from "../lib/ai/sailer.mjs";
import { sailHeat } from "../lib/ai/sail.mjs";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("the sailer sails in a worker thread and reports errors", { skip }, async (t) => {
  const engine = await loadGame(snapshot, ["engine", "wind", "controls", "week"]);
  const conditions = engine.weekConditions(engine.weekStart(Date.parse("2026-10-24T12:00:00Z")));
  const sailer = createSailer({ root: ROOT });
  t.after(() => sailer.close());
  const heat = await sailer.sail(conditions, 40, { seconds: 20 });
  assert.deepEqual(heat.replay, sailHeat(engine, conditions, 40, { seconds: 20 }).replay);
  assert.equal(heat.steps, 2400);
  assert.equal("state" in heat, false);
  await assert.rejects(sailer.sail(null, 40, { seconds: 1 }), Error);
});
