// The venues mod: the catalog and how events find their venue, the API that
// serves them, the conditions a venue heat gets, and the coast: where the
// beach lies and how it stops the rider.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { loadVenueCatalog, venueForLocation } from "../server/venues.mjs";
import { SITE_LAYOUTS, coastFor, resolveVenueCollision, shorelineAt } from "../mods/venues/scenery.js";
import { rememberPlannedHeat, takePlannedHeat, venueConditions } from "../mods/venues/venue.js";
import { VENUE_LOOKS } from "../mods/venues/water.js";
import { ROOT, fakeGame, tempDir, writeTour } from "./helpers.mjs";

const catalog = loadVenueCatalog(join(ROOT, "tour", "venues.json"));
const SOTAVENTO = "sotavento-fuerteventura";
const SYLT = "westerland-sylt";

test("the tour's Sotavento and Sylt events find their venue, and no other event does", () => {
  const tour = loadTour(join(ROOT, "tour"));
  const matched = {};
  for (const event of tour.events.values()) {
    const venue = venueForLocation(catalog, event.location);
    if (venue) matched[event.location] = venue.id;
  }
  assert.deepEqual(matched, { "Sotavento, Fuerteventura": SOTAVENTO, "Westerland, Sylt, Germany": SYLT });
  assert.equal(venueForLocation(catalog, "sotavento  FUERTEVENTURA")?.id, SOTAVENTO, "spelling and spacing don't matter");
  assert.equal(venueForLocation(catalog, "Pozo Izquierdo, Gran Canaria"), null);
});

test("a catalog with a missing file, an unsupported wind, a repeated id or a shared location is refused", (t) => {
  const dir = tempDir(t);
  assert.equal(loadVenueCatalog(join(dir, "none.json")), null);
  const venue = (id, locations, gameConditions = { knots: 17, gustKnots: 4 }) => ({ id, name: id, locations, gameConditions });
  const refused = (venues) => {
    const file = join(dir, "venues.json");
    writeFileSync(file, JSON.stringify({ version: 1, venues }));
    return assert.throws(() => loadVenueCatalog(file));
  };
  refused([venue("a", ["A"], { knots: 25, gustKnots: 4 })]);
  refused([venue("a", ["A"], { knots: 17, gustKnots: 1 })]);
  refused([venue("a", ["A"]), venue("a", ["B"])]);
  refused([venue("a", ["A"]), venue("b", ["a"])]);
});

test("a venue heat keeps the room's seed and takes the venue's wind", () => {
  const room = (id) => ({ seed: id.length, knots: 15, gustKnots: 0 });
  assert.deepEqual(venueConditions(room, { gameConditions: { knots: 19, gustKnots: 6 } }, "event:375"), { seed: 9, knots: 19, gustKnots: 6 });
});

test("a planned challenge heat is taken once", () => {
  const conditions = { seed: 3, knots: 19, gustKnots: 6 };
  rememberPlannedHeat({ conditions, venue: { id: SOTAVENTO } });
  assert.deepEqual(takePlannedHeat(), { conditions, venue: { id: SOTAVENTO } });
  assert.equal(takePlannedHeat(), null);
});

// The fixture tour, with its 2025 Fuerteventura event moved to Sotavento.
function setup(t, mods) {
  const dir = tempDir(t);
  writeTour(join(dir, "tour"));
  const season = join(dir, "tour", "seasons", "2025.json");
  const data = JSON.parse(readFileSync(season, "utf8"));
  data.events.find((e) => e.id === 375).location = "Sotavento, Fuerteventura";
  writeFileSync(season, JSON.stringify(data));
  const calls = [];
  const ctx = {
    store: createStore(join(dir, "db.json")),
    aiHeats: createStore(join(dir, "ai-heats.json"), { heats: {} }),
    game: { ...fakeGame, roomConditions: (id) => ({ seed: id.length, knots: 15, gustKnots: 0 }) },
    now: () => Date.parse("2026-10-21T12:00:00Z"),
    tour: loadTour(join(dir, "tour")),
    venues: mods.includes("venues") ? catalog : null,
    mods,
    ai: { async sail(conditions, target) { calls.push(conditions); return { replay: { format: 1, steps: 1, events: "" }, score: target, attempts: [], tricks: [] }; } },
    snapshot: "2026-10-24",
  };
  const call = (method, path, body) => handleApi({ method, path, query: new URLSearchParams(), body }, ctx);
  return { call, calls };
}

test("with the venues mod, an event at a venue names it, and its AI heat sails in the venue's wind", async (t) => {
  const { call, calls } = setup(t, ["venues", "challenge"]);
  const venues = call("GET", "/api/local/venues").body;
  assert.deepEqual(venues.venues.map((v) => v.id), [SOTAVENTO, SYLT]);
  assert.ok(!JSON.stringify(venues).includes("locations"), "the location spellings stay on the server");
  const event = call("GET", "/api/local/tour/events/375").body;
  assert.equal(event.venue.id, SOTAVENTO);
  assert.equal(call("GET", "/api/local/tour/events/378").body.venue, null, "an event elsewhere has none");
  const { body } = await call("POST", "/api/local/ai-heats", { rider: "m:yentel-caers", event: 375 });
  const weekStart = fakeGame.weekStart(Date.parse("2026-10-21T12:00:00Z"));
  const expected = { seed: `event:375:week:${weekStart}`.length, knots: 19, gustKnots: 6 };
  assert.deepEqual(calls, [expected]);
  assert.deepEqual(body.conditions, expected);
  assert.equal(body.venue.id, SOTAVENTO);
  assert.equal(body.key, `2026-10-24|${weekStart}|m:yentel-caers|375|${catalog.version}|${SOTAVENTO}`, "the cache keeps venue heats apart");
});

