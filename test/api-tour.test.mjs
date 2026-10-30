import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { averageScore, heatTarget, seedOf } from "../lib/ai/score.mjs";
import { handleApi } from "../server/api/index.mjs";
import { indexEventWinds } from "../server/event-winds.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { loadVenueCatalog } from "../server/venues.mjs";
import { WEEK, fakeGame, tempDir, writeTour } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");

// A stand-in for the worker: scores its target, and counts the heats it sails.
function fakeSailer() {
  const calls = [];
  return {
    calls,
    async sail(conditions, target) {
      calls.push({ conditions, target });
      return { replay: { format: 1, steps: 10, events: "" }, score: target - 0.4, attempts: [], tricks: [{ tack: "port", label: "Culo", score: 8 }], steps: 10 };
    },
  };
}

function setup(t, { tour = true, ai = fakeSailer() } = {}) {
  const dir = tempDir(t);
  if (tour) writeTour(join(dir, "tour"));
  let now = NOW;
  const ctx = {
    store: createStore(join(dir, "db.json")),
    aiHeats: createStore(join(dir, "ai-heats.json"), { heats: {} }),
    game: fakeGame,
    now: () => now,
    tour: loadTour(join(dir, "tour")),
    ai,
    snapshot: "2026-10-24",
  };
  const call = (method, path, body) => handleApi({ method, path, query: new URLSearchParams(), body }, ctx);
  return { ctx, ai, call, setNow: (ms) => void (now = ms) };
}

test("seasons come newest first, each with its events in date order", (t) => {
  const { call } = setup(t);
  assert.deepEqual(call("GET", "/api/local/tour/seasons").body, [
    { season: 2025, events: [{ id: 375, name: "2025 Fuerteventura", start: "2025-07-18", divisions: ["men"] }, { id: 378, name: "2025 Sylt", start: "2025-09-26", divisions: ["men", "women"] }] },
    { season: 2024, events: [{ id: 300, name: "2024 Sylt", start: "2024-09-27", divisions: ["men"] }] },
  ]);
});

test("an event's riders come by division in place order, under pseudonyms only", (t) => {
  const { call } = setup(t);
  const { status, body } = call("GET", "/api/local/tour/events/378");
  assert.equal(status, 200);
  assert.deepEqual(body.divisions.men, [
    { rider: "m:yentel-caers", pseudonym: "Yenter Ceers", place: 1, average: Math.round(averageScore(1938) * 100) / 100 },
    { rider: "m:balz-muller", pseudonym: "Balt Möller", place: 9, average: Math.round(averageScore(1757) * 100) / 100 },
  ]);
  const text = JSON.stringify([body, call("GET", "/api/local/tour/seasons").body]);
  for (const real of ["Balz Müller", "Yentel Caers", "Sarah-Quita Offringa", "real m:"]) assert.ok(!text.includes(real), `${real} reached the browser`);
  assert.equal(call("GET", "/api/local/tour/events/999").status, 404);
});

test("without tour data the endpoints say how to build it", (t) => {
  const { call } = setup(t, { tour: false });
  const message = { error: "No tour data on this computer: run npm run tour-data." };
  assert.deepEqual(call("GET", "/api/local/tour/seasons"), { status: 404, body: message });
  assert.deepEqual(call("GET", "/api/local/tour/events/378"), { status: 404, body: message });
});

test("a store can start from another empty shape", (t) => {
  const store = createStore(join(tempDir(t), "ai-heats.json"), { heats: {} });
  assert.deepEqual(store.data, { heats: {} });
});

test("an AI heat sails this week's solo wind at the rider's seeded target, then comes from the cache", async (t) => {
  const { call, ai } = setup(t);
  const weekStart = fakeGame.weekStart(NOW);
  const { status, body } = await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 });
  assert.equal(status, 200);
  const target = Math.round(heatTarget(1757, seedOf("m:balz-muller", 378, weekStart)) * 100) / 100;
  assert.deepEqual(ai.calls, [{ conditions: fakeGame.weekConditions(weekStart), target }]);
  assert.deepEqual(
    { ...body, replay: undefined },
    { key: body.key, rider: "m:balz-muller", pseudonym: "Balt Möller", event: 378, eventName: "2025 Sylt", weekStart, conditions: fakeGame.weekConditions(weekStart), target, score: target - 0.4, tricks: [{ tack: "port", label: "Culo", score: 8 }], replay: undefined },
  );
  assert.match(body.key, new RegExp(`^2026-10-24\\|${weekStart}\\|m:balz-muller\\|378\\|[0-9a-f]{12}$`));
  assert.deepEqual((await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 })).body, body);
  assert.equal(ai.calls.length, 1, "the second request comes from the cache");
});

