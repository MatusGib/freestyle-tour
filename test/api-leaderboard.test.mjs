import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { startHeat } from "../server/api/heats.mjs";
import { board, submitHeat } from "../server/api/leaderboard.mjs";
import { rider } from "../server/api/rider.mjs";
import { createStore } from "../server/store.mjs";
import { WEEK, fakeGame, tempDir } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const landed = (tack, label, score) => ({ tack, label, score, status: "landed" });
const TWO_MOVES = [landed("port", "Culo", 8.5), landed("starboard", "Spock", 7.25)];

function setup(t) {
  const store = createStore(join(tempDir(t), "db.json"));
  const { profile } = rider({ action: "create", nickname: "Tester", appearance: { sail: "teal" } }, store).body;
  return { store, key: profile.key };
}

function playHeat(store, key, attempts, at) {
  const { heatId } = startHeat({ playerKey: key, scoringVersion: 2 }, store, fakeGame, at).body;
  return { heatId, res: submitHeat({ heatId, playerKey: key, attempts, replay: { format: 1, data: "abc" } }, store, fakeGame, at + 1000) };
}

test("registering a heat needs a known rider and returns its week", (t) => {
  const { store, key } = setup(t);
  assert.equal(startHeat({ playerKey: "missing" }, store, fakeGame, NOW).status, 401);
  const { status, body } = startHeat({ playerKey: key, scoringVersion: 2 }, store, fakeGame, NOW);
  assert.equal(status, 200);
  assert.match(body.heatId, UUID_V4);
  assert.equal(body.weekStart, fakeGame.weekStart(NOW));
});

test("submitting a heat scores it, keeps its replay and ranks it for the week", (t) => {
  const { store, key } = setup(t);
  const { res } = playHeat(store, key, TWO_MOVES, NOW);
  assert.deepEqual(res, { status: 200, body: { best: 15.75, weekly: { rank: 1, best: 15.75 } } });
  assert.deepEqual(store.data.heats[0].replay, { format: 1, data: "abc" });
  assert.equal(store.data.heats[0].score, 15.75);
});

test("a heat can be submitted once, and only if it was started here", (t) => {
  const { store, key } = setup(t);
  const { heatId } = playHeat(store, key, TWO_MOVES, NOW);
  assert.equal(submitHeat({ heatId, playerKey: key, attempts: TWO_MOVES }, store, fakeGame, NOW).status, 410);
  assert.equal(submitHeat({ heatId: "nope", playerKey: key, attempts: [] }, store, fakeGame, NOW).status, 404);
});

test("a heat without a scoring move is saved but not ranked", (t) => {
  const { store, key } = setup(t);
  const { res } = playHeat(store, key, [], NOW);
  assert.deepEqual(res.body, { best: 0 });
});

test("the board shows the week, its wind and each rider's best heat", (t) => {
  const { store, key } = setup(t);
  playHeat(store, key, TWO_MOVES, NOW);
  playHeat(store, key, [landed("port", "Kono", 10)], NOW + 60_000);
  const { status, body } = board(new URLSearchParams({ version: "2" }), store, fakeGame, NOW + 120_000);
  assert.equal(status, 200);
  const row = {
    rank: 1,
    nickname: "Tester",
    appearance: { sail: "teal" },
    score: 15.75,
    achievedAt: NOW + 1000,
    scoringVersion: 2,
    conditions: { seed: 1, knots: 18, gustKnots: 4 },
    tricks: [{ tack: "port", label: "Culo", score: 8.5 }, { tack: "starboard", label: "Spock", score: 7.25 }],
  };
  assert.deepEqual(body, {
    scoringVersionStarts: {},
    rows: [row],
    elo: [],
    weekly: {
      weekStart: fakeGame.weekStart(NOW),
      weekEnd: fakeGame.nextWeekStart(NOW),
      currentWeekStart: fakeGame.weekStart(NOW),
      firstWeekStart: fakeGame.weekStart(NOW),
      conditions: { seed: 1, knots: 18, gustKnots: 4 },
      rows: [row],
    },
  });
});

test("the board can show an earlier week and other scoring versions", (t) => {
  const { store, key } = setup(t);
  playHeat(store, key, TWO_MOVES, NOW);
  const earlier = fakeGame.weekStart(NOW) - WEEK;
  const { body } = board(new URLSearchParams({ version: "1", week: String(earlier) }), store, fakeGame, NOW);
  assert.equal(body.weekly.weekStart, earlier);
  assert.deepEqual(body.weekly.rows, []);
  assert.deepEqual(body.rows, []);
});
