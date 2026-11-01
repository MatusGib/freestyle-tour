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
import { indexVenueCatalog, loadVenueCatalog, publicVenue, venueForLocation } from "../server/venues.mjs";
import { SITE_LAYOUTS, coastFor, shorelineAt } from "../mods/venues/coast.js";
import { resolveVenueCollision } from "../mods/venues/scenery.js";
import { rememberPlannedHeat, takePlannedHeat, takePlannedHeatFor, venueConditions } from "../mods/venues/venue.js";
import { VENUE_LOOKS, applyVenueLook } from "../mods/venues/water.js";
import { setKnots, setSea, setSpotWater, shoreOffset, spotLee, venueWater, windSea } from "../mods/venues/waves.js";
import { zoneKnots, zonesFor } from "../mods/venues/zones.js";
import { heatConditions, startHeat } from "../server/api/heats.mjs";
import { ROOT, fakeGame, tempDir, writeTour } from "./helpers.mjs";

const catalog = loadVenueCatalog(join(ROOT, "tour", "venues.json"));
const SOTAVENTO = "sotavento-fuerteventura";
const SYLT = "westerland-sylt";
const SOROBON = "sorobon-bonaire";
const PRASONISI = "prasonisi-rhodes";

test("the tour's events at Sotavento, Sylt, Pozo and Bonaire find their venue, and no other event does", () => {
  const tour = loadTour(join(ROOT, "tour"));
  const matched = {};
  for (const event of tour.events.values()) {
    const venue = venueForLocation(catalog, event.location);
    if (venue) matched[event.location] = venue.id;
  }
  assert.deepEqual(matched, {
    "Sotavento, Fuerteventura": SOTAVENTO,
    "Westerland, Sylt, Germany": SYLT,
    "Pozo Izquierdo, Gran Canaria": "pozo-izquierdo-gran-canaria",
    "Sorbon Beach, Bonaire, Dutch Netherlands Antilles": "sorobon-bonaire",
  });
  assert.equal(venueForLocation(catalog, "sotavento  FUERTEVENTURA")?.id, SOTAVENTO, "spelling and spacing don't matter");
  assert.equal(venueForLocation(catalog, "Neusiedler See, Podersdorf, Austria"), null, "Prasonisi took Podersdorf's place; its events sail in their reported wind");
  assert.equal(venueForLocation(catalog, "Las Chucharas, Costa Teguise, Lanzarote, Canary Islands"), null);
});

test("every venue's usual wind is sourced", () => {
  for (const venue of catalog.venues) assert.ok(venue.sources?.some((s) => s.url && (s.date || s.accessed)), `${venue.id} has no source`);
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
  refused([venue("a", ["A"], { knots: 29, gustKnots: 4 })]);
  refused([venue("a", ["A"], { knots: 11, gustKnots: 4 })]);
  refused([venue("a", ["A"], { knots: 17, gustKnots: 1 })]);
  refused([venue("a", ["A"]), venue("a", ["B"])]);
  refused([venue("a", ["A"]), venue("b", ["a"])]);
  refused([{ ...venue("a", ["A"]), windZones: { gain: 12, from: 300, over: 120, lee: 0 } }]);
});

test("a venue's usual wind can be anything the game's practice takes, 12–28 kt", (t) => {
  const file = join(tempDir(t), "venues.json");
  const venue = (id, knots) => ({ id, name: id, locations: [id], gameConditions: { knots, gustKnots: 0 } });
  writeFileSync(file, JSON.stringify({ version: 2, venues: [venue("light", 12), venue("strong", 28)] }));
  assert.deepEqual(loadVenueCatalog(file).venues.map((v) => v.gameConditions.knots), [12, 28]);
});

