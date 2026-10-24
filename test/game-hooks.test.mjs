import { test } from "node:test";
import assert from "node:assert/strict";
import { onStep } from "../mods/lib/game.js";

test("onStep runs every hook on each read and keeps the game's input", () => {
  let reads = 0;
  const controls = { read(state) { reads++; return { steer: state.x }; } };
  const game = { controls };
  const seen = [];
  onStep(game, (state, input) => seen.push(["a", state.x, input.steer]));
  onStep(game, (state, input) => seen.push(["b", state.x, input.steer]));
  assert.deepEqual(game.controls.read({ x: 0.5 }), { steer: 0.5 });
  assert.equal(reads, 1);
  assert.deepEqual(seen, [["a", 0.5, 0.5], ["b", 0.5, 0.5]]);
});
