import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { rider } from "../server/api/rider.mjs";
import { createStore } from "../server/store.mjs";
import { tempDir } from "./helpers.mjs";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const appearance = { hair: "short", sail: "teal" };
const newStore = (t) => createStore(join(tempDir(t), "db.json"));
const create = (store, nickname = "Tester") => rider({ action: "create", nickname, appearance, password: "", device: {} }, store);

test("create returns a profile the client accepts", (t) => {
  const { status, body } = create(newStore(t));
  assert.equal(status, 200);
  assert.match(body.profile.key, UUID_V4);
  assert.deepEqual({ ...body.profile, key: "k" }, { key: "k", revision: 1, protected: false, nickname: "Tester", appearance });
});

test("create refuses a nickname that is taken, ignoring case", (t) => {
  const store = newStore(t);
  create(store);
  const { status, body } = create(store, "tester");
  assert.equal(status, 409);
  assert.match(body.error, /taken/);
});

test("lookup finds a rider by nickname, or returns null", (t) => {
  const store = newStore(t);
  create(store);
  assert.deepEqual(rider({ action: "lookup", nickname: "TESTER" }, store).body, { rider: { nickname: "Tester", appearance, protected: false } });
  assert.deepEqual(rider({ action: "lookup", nickname: "Nobody" }, store).body, { rider: null });
});

test("login returns the existing profile; unknown nicknames are 404", (t) => {
  const store = newStore(t);
  const { profile } = create(store).body;
  assert.deepEqual(rider({ action: "login", nickname: "Tester", password: "anything" }, store).body, { profile });
  assert.equal(rider({ action: "login", nickname: "Nobody" }, store).status, 404);
});

test("load returns the profile by key; unknown keys are 401", (t) => {
  const store = newStore(t);
  const { profile } = create(store).body;
  assert.deepEqual(rider({ action: "load", playerKey: profile.key }, store).body, { profile });
  assert.equal(rider({ action: "load", playerKey: "00000000-0000-4000-8000-000000000000" }, store).status, 401);
});

test("save bumps the revision and stores the changes", (t) => {
  const store = newStore(t);
  const { profile } = create(store).body;
  const look = { hair: "long", sail: "red" };
  const saved = rider({ action: "save", playerKey: profile.key, revision: 1, nickname: "Tester", appearance: look }, store).body.profile;
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.appearance, look);
  assert.deepEqual(rider({ action: "load", playerKey: profile.key }, store).body.profile, saved);
  assert.equal(rider({ action: "save", playerKey: "missing" }, store).status, 401);
});

test("logout succeeds and unknown actions are 400", (t) => {
  const store = newStore(t);
  assert.deepEqual(rider({ action: "logout", playerKey: "k" }, store), { status: 200, body: {} });
  assert.equal(rider({ action: "explode" }, store).status, 400);
});
