import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { createLobby } from "../server/lagoon/lobby.mjs";
import { createRelay } from "../server/lagoon/relay.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { DEFAULT_WIND, weekOf } from "../server/weekly.mjs";
import { fakeGame, tempDir, writeTour } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
// Room ids ending in a multiple of 3 have the default wind; the rest don't.
const roomConditions = (id) => (Number(id.split("-").at(-1)) % 3 ? { seed: 2, knots: 19, gustKnots: 5 } : { seed: 1, ...DEFAULT_WIND });
const attempt = (id, score) => ({ id, status: "landed", score, tack: "port", label: "Culo" });

function setup(t, { tour = true, ai } = {}) {
  const dir = tempDir(t);
  if (tour) writeTour(join(dir, "tour"));
  const store = createStore(join(dir, "db.json"));
  store.update((data) => void data.riders.push({ key: "k1", nickname: "Tester", appearance: { sail: "teal" } }));
  const calls = [];
  ai ??= {
    async sail(conditions, target) {
      calls.push(["sail", conditions, target]);
      return { replay: { format: 1, steps: 10, events: "" }, score: 30, attempts: [attempt(1, 30)], tricks: [], steps: 10 };
    },
    async poses(conditions, replay) {
      calls.push(["poses", conditions, replay]);
      return { poses: [{ x: 0 }], settledAt: { 1: 50 } };
    },
  };
  const game = { ...fakeGame, roomConditions };
  const lobby = createLobby({ now: () => NOW, score: (attempts) => fakeGame.heatTotals({ attempts }).total });
  const ctx = {
    store,
    game,
    now: () => NOW,
    tour: loadTour(join(dir, "tour")),
    ai,
    aiHeats: createStore(join(dir, "ai-heats.json"), { heats: {} }),
    weekly: createStore(join(dir, "weekly.json"), { weeks: {}, prize: null }),
    lobby,
    relay: createRelay({ lobby, now: () => NOW }),
    snapshot: "2026-10-24",
  };
  const call = (method, path, body = {}) => handleApi({ method, path, query: new URLSearchParams(), body, host: "localhost:5180" }, ctx);
  return { ctx, call, calls };
}

test("this week's super final names the event and each division's opponent, under pseudonyms", (t) => {
  const { ctx, call } = setup(t);
  const week = weekOf(ctx.tour, fakeGame.weekStart(NOW));
  const { status, body } = call("GET", "/api/local/weekly");
  assert.equal(status, 200);
  assert.deepEqual({ ...body, divisions: Object.keys(body.divisions) }, {
    weekStart: fakeGame.weekStart(NOW),
    event: { id: week.event.id, name: week.event.name, start: week.event.start, location: "Somewhere" },
    divisions: Object.keys(week.event.divisions),
    wind: DEFAULT_WIND,
    best: null,
    won: false,
    prize: false,
  });
  assert.ok(!JSON.stringify(body).includes("Yentel Caers") && !JSON.stringify(body).includes("Balz Müller"));
});

test("starting sails the winner's heat in a room with the default wind, offers the challenge, and reuses the heat", async (t) => {
  const { ctx, call, calls } = setup(t);
  const week = weekOf(ctx.tour, fakeGame.weekStart(NOW));
  const division = Object.keys(week.event.divisions)[0];
  const { status, body } = await call("POST", "/api/local/weekly/start", { division });
  assert.equal(status, 200);
  assert.deepEqual(body, { pseudonym: ctx.tour.riders.get(week.event.divisions[division].entries[0].rider).pseudonym, wind: DEFAULT_WIND });
  assert.deepEqual(calls.map(([kind, conditions]) => [kind, conditions]), [["sail", { seed: 1, ...DEFAULT_WIND }], ["poses", { seed: 1, ...DEFAULT_WIND }]]);
  const lobby = call("POST", "/api/lagoons", { playerKey: "k1" }).body;
  assert.deepEqual([lobby.challenges[0].senderName, lobby.challenges[0].recipientName], [body.pseudonym, "Tester"]);
  const room = call("POST", "/api/lagoons", { playerKey: "k1", action: "accept", challengeId: lobby.challenges[0].id }).body.room;
  assert.equal(room.id, `super-final-${week.event.id}-${NOW}-0`);
  await call("POST", "/api/local/weekly/start", { division });
  assert.deepEqual(calls.map(([kind]) => kind), ["sail", "poses", "poses"], "the second start reuses the sailed heat");
});

test("the 1v1 endpoints go to the lobby and relay: tickets, the AI's pose, and the old answers", (t) => {
  const { call } = setup(t);
  assert.deepEqual(call("POST", "/api/lagoons/lobby-connect").body, { relay: null });
  const { relay } = call("POST", "/api/lagoons/connect", { roomId: "r" }).body;
  assert.equal(relay.url, "ws://localhost:5180/__relay");
  assert.deepEqual(call("POST", "/api/lagoons/opponent", { roomId: "r" }).body, { opponent: null });
  assert.equal(call("POST", "/api/lagoons/signaling").status, 404);
  assert.deepEqual(call("POST", "/api/lagoons", { playerKey: "k1", action: "sync" }).body, { serverTime: NOW, room: null, riders: [], challenges: [], rankings: [] });
});

test("errors: no tour data, a division the event didn't have, and a planner failure", async (t) => {
  const noTour = setup(t, { tour: false });
  assert.equal(noTour.call("GET", "/api/local/weekly").status, 404);
  assert.equal((await noTour.call("POST", "/api/local/weekly/start", { division: "men" })).status, 404);
  const failing = setup(t, { ai: { sail: async () => { throw new Error("the planner fell over"); }, poses: async () => ({}) } });
  const week = weekOf(failing.ctx.tour, fakeGame.weekStart(NOW));
  assert.equal((await failing.call("POST", "/api/local/weekly/start", { division: "juniors" })).status, 404);
  const present = Object.keys(week.event.divisions)[0];
  const { status, body } = await failing.call("POST", "/api/local/weekly/start", { division: present });
  assert.equal(status, 500);
  assert.match(body.error, /^Couldn't get .+ ready: the planner fell over$/);
});