test("a refused venue names its field, so the developer panel can show the reason there", () => {
  const venue = { id: "a", name: "A", locations: ["A"], gameConditions: { knots: 17, gustKnots: 4 }, windZones: { gain: 4, from: 300, over: 120, lee: 3 } };
  const refused = (change, path) => assert.throws(() => indexVenueCatalog({ version: 2, venues: [{ ...venue, ...change }] }), { path });
  refused({ gameConditions: { knots: 30, gustKnots: 4 } }, "venues.a.gameConditions.knots");
  refused({ gameConditions: { knots: 17, gustKnots: 1 } }, "venues.a.gameConditions.gustKnots");
  refused({ windZones: { ...venue.windZones, lee: 9 } }, "venues.a.windZones.lee");
  refused({ windZones: { ...venue.windZones, over: 0 } }, "venues.a.windZones.over");
  assert.equal(indexVenueCatalog({ version: 2, venues: [venue] }).byId.get("a"), venue);
});

test("venues with a coast or a real-world spot's files have scenery, and a picture of it", () => {
  const venue = (id) => publicVenue({ id, name: id, locations: [], gameConditions: { knots: 17, gustKnots: 0 } });
  assert.deepEqual([venue(SYLT).scenery, venue(SYLT).spotFiles, venue(SYLT).picture], [true, false, `/__mods/venues/assets/${SYLT}.svg`]);
  assert.deepEqual([venue(SOROBON).scenery, venue(SOROBON).spotFiles, venue(SOROBON).picture], [true, true, `/__mods/venues/spots/${SOROBON}/picture.png`]);
  assert.deepEqual([venue(PRASONISI).scenery, venue(PRASONISI).spotFiles, venue(PRASONISI).picture], [true, true, `/__mods/venues/spots/${PRASONISI}/picture.png`]);
  const pozo = venue("pozo-izquierdo-gran-canaria");
  assert.deepEqual([pozo.scenery, pozo.spotFiles, pozo.picture], [false, false, null]);
});

test("a venue heat keeps the room's seed and takes the venue's wind", () => {
  const room = (id) => ({ seed: id.length, knots: 15, gustKnots: 0 });
  assert.deepEqual(venueConditions(room, { gameConditions: { knots: 19, gustKnots: 6 } }, "event:375"), { seed: 9, knots: 19, gustKnots: 6 });
});

const ZONED = { id: SOTAVENTO, gameConditions: { knots: 19, gustKnots: 6 }, windZones: { gain: 4, from: 300, over: 120, lee: 3 } };

test("the calm strip by the beach never takes the wind under 12 kt", () => {
  const coast = coastFor(SOTAVENTO);
  assert.equal(zonesFor(ZONED.windZones, coast, 19).lee, 3);
  assert.equal(zonesFor(ZONED.windZones, coast, 13).lee, 1);
  assert.equal(zonesFor(ZONED.windZones, coast, 12).lee, 0);
  assert.equal(zonesFor(ZONED.windZones, coast, 28).gain, 4, "no cap on top: 32 kt is under the game's own 34 kt gusts");
  assert.equal(zonesFor(ZONED.windZones, coast).lee, 3, "without a wind the lee stays");
});

test("an event's wind replaces the venue's usual one, with the venue's zones", () => {
  const room = () => ({ seed: 5, knots: 16, gustKnots: 0 });
  const pick = ({ seed, knots, gustKnots, zones }) => ({ seed, knots, gustKnots, lee: zones.lee });
  assert.deepEqual(pick(venueConditions(room, ZONED, "r")), { seed: 5, knots: 19, gustKnots: 6, lee: 3 });
  assert.deepEqual(pick(venueConditions(room, ZONED, "r", { knots: 12, gustKnots: 0 })), { seed: 5, knots: 12, gustKnots: 0, lee: 0 });
});

test("a planned challenge heat is taken once", () => {
  const conditions = { seed: 3, knots: 19, gustKnots: 6 };
  rememberPlannedHeat({ conditions, venue: { id: SOTAVENTO } });
  assert.deepEqual(takePlannedHeat(), { conditions, venue: { id: SOTAVENTO } });
  assert.equal(takePlannedHeat(), null);
});

