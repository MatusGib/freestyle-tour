import { test } from "node:test";
import assert from "node:assert/strict";
import { assignPseudonyms, candidates } from "../lib/pwa/pseudonym.mjs";

const rider = (id, name) => ({ id, division: "men", name, sailNumbers: [] });

test("one letter changes in each name", () => {
  assert.equal(candidates("Balz Müller")[0], "Balt Möller");
  assert.equal(candidates("Lennart Neubauer")[0], "Lennard Naubauer");
  assert.equal(candidates("Antony Ruenes")[0], "Antoni Roenes");
  assert.equal(candidates("Steven Van Broeckhoven")[0], "Stevem Van Brueckhoven");
  assert.equal(candidates("Adrien Bosson")[0], "Adriem Busson");
});

test("letters keep their case, nicknames are dropped, and h is skipped", () => {
  assert.equal(candidates("Ulf Estredo")[0], "Ulv Astredo");
  assert.equal(candidates('Jose "Gollito" Estredo')[0], "Josa Astredo");
  assert.equal(candidates("Elton (Taty) Frans")[0], "Eltom Frens");
  assert.equal(candidates("Josh Angulo")[0], "Jozh Engulo");
});

test("a particle stays and only the last word changes as the surname", () => {
  assert.equal(candidates("Dieter Van der Eyken")[0], "Dietel Van der Ayken");
});

test("a one-word name only gets the surname change", () => {
  assert.deepEqual(candidates("Gollito"), ["Gullito", "Gollyto"]);
});

test("candidates go: surname's next vowel, then the first name's next-to-last letter, then both", () => {
  assert.deepEqual(candidates("Balz Müller"), ["Balt Möller", "Balt Müllar", "Barz Möller", "Barz Müllar"]);
});

test("a clash moves on to the next candidate", () => {
  const riders = [rider("m:a", "Balz Müller"), rider("m:b", "Balt Möller"), rider("m:c", "Balz Mueller")];
  const pseudonyms = assignPseudonyms(riders);
  assert.equal(pseudonyms.get("m:a"), "Balt Müllar", "Balt Möller is m:b's real name");
  assert.equal(pseudonyms.get("m:b"), "Bald Müller");
  assert.equal(pseudonyms.get("m:c"), "Balt Moeller");
});

test("hand fixes come first, and a clash nothing can solve stops with both riders named", () => {
  const riders = [rider("m:a", "Balz Müller"), rider("m:b", "Ola")];
  const fixed = assignPseudonyms(riders, { "m:a": "Baltasar Moller" });
  assert.equal(fixed.get("m:a"), "Baltasar Moller");
  assert.throws(() => assignPseudonyms(riders, { "m:a": "Ola" }), /the pseudonym fix for m:a \(Ola\) clashes with m:b/);
  assert.throws(() => assignPseudonyms(riders, { "m:x": "Someone" }), /names m:x, who is not a rider/);
  const stuck = [rider("m:a", "Ba"), rider("m:b", "Be")];
  assert.throws(() => assignPseudonyms(stuck), /no free pseudonym for m:a \(Ba\); tried Be \(m:b\)/);
});