test("without the venues mod, events name no venue and AI heats sail this week's solo wind", async (t) => {
  const { call, calls } = setup(t, ["challenge"]);
  assert.equal(call("GET", "/api/local/venues").status, 404);
  assert.ok(!("venue" in call("GET", "/api/local/tour/events/375").body));
  await call("POST", "/api/local/ai-heats", { rider: "m:yentel-caers", event: 375 });
  assert.deepEqual(calls, [fakeGame.weekConditions()]);
});

test("every catalog venue has a coast and a water look", () => {
  const ids = catalog.venues.map((v) => v.id).sort();
  assert.deepEqual(Object.keys(SITE_LAYOUTS).sort(), ids);
  assert.deepEqual(Object.keys(VENUE_LOOKS).sort(), ids);
});

// Where the local AI sailed in six heats (15–19 kt, targets 30–55): x from
// -20 to 79, z from -253 to 195 (the course is ±110 by ±210 m). Widened by 20 m.
const AI_WATER = { x: [-40, 100], z: [-275, 215] };
const inland = (id, x, z) => {
  const { rightX, rightZ, inX, inZ } = SITE_LAYOUTS[id].frame;
  return { s: rightX * x + rightZ * z, d: inX * x + inZ * z };
};

test("each beach lies beyond the course, and at least 30 m beyond the water AI riders sail", () => {
  for (const id of [SOTAVENTO, SYLT]) {
    for (const x of [-110, 110]) {
      for (const z of [-210, 210]) {
        const { s, d } = inland(id, x, z);
        assert.ok(shorelineAt(id, s) - d >= 80, `${id}: the course corner (${x}, ${z}) is within 80 m of the beach`);
      }
    }
    for (const x of AI_WATER.x) {
      for (const z of AI_WATER.z) {
        const { s, d } = inland(id, x, z);
        assert.ok(shorelineAt(id, s) - d >= 30, `${id}: AI water at (${x}, ${z}) is within 30 m of the beach`);
      }
    }
  }
});

test("Sotavento's sandbar crosses the course; the water shader gets each coast", () => {
  const { inX, inZ, shoreline, sandbar } = coastFor(SOTAVENTO);
  assert.ok(Math.abs(shoreline - sandbar) < 110, "the sandbar passes within the course");
  assert.equal(Math.hypot(inX, inZ).toFixed(6), "1.000000");
  assert.equal(coastFor("elsewhere"), null);
});

// A rider at (s, d) on the coast, heading inland at 8 m/s with the power on.
function riderAt(id, s, d, extra = {}) {
  const { rightX, rightZ, inX, inZ } = SITE_LAYOUTS[id].frame;
  return { x: rightX * s + inX * d, z: rightZ * s + inZ * d, vx: inX * 8, vz: inZ * 8, speed: 8, heading: Math.atan2(inX, -inZ), air: false, height: 0, ...extra };
}

test("the beach stops a rider sailing onto it, and open water doesn't touch one", () => {
  for (const id of [SOTAVENTO, SYLT]) {
    const shore = shorelineAt(id, 30);
    const state = riderAt(id, 30, shore + 3);
    const input = { power: 1 };
    resolveVenueCollision(state, input, id);
    const after = inland(id, state.x, state.z);
    assert.ok(Math.abs(after.d - (shore - 1.5)) < 1e-6, `${id}: put back at the water's edge`);
    assert.ok(Math.abs(SITE_LAYOUTS[id].frame.inX * state.vx + SITE_LAYOUTS[id].frame.inZ * state.vz) < 1e-9, `${id}: no speed inland`);
    assert.equal(input.power, 0);
    const open = riderAt(id, 0, 0);
    const before = { ...open };
    resolveVenueCollision(open, { power: 1 }, id);
    assert.deepEqual(open, before);
  }
});

test("a Sylt groyne stops a rider unless a jump clears it", () => {
  const along = (extra) => {
    const { rightX, rightZ } = SITE_LAYOUTS[SYLT].frame;
    const d = shorelineAt(SYLT, 140) - 10;
    return { ...riderAt(SYLT, 139, d, extra), vx: rightX * 8, vz: rightZ * 8 };
  };
  const blocked = along();
  resolveVenueCollision(blocked, { power: 1 }, SYLT);
  assert.ok(inland(SYLT, blocked.x, blocked.z).s <= 140 - 1.72 + 1e-6, "pushed back off the rocks");
  const jumping = along({ air: true, height: 1.2 });
  const before = { ...jumping };
  resolveVenueCollision(jumping, { power: 1 }, SYLT);
  assert.deepEqual(jumping, before);
});
