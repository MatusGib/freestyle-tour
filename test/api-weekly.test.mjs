import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { HEAT_SECONDS, TIMES, createLobby } from "../server/lagoon/lobby.mjs";
import { createRelay } from "../server/lagoon/relay.mjs";
import { createStore } from "../server/store.mjs";
import { WIND, recordRoom, weekOf } from "../server/weekly.mjs";
import { fakeGame, tempDir } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const CHAMPION = {
  rider: "m:lennart-neubauer",
  name: "Lennart Neubauer",
  rating: 1946,
  target: 45.5,
  events: ["2023-sylt", "2025-sylt"].map((id) => ({ id, name: `${id} event`, when: "September 2025", place: "Westerland, Sylt, Germany", podium: ["Lennart Neubauer", "Yentel Caers", "Jacopo Testa"], story: `What happened at ${id}.` })),
};
// Room ids ending in a multiple of 3 have the champion's gusts; the rest don't.
// Each id's number is its seed, so each room's wind is its own. (The game's
// own knots don't matter: the champion's rooms get 21 kt.)
const roomConditions = (id) => {
  const n = Number(id.split("-").at(-1));
  return n % 3 ? { seed: n, knots: 15, gustKnots: 0 } : { seed: n, knots: 17, gustKnots: 6 };
};
const attempt = (id, score) => ({ id, status: "landed", score, tack: "port", label: "Culo" });
const settle = () => new Promise((resolve) => setImmediate(resolve));

// A stand-in for the AI riders. holdNext() makes the next sail wait until the
// function it returns is called.
function fakeAi() {
  const calls = [];
  let hold = null;
  return {
    calls,
    holdNext() {
      let release;
      hold = new Promise((resolve) => (release = resolve));
      return release;
    },
    async sail(conditions, target) {
      calls.push(["sail", conditions.seed, conditions.knots, target]);
      const wait = hold;
      hold = null;
      await wait;
      return { replay: { format: 1, steps: 10, events: "" }, score: 30, attempts: [attempt(1, 30)], tricks: [], steps: 10 };
    },
    async poses(conditions) {
      calls.push(["poses", conditions.seed]);
      return { poses: [{ x: 0 }], settledAt: { 1: 50 } };
    },
  };
}

function setup(t, { ai = fakeAi(), rooms = roomConditions } = {}) {
  const dir = tempDir(t);
  const store = createStore(join(dir, "db.json"));
  store.update((data) => void data.riders.push({ key: "k1", nickname: "Tester", appearance: { sail: "teal" } }));
  let time = NOW;
  const now = () => time;
  // Wired as server/app.mjs wires it.
  const weekly = createStore(join(dir, "champion.json"), { weeks: {}, prize: null });
  const lobby = createLobby({ now, score: (attempts) => fakeGame.heatTotals({ attempts }).total, onResult: (room) => recordRoom(weekly, room, now()) });
  const logs = [];
  const ctx = { store, game: { ...fakeGame, roomConditions: rooms }, now, ai, weekly, lobby, relay: createRelay({ lobby, now }), champion: CHAMPION, log: (line) => logs.push(line), snapshot: "2026-10-24" };
  const call = (method, path, body = {}) => handleApi({ method, path, query: new URLSearchParams(), body, host: "localhost:5180" }, ctx);
  const poll = (body = {}) => call("POST", "/api/lagoons", { playerKey: "k1", ...body }).body;
  return { ctx, call, poll, ai, logs, later: (ms) => void (time += ms) };
}

test("this week's challenge names the event, its story and podium, and the champion, under real names", (t) => {
  const { call } = setup(t);
  const week = weekOf(CHAMPION, fakeGame.weekStart(NOW));
  const { status, body } = call("GET", "/api/local/weekly");
  assert.equal(status, 200);
  assert.deepEqual(body, {
    weekStart: fakeGame.weekStart(NOW),
    event: { id: week.event.id, name: week.event.name, when: week.event.when, place: week.event.place, podium: week.event.podium },
    story: week.event.story,
    opponent: { name: "Lennart Neubauer", target: 45.5 },
    wind: WIND,
    best: null,
    won: false,
    lastWin: null,
    prize: false,
  });
});

