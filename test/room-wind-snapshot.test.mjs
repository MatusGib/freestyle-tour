// Room winds come from the game's own room-conditions function. Skipped when
// no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { WIND, championRooms } from "../server/weekly.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("the champion's rooms are found quickly, get 21 kt, and each has its own gusts", { skip }, async () => {
  const game = await loadGame(snapshot, ["wind"]);
  const rooms = championRooms(game.roomConditions, "2025-sylt", 1792885000000);
  const [a, b] = [rooms.next().value, rooms.next().value];
  assert.match(a.id, /^champion-2025-sylt-1792885000000-\d+$/);
  for (const { id, conditions } of [a, b]) assert.deepEqual({ ...conditions, seed: 0 }, { seed: 0, ...WIND }, id);
  let differ = 0;
  for (let t = 0; t < 180; t += 1.3) if (game.wind(a.conditions, 0, 0, t) !== game.wind(b.conditions, 0, 0, t)) differ += 1;
  assert.ok(differ > 0, "gusts make every room's wind its own, so every room needs its own heat");
});
