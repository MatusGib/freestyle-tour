import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { createStore } from "../server/store.mjs";
import { fakeGame, tempDir } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const context = (t) => ({ store: createStore(join(tempDir(t), "db.json")), game: fakeGame, now: () => NOW });
const call = (ctx, method, path, body = {}, query = new URLSearchParams()) => handleApi({ method, path, query, body }, ctx);

test("the lobby socket is told there is no relay", (t) => {
  assert.deepEqual(call(context(t), "POST", "/api/lagoons/lobby-connect"), { status: 200, body: { relay: null } });
});

test("lobby polls get an empty lobby with the server time", (t) => {
  const { status, body } = call(context(t), "POST", "/api/lagoons", { action: "sync" });
  assert.equal(status, 200);
  assert.deepEqual(body, { serverTime: NOW, room: null, riders: [], challenges: [], rankings: [] });
});

test("other 1v1 endpoints are unavailable", (t) => {
  const { status, body } = call(context(t), "POST", "/api/lagoons/signaling");
  assert.equal(status, 404);
  assert.match(body.error, /1v1 is unavailable/);
});

test("feedback is kept locally", (t) => {
  const ctx = context(t);
  assert.deepEqual(call(ctx, "POST", "/api/feedback", { id: "f1", message: "Great", contact: "" }), { status: 200, body: { ok: true } });
  assert.deepEqual(ctx.store.data.feedback, [{ id: "f1", message: "Great", contact: "", at: NOW }]);
});

test("rider, heats and leaderboard calls reach their handlers", (t) => {
  const ctx = context(t);
  const { profile } = call(ctx, "POST", "/api/rider", { action: "create", nickname: "Tester", appearance: {} }).body;
  assert.equal(profile.nickname, "Tester");
  const { heatId } = call(ctx, "POST", "/api/heats", { playerKey: profile.key, scoringVersion: 2 }).body;
  assert.equal(call(ctx, "POST", "/api/leaderboard", { heatId, playerKey: profile.key, attempts: [] }).status, 200);
  assert.equal(call(ctx, "GET", "/api/leaderboard", undefined, new URLSearchParams({ version: "2" })).status, 200);
});

test("unknown endpoints are 404 and marked unknown", (t) => {
  const result = call(context(t), "POST", "/api/admin");
  assert.equal(result.status, 404);
  assert.equal(result.unknown, true);
});