test("a planned challenge heat waits through practice, such as the game's tutorial, for the next solo heat", () => {
  const conditions = { seed: 3, knots: 23, gustKnots: 6 };
  rememberPlannedHeat({ conditions, venue: { id: SYLT } });
  assert.equal(takePlannedHeatFor(false), null, "a practice start leaves it waiting");
  assert.deepEqual(takePlannedHeatFor(true), { conditions, venue: { id: SYLT } }, "the solo heat takes it");
  assert.equal(takePlannedHeatFor(true), null, "once");
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
  assert.deepEqual(venues.venues.map((v) => v.id), [SOTAVENTO, SYLT, PRASONISI, "pozo-izquierdo-gran-canaria", SOROBON]);
  assert.ok(venues.venues.every((v) => !("locations" in v)), "the location spellings stay on the server");
  const event = call("GET", "/api/local/tour/events/375").body;
  assert.equal(event.venue.id, SOTAVENTO);
  assert.equal(call("GET", "/api/local/tour/events/378").body.venue, null, "an event elsewhere has none");
  const { body } = await call("POST", "/api/local/ai-heats", { rider: "m:yentel-caers", event: 375 });
  const weekStart = fakeGame.weekStart(Date.parse("2026-10-21T12:00:00Z"));
  const { zones, ...wind } = calls[0];
  assert.deepEqual(wind, { seed: `event:375:week:${weekStart}`.length, knots: 19, gustKnots: 6 });
  assert.deepEqual({ gain: zones.gain, from: zones.from, over: zones.over, lee: zones.lee }, { gain: 4, from: 300, over: 120, lee: 3 }, "the AI sails in Sotavento's wind zones");
  assert.deepEqual(body.conditions, calls[0], "and the player gets the same conditions");
  assert.equal(body.venue.id, SOTAVENTO);
  assert.match(body.key, new RegExp(`^2026-10-24\\|${weekStart}\\|m:yentel-caers\\|375\\|[0-9a-f]{12}$`), "the key ends in a hash of the conditions, so venue heats are kept apart");
});

test("without the venues mod, events name no venue and AI heats sail this week's solo wind", async (t) => {
  const { call, calls } = setup(t, ["challenge"]);
  assert.equal(call("GET", "/api/local/venues").status, 404);
  assert.ok(!("venue" in call("GET", "/api/local/tour/events/375").body));
  await call("POST", "/api/local/ai-heats", { rider: "m:yentel-caers", event: 375 });
  assert.deepEqual(calls, [fakeGame.weekConditions()]);
});

test("every venue with a coast, Sorobon and Prasonisi, is in the catalog and has a water look", () => {
  const ids = catalog.venues.map((v) => v.id);
  for (const id of Object.keys(SITE_LAYOUTS)) assert.ok(ids.includes(id), `${id} isn't in the catalog`);
  assert.ok(ids.includes(SOROBON) && ids.includes(PRASONISI));
  assert.deepEqual(Object.keys(VENUE_LOOKS).sort(), [...Object.keys(SITE_LAYOUTS), SOROBON, PRASONISI].sort());
});

// The water's uniforms and the sky as the patches give them, any name a
// { value } holder.
const fakeLookGame = () => ({ water: { uniforms: new Proxy({}, { get: (all, name) => (all[name] ??= { value: null }) }) }, scene: { getObjectByName: () => null } });
// A spot's water map over ±100 m, 10 px: deep sea (20 m) for x < 0, a 1 m
// lagoon for x > 0, land in the last column; reef and shore far except there;
// fetch, the A byte: 255 (no land upwind) unless given.
function fakeSpotWater(fetch = 255) {
  const size = 10, data = new Uint8Array(size * size * 4).fill(255);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = (j * size + i) * 4;
    data[k] = i < 5 ? 255 : 13;
    data[k + 2] = i === size - 1 ? 0 : i === size - 2 ? 32 : 255;
    data[k + 3] = fetch;
  }
  return { texture: { isTexture: true }, colour: { isTexture: true }, data, size, half: 100, depthMax: 20, distanceMax: 80, floor: 0.8, fetchMax: 5000 };
}

