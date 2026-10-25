// Room winds come from the game's own room-conditions function. Skipped when
// no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { DEFAULT_WIND, roomIdsFor } from "../server/weekly.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("room ids with the default wind are found quickly and all give the same wind", { skip }, async () => {
  const game = await loadGame(snapshot, ["wind"]);
  const ids = roomIdsFor(game.roomConditions, DEFAULT_WIND, "super-final-378-1792885000000");
  const [a, b] = [ids.next().value, ids.next().value];
  assert.match(a, /^super-final-378-1792885000000-\d+$/);
  for (const id of [a, b]) assert.deepEqual({ ...game.roomConditions(id), seed: 0 }, { seed: 0, ...DEFAULT_WIND });
  const [ca, cb] = [game.roomConditions(a), game.roomConditions(b)];
  for (let t = 0; t < 180; t += 1.3) for (const [x, z] of [[0, 0], [60, -90]]) assert.equal(game.wind(ca, x, z, t), game.wind(cb, x, z, t));
});