test("a new week sails the heat again", async (t) => {
  const { call, ai, setNow } = setup(t);
  await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 });
  setNow(NOW + WEEK);
  const { body } = await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 });
  assert.equal(ai.calls.length, 2);
  assert.equal(body.weekStart, fakeGame.weekStart(NOW + WEEK));
});

test("unknown events, riders who didn't sail there, and planner errors are reported", async (t) => {
  const { call } = setup(t, { ai: { sail: async () => { throw new Error("the planner fell over"); } } });
  assert.equal((await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 999 })).status, 404);
  assert.deepEqual(await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 375 }), { status: 404, body: { error: "m:balz-muller didn't sail at 2025 Fuerteventura." } });
  assert.deepEqual(await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 }), { status: 500, body: { error: "Couldn't plan the heat: the planner fell over" } });
});

test("without tour data an AI heat says how to build it too", async (t) => {
  const { call } = setup(t, { tour: false });
  assert.deepEqual(await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 }), { status: 404, body: { error: "No tour data on this computer: run npm run tour-data." } });
});

const REPORTED = { event: 378, slug: "e378", knots: 24, gustKnots: 4, reported: "24 kt and gusty on finals day", day: "2025-09-30", confidence: "reported", sources: [{ title: "2025 Sylt report", date: "2025-09-30", url: "https://example.test/report" }] };

// The fixture's events are all at "Somewhere"; `at` says where the venue is.
function venueSetup(t, { winds = [REPORTED], at = "Somewhere" } = {}) {
  const s = setup(t);
  const file = join(tempDir(t), "venues.json");
  writeFileSync(file, JSON.stringify({ version: 2, venues: [{ id: "sotavento-fuerteventura", name: "Sotavento, Fuerteventura", locations: [at], gameConditions: { knots: 19, gustKnots: 6 }, windZones: { gain: 4, from: 300, over: 120, lee: 3 } }] }));
  Object.assign(s.ctx, {
    mods: ["venues"],
    game: { ...fakeGame, roomConditions: (id) => ({ seed: id.length, knots: 15, gustKnots: 0 }) },
    venues: loadVenueCatalog(file),
    eventWinds: indexEventWinds({ version: 1, events: winds }),
  });
  return s;
}

test("an AI heat sails the event's reported wind, else its venue's usual wind, with the venue's zones", async (t) => {
  const { call, ai } = venueSetup(t);
  await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 });
  await call("POST", "/api/local/ai-heats", { rider: "m:yentel-caers", event: 375 });
  assert.deepEqual(ai.calls.map(({ conditions: c }) => [c.knots, c.gustKnots, c.zones?.gain]), [[24, 4, 4], [19, 6, 4]]);
});

test("an event with a reported wind at a venue we don't have sails that wind, without zones", async (t) => {
  const { call, ai } = venueSetup(t, { at: "Elsewhere" });
  await call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 });
  await call("POST", "/api/local/ai-heats", { rider: "m:yentel-caers", event: 375 });
  const weekStart = fakeGame.weekStart(NOW);
  assert.deepEqual(ai.calls[0].conditions, { seed: `event:378:week:${weekStart}`.length, knots: 24, gustKnots: 4 });
  assert.deepEqual(ai.calls[1].conditions, fakeGame.weekConditions(weekStart));
});

test("a changed wind sails the heat again; the same wind comes from the cache", async (t) => {
  const { call, ai, ctx } = venueSetup(t);
  const race = () => call("POST", "/api/local/ai-heats", { rider: "m:balz-muller", event: 378 });
  await race();
  await race();
  assert.equal(ai.calls.length, 1);
  ctx.eventWinds = indexEventWinds({ version: 1, events: [{ ...REPORTED, knots: 20 }] });
  await race();
  assert.equal(ai.calls.length, 2);
  assert.equal(ai.calls[1].conditions.knots, 20);
});

test("an event says where its wind comes from", (t) => {
  const { call } = venueSetup(t);
  assert.deepEqual(call("GET", "/api/local/tour/events/378").body.wind, { source: "reported", knots: 24, gustKnots: 4, reported: "24 kt and gusty on finals day", day: "2025-09-30", confidence: "reported", url: "https://example.test/report", title: "2025 Sylt report" });
  assert.deepEqual(call("GET", "/api/local/tour/events/375").body.wind, { source: "usual", knots: 19, gustKnots: 6 });
  const elsewhere = venueSetup(t, { winds: [], at: "Elsewhere" });
  assert.deepEqual(elsewhere.call("GET", "/api/local/tour/events/375").body.wind, { source: "week" });
});
