import { test } from "node:test";
import assert from "node:assert/strict";
import { aiSample, isSoloHeatStart, isStale, nextHeatText, planningText, resultText, riderLine } from "../mods/challenge/challenge.js";

const heat = { pseudonym: "Balt Möller", target: 41.267, score: 40.81, weekStart: 1000 };

test("the panel's lines show the rider, the plan and the next heat", () => {
  assert.equal(riderLine({ place: 9, pseudonym: "Balt Möller", average: 35.643 }), "9. Balt Möller · 35.6");
  assert.equal(planningText("Balt Möller"), "Planning Balt Möller's heat…");
  assert.equal(nextHeatText(heat), "Next solo heat: vs Balt Möller (target 41.3)");
});

test("the result names the winner, or a draw", () => {
  assert.equal(resultText(42.5, heat), "You 42.50 · Balt Möller 40.81: you win");
  assert.equal(resultText(38.2, heat), "You 38.20 · Balt Möller 40.81: Balt Möller wins");
  assert.equal(resultText(40.81, heat), "You 40.81 · Balt Möller 40.81: a draw");
});

test("a challenge from another week is stale", () => {
  assert.equal(isStale(heat, 1000), false);
  assert.equal(isStale(heat, 2000), true);
});

test("challenges start at a solo heat's first step, and send poses like the 1v1 transport", () => {
  const state = (enabled, totalTime) => ({ totalTime, heat: { enabled } });
  assert.equal(isSoloHeatStart(state(true, 0), { competitionClock: null }), true);
  assert.equal(isSoloHeatStart(state(false, 0), { competitionClock: null }), false);
  assert.equal(isSoloHeatStart(state(true, 0), { competitionClock: () => 0 }), false);
  const pose = { x: 1 };
  assert.deepEqual(aiSample(pose, 12.5), { pose, updatedAt: 12.5, streamId: "challenge" });
});
