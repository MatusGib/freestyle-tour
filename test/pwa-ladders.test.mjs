import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLadder, parseLadderIndex } from "../lib/pwa/parse.mjs";

const page = (name) => readFileSync(new URL(`fixtures/pwa/${name}`, import.meta.url), "utf8");

test("parseLadderIndex lists every ladder with its title and decoded link", () => {
  const ladders = parseLadderIndex(page("ladders-2025-fuerteventura.html"));
  assert.deepEqual(ladders.map((l) => l.title), [
    "Womens 2025 Fuerteventura Grand Slam ****** Womens Freestyle elimination 1(double)",
    "Mens 2025 Fuerteventura Grand Slam Mens Freestyle elimination(double)",
    "Mens 2025 Fuerteventura Grand Slam Mens Freestyle elimination",
    "2025 Fuerteventura Grand Slam ****** Mens Slalom Elimination 1",
  ]);
  assert.equal(ladders[2].url, "/events/elimination-ladder/elimination-ladders/375?tx_pwaworldtour_eliminationladders%5BeliminationLadder%5D=1014&type=25&cHash=27965ba0f08c1d11168455ca255b6a41");
  assert.deepEqual(parseLadderIndex(page("ladders-2008-sotavento.html")), []);
});

test("parseLadder reads a 2025 ladder: sex, discipline, rounds and each sailor's place", () => {
  const ladder = parseLadder(page("ladder-2025-fuerteventura-men.html"));
  assert.equal(ladder.title, "Mens 2025 Fuerteventura Grand Slam Mens Freestyle elimination");
  assert.deepEqual([ladder.sex, ladder.discipline, ladder.double], ["male", "freestyle", false]);
  assert.equal(ladder.rounds.length, 3);
  assert.deepEqual(ladder.rounds[0], [{ heat: "1 a", sailors: [{ surname: "Albert", sailNumber: "NC-21", place: 1 }, { surname: "Di Marco", sailNumber: "ITA-37", place: 0 }] }]);
  assert.deepEqual(ladder.rounds[2].map((h) => h.heat), ["16", "17"]);
});

test("parseLadder reads a 2014 ladder, which has no discipline and ranks sailors 1 and 2", () => {
  const ladder = parseLadder(page("ladder-2014-sylt-men.html"));
  assert.deepEqual([ladder.title, ladder.sex, ladder.discipline, ladder.double], ["Mens Sylt freestyle elimination 1", "male", null, false]);
  assert.deepEqual(ladder.rounds[0].map((h) => h.heat), ["4 b", "5 b", "8 b"], "the empty heat 1 a is left out");
  assert.deepEqual(ladder.rounds[0][0].sailors, [{ surname: "Böckler", sailNumber: "G-315", place: 2 }, { surname: "Mas", sailNumber: "F-07", place: 1 }]);
});

test("parseLadder keeps only sailed heats and spots double elimination", () => {
  const ladder = parseLadder(page("ladder-2025-fuerteventura-women-double.html"));
  assert.deepEqual([ladder.sex, ladder.double], ["female", true]);
  assert.deepEqual(ladder.rounds, [[]]);
  assert.throws(() => parseLadder("<div>no ladder</div>"), /missing the ladder XML/);
});
