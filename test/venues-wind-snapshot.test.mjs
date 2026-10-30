// The venues mod changes the game's own wind: the engine, loaded with the
// mods' patches the way the AI worker loads it, feels a venue's wind zones.
// Skipped when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { loadPatches, patchImports } from "../server/patches.mjs";
import { loadVenueCatalog } from "../server/venues.mjs";
import { coastFor } from "../mods/venues/coast.js";
import { venueConditions } from "../mods/venues/venue.js";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("the patched engine feels Sotavento's zones where they are, and the game's own wind without them", { skip }, async () => {
  const mods = join(ROOT, "mods");
  patchImports(snapshot, await loadPatches(mods, ["venues"]), mods);
  const engine = await loadGame(snapshot, ["engine", "wind", "controls"]);
  const venue = loadVenueCatalog(join(ROOT, "tour", "venues.json")).byId.get("sotavento-fuerteventura");
  const zoned = venueConditions(engine.roomConditions, venue, "event:375:week:1");
  const { zones, ...plain } = zoned;
  const windAt = (conditions, off) => {
    const { inX, inZ, shoreline } = coastFor(venue.id);
    const state = engine.initState(conditions);
    state.x = inX * (shoreline - off);
    state.z = inZ * (shoreline - off);
    state.totalTime = 5;
    engine.step(state, { steer: 0, power: 0, charge: 0 }, 1 / 120);
    return state.wind;
  };
  assert.ok(zones, "Sotavento has wind zones");
  assert.ok(windAt(zoned, 30) < windAt(plain, 30) - 1.5, "lighter by the beach");
  assert.ok(windAt(zoned, 540) > windAt(plain, 540) + 3.5, "stronger far out");
  assert.ok(Math.abs(windAt(zoned, 316) - windAt(plain, 316)) < .5, "about the same mid-course");
});