test("starting sails the champion's heat for the first room and offers his challenge; taking the room starts sailing the next", async (t) => {
  const { call, poll, ai } = setup(t);
  const week = weekOf(CHAMPION, fakeGame.weekStart(NOW));
  const { status, body } = await call("POST", "/api/local/weekly/start");
  assert.equal(status, 200);
  assert.deepEqual(body, { name: "Lennart Neubauer", wind: WIND });
  assert.deepEqual(ai.calls, [["sail", 0, 21, 45.5], ["poses", 0]], "sailed in the champion's 21 kt");
  const { challenges } = poll();
  assert.deepEqual([challenges[0].senderName, challenges[0].recipientName], ["Lennart Neubauer", "Tester"]);
  const { room } = poll({ action: "accept", challengeId: challenges[0].id });
  assert.equal(room.id, `champion-${week.event.id}-${NOW}-0`);
  await settle();
  assert.deepEqual(ai.calls.slice(2), [["sail", 3, 21, 45.5], ["poses", 3]], "the next room gets its own heat, in its own wind");
});

test("challenging again waits for the next room's heat, then opens it", async (t) => {
  const { call, poll, ai, later } = setup(t);
  const week = weekOf(CHAMPION, fakeGame.weekStart(NOW));
  await call("POST", "/api/local/weekly/start");
  const release = ai.holdNext();
  const first = poll({ action: "accept", challengeId: poll().challenges[0].id }).room;
  later(TIMES.racingAfter + TIMES.countdown + HEAT_SECONDS * 1000);
  poll({ action: "finish", roomId: first.id, attempts: [attempt(9, 10)] });
  const waiting = poll({ action: "challenge", challengeId: "c2", riderId: "m:lennart-neubauer" });
  assert.deepEqual([waiting.challenges[0].status, waiting.room.id], ["pending", first.id], "the old room stays until the new one opens");
  release();
  await settle();
  const ready = poll();
  assert.deepEqual([ready.challenges[0].status, ready.room.id, ready.room.status], ["accepted", `champion-${week.event.id}-${NOW}-3`, "pending"]);
});

test("a win is recorded with both scores, as your last win, and earns the prize", async (t) => {
  const { call, poll, later } = setup(t);
  await call("POST", "/api/local/weekly/start");
  const room = poll({ action: "accept", challengeId: poll().challenges[0].id }).room;
  later(TIMES.racingAfter + TIMES.countdown + HEAT_SECONDS * 1000);
  assert.equal(poll({ action: "finish", roomId: room.id, attempts: [attempt(9, 31)] }).room.outcome, "1");
  const info = call("GET", "/api/local/weekly").body;
  assert.deepEqual([info.best, info.won, info.prize], [31, true, true]);
  assert.deepEqual(info.lastWin, { at: NOW + TIMES.racingAfter + TIMES.countdown + HEAT_SECONDS * 1000, event: info.event.id, score: 31, opponentScore: 30 });
});

test("the 1v1 endpoints go to the lobby and relay: tickets, the AI's pose, and the old answers", (t) => {
  const { call } = setup(t);
  assert.deepEqual(call("POST", "/api/lagoons/lobby-connect").body, { relay: null });
  assert.equal(call("POST", "/api/lagoons/connect", { roomId: "r" }).body.relay.url, "ws://localhost:5180/__relay");
  assert.deepEqual(call("POST", "/api/lagoons/opponent", { roomId: "r" }).body, { opponent: null });
  assert.equal(call("POST", "/api/lagoons/signaling").status, 404);
  assert.deepEqual(call("POST", "/api/lagoons", { playerKey: "k1", action: "sync" }).body, { serverTime: NOW, room: null, riders: [], challenges: [], rankings: [] });
});

test("errors: a planner failure, and no room with the champion's gusts", async (t) => {
  const failing = setup(t, { ai: { sail: async () => { throw new Error("the planner fell over"); }, poses: async () => ({}) } });
  const { status, body } = await failing.call("POST", "/api/local/weekly/start");
  assert.deepEqual([status, body.error], [500, "Couldn't get Lennart Neubauer ready: the planner fell over"]);
  const windless = setup(t, { rooms: (id) => ({ seed: 1, knots: 15, gustKnots: 0 }) });
  const none = await windless.call("POST", "/api/local/weekly/start");
  assert.deepEqual([none.status, none.body.error], [500, "Couldn't get Lennart Neubauer ready: no room id gives gusts of 6"]);
});
