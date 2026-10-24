import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { BAR } from "../lib/pwa/ratings.mjs";
import { nameKey } from "../lib/pwa/riders.mjs";

// Checks the committed data in tour/, as built by npm run tour-data.
const tour = new URL("../tour/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, tour), "utf8"));
const riders = read("riders.json");
const ratings = read("ratings.json");
const events = readdirSync(new URL("seasons/", tour)).flatMap((file) => read(`seasons/${file}`).events);

test("rider ids and pseudonyms are unique, and no pseudonym is a real name", () => {
  const ids = riders.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const pseudonyms = riders.map((r) => nameKey(r.pseudonym));
  assert.equal(new Set(pseudonyms).size, pseudonyms.length);
  const realNames = new Set(riders.map((r) => nameKey(r.name)));
  assert.deepEqual(riders.filter((r) => realNames.has(nameKey(r.pseudonym))).map((r) => r.id), []);
});

test("Balz Müller is Balt Möller", () => {
  assert.equal(riders.find((r) => r.id === "m:balz-muller")?.pseudonym, "Balt Möller");
});

test("every entry's rider is in riders.json and has a rating going into the event", () => {
  const known = new Set(riders.map((r) => r.id));
  const missing = [];
  for (const event of events) {
    for (const [division, { entries }] of Object.entries(event.divisions)) {
      for (const { rider } of entries) if (!known.has(rider) || !ratings.events[event.id]?.[division]?.[rider]) missing.push(`${event.id} ${rider}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("at most 1% of ladder sailors are unmatched", () => {
  const sailors = events.flatMap((e) => Object.values(e.divisions).flatMap((d) => d.ladders.flatMap((l) => l.rounds.flat().flatMap((h) => h.riders))));
  const unmatched = sailors.filter((s) => typeof s !== "string");
  assert.ok(sailors.length > 0, "there are ladder sailors");
  assert.ok(unmatched.length <= sailors.length * 0.01, `${unmatched.length} of ${sailors.length} ladder sailors are unmatched`);
});

test("the favourite won at least 65% of the 2022-2026 ladder heats", () => {
  assert.ok(ratings.check.heats > 0, "there are heats to check");
  assert.ok(ratings.check.hitRate >= BAR, `the favourite won ${ratings.check.hitRate}`);
});

test("the divisions taken from the season rankings are there", () => {
  const sizes = Object.fromEntries(events.filter((e) => [166, 169, 175].includes(e.id)).map((e) => [e.id, e.divisions.men?.entries.length]));
  assert.deepEqual(sizes, { 166: 38, 169: 37, 175: 47 });
});
