// The developer panel's data: the files with a draft laid over them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createDevData } from "../server/dev.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { tempDir, writeDataFiles, writeTour } from "./helpers.mjs";

const SOTAVENTO = "sotavento-fuerteventura";

function setup(t, { dev = true } = {}) {
  const dir = tempDir(t);
  writeTour(join(dir, "tour"));
  const paths = writeDataFiles(dir);
  const tour = loadTour(join(dir, "tour"));
  const logs = [];
  const make = () => createDevData({ paths, tour, draftStore: dev ? createStore(join(dir, "data", "dev-draft.json"), { draft: {} }) : null, log: (m) => logs.push(m) });
  return { dir, paths, logs, make, data: make() };
}

const knotsOf = (values) => ({
  event: values.eventWinds.byEvent.get(378)?.knots,
  venue: values.venues.byId.get(SOTAVENTO).gameConditions.knots,
  champion: values.champion.wind.knots,
  offset: values.tuning.aiTargetOffset,
});

test("without a draft the files' values hold", (t) => {
  const { data } = setup(t);
  assert.deepEqual(knotsOf(data.values()), { event: 18, venue: 19, champion: 21, offset: 0 });
  assert.deepEqual(data.draft(), {});
});

test("a draft is laid over the files, and an event without a wind gets an inferred one", (t) => {
  const { data } = setup(t);
  data.setDraft({
    eventWinds: { 378: { knots: 22 }, 375: { knots: 14, gustKnots: 4 } },
    venues: { [SOTAVENTO]: { gameConditions: { knots: 23 }, windZones: { lee: 1 } } },
    champion: { wind: { knots: 18 }, target: 44 },
    tuning: { aiTargetOffset: -2 },
  });
  const values = data.values();
  assert.deepEqual(knotsOf(values), { event: 22, venue: 23, champion: 18, offset: -2 });
  assert.deepEqual(values.venues.byId.get(SOTAVENTO).windZones, { gain: 4, from: 300, over: 120, lee: 1, note: "Stronger out" });
  assert.deepEqual([values.champion.wind.gustKnots, values.champion.target], [6, 44]);
  const added = values.eventWinds.byEvent.get(375);
  assert.deepEqual([added.knots, added.gustKnots, added.confidence, added.slug], [14, 4, "inferred", "e375"]);
  assert.equal(data.files().venues.venues[0].gameConditions.knots, 19, "the files are untouched");
});

test("a draft that breaks a rule is refused with its field, and the last good one stays", (t) => {
  const { data } = setup(t);
  data.setDraft({ tuning: { aiTargetOffset: 1 } });
  const refused = (draft, path) => assert.throws(() => data.setDraft(draft), { path });
  refused({ eventWinds: { 378: { gustKnots: 1 } } }, "eventWinds.378.gustKnots");
  refused({ venues: { [SOTAVENTO]: { gameConditions: { knots: 30 } } } }, `venues.${SOTAVENTO}.gameConditions.knots`);
  refused({ champion: { wind: { gustKnots: 3 } } }, "champion.wind.gustKnots");
  refused({ tuning: { aiTargetOffset: 11 } }, "tuning.aiTargetOffset");
  assert.deepEqual(data.draft(), { tuning: { aiTargetOffset: 1 } });
  assert.equal(data.values().tuning.aiTargetOffset, 1);
});

test("the draft is kept across a restart, and discarding drops it", (t) => {
  const { data, make } = setup(t);
  data.setDraft({ champion: { target: 40 } });
  const again = make();
  assert.equal(again.values().champion.target, 40);
  again.discard();
  assert.deepEqual(again.draft(), {});
  assert.equal(again.values().champion.target, 45.5);
});

test("changes to things no longer in the files are left out and listed", (t) => {
  const { data } = setup(t);
  data.setDraft({ eventWinds: { 999: { knots: 20 } }, venues: { gone: { gameConditions: { knots: 20 } } } });
  assert.deepEqual(data.dropped(), ["eventWinds.999", "venues.gone"]);
});

test("a saved draft that no longer fits the files is set aside, and the files' values hold", (t) => {
  const { dir, paths, logs } = setup(t);
  const store = createStore(join(dir, "data", "dev-draft.json"), { draft: {} });
  store.update((d) => void (d.draft = { champion: { target: 99 } }));
  const data = createDevData({ paths, tour: loadTour(join(dir, "tour")), draftStore: store, log: (m) => logs.push(m) });
  assert.match(data.problem(), /target must be from 20 to 60/);
  assert.equal(data.values().champion.target, 45.5);
});

test("without the dev mod there is no draft to set", (t) => {
  const { data } = setup(t, { dev: false });
  assert.throws(() => data.setDraft({ tuning: { aiTargetOffset: 1 } }), /dev mod is off/);
  assert.equal(data.values().tuning.aiTargetOffset, 0);
});
