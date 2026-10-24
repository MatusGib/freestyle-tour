import { test } from "node:test";
import assert from "node:assert/strict";
import { ghostLabel, isHeatStart, pickGhost, stepOf } from "../mods/ghosts/ghost.js";

const heat = (heatId, score, hasReplay = true) => ({ heatId, score, hasReplay, nickname: "Tester" });

test("pickGhost picks the best heat with a recording", () => {
  assert.equal(pickGhost([heat("a", 5), heat("b", 9, false), heat("c", 7)]).heatId, "c");
  assert.equal(pickGhost([heat("b", 9, false)]), null);
  assert.equal(pickGhost([]), null);
});

test("ghostLabel shows the rider and score", () => {
  assert.equal(ghostLabel(heat("a", 9.634)), "Ghost · Tester · 9.63");
});

test("stepOf turns the heat clock into a step count", () => {
  assert.equal(stepOf({ totalTime: 1.5 }), 180);
  assert.equal(stepOf({ totalTime: 0.9999999999 }), 120);
});

test("isHeatStart is true only for a solo heat at its first step", () => {
  const state = (enabled, totalTime) => ({ totalTime, heat: { enabled } });
  assert.equal(isHeatStart(state(true, 0), { competitionClock: null }), true);
  assert.equal(isHeatStart(state(false, 0), { competitionClock: null }), false);
  assert.equal(isHeatStart(state(true, 2), { competitionClock: null }), false);
  assert.equal(isHeatStart(state(true, 0), { competitionClock: () => 0 }), false);
});
