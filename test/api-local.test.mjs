import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { createStore } from "../server/store.mjs";
import { WEEK, fakeGame, tempDir } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const WIND = { seed: 1, knots: 18, gustKnots: 4 };
const landed = (score) => ({ tack: "port", label: "Culo", score, status: "landed" });

function setup(t) {
  let now = NOW;
  const ctx = { store: createStore(join(tempDir(t), "db.json")), game: fakeGame, now: () => now };
  const call = (method, path, body = {}, query = new URLSearchParams()) => handleApi({ method, path, query, body }, ctx);
  const { profile } = call("POST", "/api/rider", { action: "create", nickname: "Tester", appearance: { sail: "teal" } }).body;
  const play = (score, at, scoringVersion = 2) => {
    now = at;
    const { heatId } = call("POST", "/api/heats", { playerKey: profile.key, scoringVersion }).body;
    now = at + 1000;
    call("POST", "/api/leaderboard", { heatId, playerKey: profile.key, attempts: score ? [landed(score)] : [], replay: { format: 1, steps: 10, events: "" } });
    return heatId;
  };
  const list = (query = {}) => call("GET", "/api/local/heats", undefined, new URLSearchParams(query)).body;
  return { ctx, call, play, list };
}

test("heats store the week's wind when they start", (t) => {
  const { ctx, play } = setup(t);
  play(5, NOW);
  assert.deepEqual(ctx.store.data.heats[0].conditions, WIND);
});

test("the list returns finished heats newest first, filtered by week and version", (t) => {
  const { play, list } = setup(t);
  const a = play(5, NOW);
  const b = play(7, NOW + 60_000);
  const old = play(9, NOW - WEEK);
  const v3 = play(4, NOW + 120_000, 3);
  const ids = (query) => list(query).map((h) => h.heatId);
  assert.deepEqual(ids({}), [v3, b, a, old]);
  assert.deepEqual(ids({ week: String(NOW) }), [v3, b, a]);
  assert.deepEqual(ids({ week: String(NOW), version: "2" }), [b, a]);
});

test("list entries carry what the mods need", (t) => {
  const { play, list } = setup(t);
  const id = play(5, NOW);
  assert.deepEqual(list()[0], {
    heatId: id,
    nickname: "Tester",
    appearance: { sail: "teal" },
    score: 5,
    weekStart: fakeGame.weekStart(NOW),
    finishedAt: NOW + 1000,
    conditions: WIND,
    scoringVersion: 2,
    hasReplay: true,
  });
});

test("the detail adds attempts, tricks and the recording; unknown IDs are 404", (t) => {
  const { call, play } = setup(t);
  const id = play(5, NOW);
  const { status, body } = call("GET", `/api/local/heats/${id}`);
  assert.equal(status, 200);
  assert.deepEqual(body.replay, { format: 1, steps: 10, events: "" });
  assert.deepEqual(body.attempts, [landed(5)]);
  assert.deepEqual(body.tricks, [{ tack: "port", label: "Culo", score: 5 }]);
  assert.equal(call("GET", "/api/local/heats/missing").status, 404);
});

test("heats saved before wind was stored get it from their week", (t) => {
  const { ctx, play, list } = setup(t);
  play(5, NOW);
  ctx.store.update((d) => {
    delete d.heats[0].conditions;
  });
  assert.deepEqual(list()[0].conditions, WIND);
});