test("the water reads a spot's depth map only at a real-world spot", (t) => {
  t.after(() => { setSpotWater(null); setSea(null); });
  const game = fakeLookGame(), spotWater = fakeSpotWater();
  applyVenueLook(game, catalog.byId.get(SOROBON), spotWater);
  assert.equal(game.water.uniforms.uSpotBox.value[1], 1);
  assert.equal(game.water.uniforms.uSpotWater.value, spotWater.texture);
  assert.equal(game.water.uniforms.uSpotColour.value, spotWater.colour, "the satellite's pattern of the floor");
  assert.ok(game.water.uniforms.uCaustics.value > 0 && game.water.uniforms.uMarks.value < 1, "sunlight on the shallow floor, fewer stylised crest marks");
  applyVenueLook(game, catalog.byId.get(SOTAVENTO), spotWater);
  assert.equal(game.water.uniforms.uSpotBox.value[1], 0, "an analytic coast keeps its own shallows");
  assert.deepEqual([game.water.uniforms.uSpotColour.value, game.water.uniforms.uCaustics.value, game.water.uniforms.uMarks.value], [null, 0, 1], "and its look");
  applyVenueLook(game, null);
  assert.equal(game.water.uniforms.uSpotBox.value[1], 0);
});

test("at a spot, waves are much smaller in the lagoon than on the open sea, and die at the shore", (t) => {
  t.after(() => { setSpotWater(null); setSea(null); });
  const spotWater = fakeSpotWater();
  applyVenueLook(fakeLookGame(), catalog.byId.get(SOROBON), spotWater);
  setKnots(20);
  const range = (x) => {
    let low = Infinity, high = -Infinity;
    for (let s = 0; s < 40; s += .25) { const h = venueWater(x, 0, s, 0); low = Math.min(low, h); high = Math.max(high, h); }
    return high - low;
  };
  const lagoon = range(30), sea = range(-60), land = range(95);
  setSpotWater(null);
  assert.ok(lagoon < range(30) / 4, `lagoon ${lagoon}, the same place with no reef ${range(30)}`);
  assert.ok(Math.abs(sea - range(-60)) < 1e-9, "the open sea keeps all its waves");
  assert.ok(sea > .3);
  assert.equal(land, 0, "on land, none");
});

