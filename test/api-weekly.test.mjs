import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { HEAT_SECONDS, TIMES, createLobby } from "../server/lagoon/lobby.mjs";
import { createRelay } from "../server/lagoon/relay.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { DEFAULT_WIND, recordRoom, weekOf } from "../server/weekly.mjs";
import { fakeGame, tempDir, writeTour } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
// Room ids ending in a multiple of 3 have the default wind; the rest don't.
const roomConditions = (id) => (Number(id.split("-").at(-1)) % 3 ? { seed: 2, knots: 19, gustKnots: 5 } : { seed: 1, ...DEFAULT_WIND });
const attempt = (id, score) => ({ id, status: "landed", score, tack: "port", label: "Culo" });

function setup(t, { tour = true, ai, rooms = roomConditions } = {}) {
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
  const game = { ...fakeGame, roomConditions: rooms };
  let time = NOW;
  const now = () => time;
  // Wired as server/app.mjs wires it.
  const weekly = createStore(join(dir, "weekly.json"), { weeks: {}, prize: null });
  const lobby = createLobby({ now, score: (attempts) => fakeGame.heatTotals({ attempts }).total, onResult: (room) => recordRoom(weekly, room, now()) });
  const ctx = {
    store,
    game,
    now,
    tour: loadTour(join(dir, "tour")),
    ai,
    aiHeats: createStore(join(dir, "ai-heats.json"), { heats: {} }),
    weekly,
    lobby,
    relay: createRelay({ lobby, now }),
    snapshot: "2026-10-24",
  };
  const call = (method, path, body = {}) => handleApi({ method, path, query: new URLSearchParams(), body, host: "localhost:5180" }, ctx);
  return { ctx, call, calls, later: (ms) => void (time += ms) };
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
  week.event.name += " ******";
  assert.equal(call("GET", "/api/local/weekly").body.event.name, week.event.name.replace(" ******", ""), "the PWA's star rating isn't part of the name");
});

test("starting sails the winner's heat in a room with the default wind, offers the challenge, and reuses the heat", async (t) => {
  const { ctx, call, calls, later } = setup(t);
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
  later(60 * 60 * 1000);
  await call("POST", "/api/local/weekly/start", { division });
  assert.deepEqual(calls.map(([kind]) => kind), ["sail", "poses", "poses"], "a retry later in the week reuses the sailed heat");
  const retry = call("POST", "/api/lagoons", { playerKey: "k1" }).body.challenges[0];
  assert.equal(call("POST", "/api/lagoons", { playerKey: "k1", action: "accept", challengeId: retry.id }).body.room.id, `super-final-${week.event.id}-${NOW + 60 * 60 * 1000}-0`, "in a room never used before");
});

test("a win is recorded for the week and earns the prize", async (t) => {
  const { ctx, call, later } = setup(t);
  const division = Object.keys(weekOf(ctx.tour, fakeGame.weekStart(NOW)).event.divisions)[0];
  await call("POST", "/api/local/weekly/start", { division });
  const challenge = call("POST", "/api/lagoons", { playerKey: "k1" }).body.challenges[0];
  const room = call("POST", "/api/lagoons", { playerKey: "k1", action: "accept", challengeId: challenge.id }).body.room;
  later(TIMES.racingAfter + TIMES.countdown + HEAT_SECONDS * 1000);
  const done = call("POST", "/api/lagoons", { playerKey: "k1", action: "finish", roomId: room.id, attempts: [attempt(9, 31)] }).body.room;
  assert.equal(done.outcome, "1");
  const info = call("GET", "/api/local/weekly").body;
  assert.deepEqual([info.best, info.won, info.prize], [31, true, true]);
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

test("errors: no tour data, a division the event didn't have, a planner failure, and no room with the wind", async (t) => {
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
  const windless = setup(t, { rooms: () => ({ seed: 2, knots: 19, gustKnots: 5 }) });
  const none = await windless.call("POST", "/api/local/weekly/start", { division: present });
  assert.equal(none.status, 500);
  assert.match(none.body.error, /^Couldn't get .+ ready: no room id gives 17 kt with gusts of 0$/);
});
