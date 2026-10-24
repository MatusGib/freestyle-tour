import { test } from "node:test";
import assert from "node:assert/strict";
import { judge } from "../tools/ai-check.mjs";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test("the check passes misses within 1.0 on average and 3 at worst", () => {
  const good = judge([{ target: 30, score: 30.5 }, { target: 22, score: 23.3 }]);
  near(good.mean, 0.9);
  near(good.worst, 1.3);
  assert.equal(good.pass, true);
  assert.equal(judge([{ target: 30, score: 31.5 }, { target: 40, score: 38.9 }]).pass, false, "mean 1.3");
  assert.equal(judge([{ target: 30, score: 30 }, { target: 30, score: 30 }, { target: 22, score: 25.5 }]).pass, false, "worst 3.5");
});