test("at a spot, water in the lee of land gets no swell and only the chop of its short fetch", (t) => {
  t.after(() => { setSpotWater(null); setSea(null); });
  const venue = catalog.byId.get(PRASONISI), game = fakeLookGame();
  applyVenueLook(game, venue, fakeSpotWater(10));
  assert.deepEqual(game.water.uniforms.uSpotFetch.value, [5000, VENUE_LOOKS[PRASONISI].fetch]);
  setKnots(22);
  const range = () => {
    let low = Infinity, high = -Infinity;
    for (let s = 0; s < 40; s += .25) { const h = venueWater(-60, 0, s, 0); low = Math.min(low, h); high = Math.max(high, h); }
    return high - low;
  };
  const lee = range();
  applyVenueLook(game, venue, fakeSpotWater(255));
  const open = range();
  assert.ok(open > .5, `the open Aegean, ${open}`);
  assert.ok(lee < open / 5, `about 200 m behind land ${lee}, open ${open}`);
  assert.deepEqual(spotLee(-60, 0, fakeSpotWater(255)), [1, 1], "no land upwind: the open sea");
  const [wind, swell] = spotLee(-60, 0, fakeSpotWater(10));
  assert.ok(wind > 0 && wind < .15 && swell === 0, `${wind}, ${swell}`);
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

test("wind waves grow with the wind and the fetch, as JONSWAP gives them, up to a fully developed sea", () => {
  const sylt = windSea(17, 60000);
  assert.ok(Math.abs(sylt.height - 1.09) < .02 && Math.abs(sylt.length - 39.6) < .5, JSON.stringify(sylt));
  assert.ok(windSea(25, 40000).height > windSea(15, 40000).height);
  const ocean = windSea(20, 1e9);
  assert.ok(Math.abs(ocean.height - .22 * (20 * .5144) ** 2 / 9.81) < 1e-9, "capped at Hs = 0.22 U²/g");
});

// The sea water.js gives a venue's waves.
function seaAt(id) {
  const look = VENUE_LOOKS[id], coast = coastFor(id);
  setSea({ fetch: look.fetch, swell: look.swell, inX: coast.inX, inZ: coast.inZ, shoreline: coast.shoreline, curve: coast.curve, bar: [coast.sandbar, look.barWidth, look.shallowWidth, look.shelter], surf: look.surf });
  return coast;
}

test("without a venue the game's own waves are unchanged", () => {
  setSea(null);
  setKnots(19);
  assert.equal(venueWater(12, -40, 3.5, .27), .27);
});

test("on each beach the water stays below the sand, whatever the waves do", () => {
  for (const id of [SOTAVENTO, SYLT]) {
    const { inX, inZ } = seaAt(id);
    setKnots(25);
    const top = id === SYLT ? .16 : .12;
    for (let s = -600; s <= 600; s += 37) {
      for (const inland of [0, 3, 20]) {
        // Find the curved shoreline at s, then step inland from it.
        let x = -inZ * s + inX * 300, z = inX * s + inZ * 300;
        const off = shoreOffset(x, z);
        x += inX * (off + inland);
        z += inZ * (off + inland);
        for (let t = 0; t < 30; t += .7) {
          assert.ok(venueWater(x, z, t, .38) < top, `${id}: water above the sand at s ${s}, ${inland} m inland`);
        }
      }
    }
  }
  setSea(null);
});

test("Sotavento's lagoon stays calm and Sylt's open sea doesn't", () => {
  const range = (id, off) => {
    const { inX, inZ, shoreline } = seaAt(id);
    const x = inX * (shoreline - off), z = inZ * (shoreline - off);
    let low = Infinity, high = -Infinity;
    for (let t = 0; t < 40; t += .25) {
      const h = venueWater(x, z, t, 0);
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
    return high - low;
  };
  setKnots(19);
  assert.ok(range(SOTAVENTO, 150) < range(SOTAVENTO, 400) / 2.5, "inside the sandbar the waves are much smaller");
  setKnots(17);
  assert.ok(range(SYLT, 150) > 1, "Sylt's sea is over a metre from trough to crest");
  setSea(null);
});

test("Sotavento's wind is lighter by the beach and stronger over the outer half of the heat", () => {
  const { zones } = venueConditions(() => ({ seed: 1, knots: 15, gustKnots: 0 }), catalog.byId.get(SOTAVENTO), "room");
  const { inX, inZ, shoreline } = coastFor(SOTAVENTO);
  const at = (off) => zoneKnots(zones, inX * (shoreline - off), inZ * (shoreline - off));
  assert.ok(at(20) < -2.5, `${at(20)} near the beach`);
  assert.ok(Math.abs(at(shoreline)) < .5, `${at(shoreline)} at the course centre`);
  assert.ok(at(shoreline + 220) > 3.9, `${at(shoreline + 220)} at the course's outer edge`);
  assert.equal(zoneKnots(undefined, 0, 0), 0, "a heat without zones is the game's own wind");
});

test("a solo heat stores the wind it is sailed in, if the game can sail it, or else this week's", (t) => {
  const store = createStore(join(tempDir(t), "db.json"));
  store.update((d) => void d.riders.push({ key: "k", nickname: "rider" }));
  const { zones } = venueConditions(() => ({ seed: 7, knots: 15, gustKnots: 0 }), catalog.byId.get(SYLT), "room");
  const venue = { seed: 7, knots: 17, gustKnots: 4, zones };
  const stored = (conditions) => {
    const { heatId } = startHeat({ playerKey: "k", conditions }, store, fakeGame, Date.parse("2026-10-21T12:00:00Z")).body;
    return store.data.heats.find((h) => h.heatId === heatId).conditions;
  };
  assert.deepEqual(stored(venue), venue);
  assert.deepEqual(stored(undefined), fakeGame.weekConditions());
  for (const bad of [{ ...venue, knots: 40 }, { ...venue, seed: "x" }, { ...venue, zones: { ...zones, gain: "much" } }, { ...venue, zones: { ...zones, curve: [1] } }]) {
    assert.deepEqual(stored(bad), fakeGame.weekConditions());
  }
  assert.deepEqual(heatConditions({ ...venue, extra: 1, zones: { ...zones, extra: 2 } }), venue, "only the fields the engine reads are kept");
});
