// The engine is deterministic in Node. Skipped when no snapshot has been taken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tryOpenSnapshot } from "../lib/snapshot.mjs";
import { loadEngine } from "../sim/load.mjs";
import { runHeat } from "../sim/run.mjs";
import { ROOT } from "./helpers.mjs";

const skip = !tryOpenSnapshot(ROOT) && "no snapshot yet: run npm run snapshot";
const weave = (i) => ({ steer: Math.sin(i / 200) * 0.5, power: 0.9, charge: i % 400 > 300 });

test("the same seed and inputs end in the same state", { skip }, async () => {
  const engine = await loadEngine();
  const a = runHeat(engine, { seed: 7, steps: 120 * 60, input: weave });
  const b = runHeat(engine, { seed: 7, steps: 120 * 60, input: weave });
  assert.equal(a.hash, b.hash);
  assert.ok(a.state.totalTime > 59, `only ${a.state.totalTime} s simulated`);
  assert.equal(typeof a.totals.total, "number");
});

test("a different seed gives a different run", { skip }, async () => {
  const engine = await loadEngine();
  const a = runHeat(engine, { seed: 7, steps: 2400, input: weave });
  const b = runHeat(engine, { seed: 8, steps: 2400, input: weave });
  assert.notEqual(a.hash, b.hash);
});
