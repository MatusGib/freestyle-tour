import { test } from "node:test";
import assert from "node:assert/strict";
import { claimOpponent, opponentOwner, releaseOpponent } from "../mods/lib/opponent.js";
import { mayShowGhost } from "../mods/ghosts/ghost.js";

test("one mod holds the opponent slot at a time, and only it can release it", () => {
  assert.equal(opponentOwner(), null);
  assert.equal(claimOpponent("challenge"), true);
  assert.equal(claimOpponent("challenge"), true, "claiming again is fine");
  assert.equal(claimOpponent("other"), false);
  releaseOpponent("other");
  assert.equal(opponentOwner(), "challenge");
  releaseOpponent("challenge");
  assert.equal(opponentOwner(), null);
  assert.equal(claimOpponent("other"), true);
  releaseOpponent("other");
});

test("the ghost starts only at a solo heat's start and only while no mod holds the slot", () => {
  const start = { totalTime: 0, heat: { enabled: true } };
  const solo = { competitionClock: null };
  assert.equal(mayShowGhost(start, solo, null), true);
  assert.equal(mayShowGhost(start, solo, "challenge"), false);
  assert.equal(mayShowGhost({ ...start, totalTime: 1 }, solo, null), false);
});
