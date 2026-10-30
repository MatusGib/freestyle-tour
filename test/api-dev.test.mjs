// The developer panel's endpoints.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { createDevData } from "../server/dev.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { tempDir, writeDataFiles, writeTour } from "./helpers.mjs";

function setup(t, { mods = ["dev"] } = {}) {
  const dir = tempDir(t);
  writeTour(join(dir, "tour"));
  const paths = writeDataFiles(dir);
  const tour = loadTour(join(dir, "tour"));
  const data = createDevData({ paths, tour, draftStore: createStore(join(dir, "dev-draft.json"), { draft: {} }), log: () => {} });
  const ctx = { mods, tour, data };
  const call = (method, path, body) => handleApi({ method, path, query: new URLSearchParams(), body }, ctx);
  return { call, paths };
}

test("the panel gets the files, the draft and the events by venue", (t) => {
  const { call } = setup(t);
  const { status, body } = call("GET", "/api/local/dev");
  assert.equal(status, 200);
  assert.equal(body.files.champion.target, 45.5);
  assert.deepEqual(body.draft, {});
  assert.deepEqual(body.events.map((group) => [group.venue?.id ?? null, group.events.map((e) => e.id)]), [["sotavento-fuerteventura", [300, 375, 378]]]);
  assert.equal(body.dataFiles.eventWinds, "tour/event-winds.json");
});

test("a draft that fits is kept; one that doesn't is refused with its field", (t) => {
  const { call } = setup(t);
  assert.deepEqual(call("POST", "/api/local/dev/draft", { champion: { target: 40 } }).body.draft, { champion: { target: 40 } });
  const refused = call("POST", "/api/local/dev/draft", { champion: { target: 99 } });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.path, "champion.target");
  assert.match(refused.body.error, /from 20 to 60/);
  assert.deepEqual(call("GET", "/api/local/dev").body.draft, { champion: { target: 40 } });
});

test("discarding empties the draft, and writing names the files written", (t) => {
  const { call, paths } = setup(t);
  call("POST", "/api/local/dev/draft", { tuning: { aiTargetOffset: -1 } });
  assert.deepEqual(call("POST", "/api/local/dev/discard", {}).body.draft, {});
  call("POST", "/api/local/dev/draft", { tuning: { aiTargetOffset: -1 } });
  const { status, body } = call("POST", "/api/local/dev/write", {});
  assert.equal(status, 200);
  assert.deepEqual(body.written, ["server/tuning.json"]);
  assert.equal(JSON.parse(readFileSync(paths.tuning, "utf8")).aiTargetOffset, -1);
});

test("without the dev mod the endpoints aren't there", (t) => {
  const { call } = setup(t, { mods: [] });
  assert.equal(call("GET", "/api/local/dev").status, 404);
  assert.equal(call("POST", "/api/local/dev/write", {}).status, 404);
});
