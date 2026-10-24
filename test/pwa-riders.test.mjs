import { test } from "node:test";
import assert from "node:assert/strict";
import { heatRanks, matchSailor, nameKey, possibleDuplicates, resolveEvents, riderId, withinOneEdit } from "../lib/pwa/riders.mjs";

const entry = (place, name, sailNumber, points = 0) => ({ place, name, sailNumber, points });
const sailor = (surname, sailNumber, place) => ({ surname, sailNumber, place });

test("name keys drop nicknames, accents and case", () => {
  assert.equal(nameKey('Jose "Gollito" Estredo'), "jose-estredo");
  assert.equal(nameKey("Elton (Taty) Frans"), "elton-frans");
  assert.equal(nameKey("Balz Müller"), "balz-muller");
  assert.equal(nameKey("Steven Van Broeckhoven"), "steven-van-broeckhoven");
  assert.equal(nameKey("Bjørn Saßmann"), "bjorn-sassmann");
});

test("rider ids carry the division and follow aliases", () => {
  assert.equal(riderId("men", "Balz Müller"), "m:balz-muller");
  assert.equal(riderId("women", "Sarah-Quita Offringa"), "w:sarah-quita-offringa");
  assert.equal(riderId("men", "Jose Estredo Rodriguez", { "m:jose-estredo-rodriguez": "m:jose-estredo" }), "m:jose-estredo");
});

test("ladder sailors match by sail number first, then by surname", () => {
  const entries = [
    entry(9, "Balz Müller", "SUI-21"),
    entry(13, "Takuma Sugi", "J-7"),
    entry(17, "Ryoma Sugi", "JPN-12"),
    entry(17, "Nicolo Di Marco", "ITA-11"),
  ];
  assert.equal(matchSailor(sailor("Muller", "SUI-21", 0), entries).name, "Balz Müller");
  assert.equal(matchSailor(sailor("Sugi", "J-7", 1), entries).name, "Takuma Sugi");
  assert.equal(matchSailor(sailor("Di Marco", "ITA-37", 0), entries).name, "Nicolo Di Marco", "sail number changed");
  assert.equal(matchSailor(sailor("Sugi", "J-99", 1), entries), null, "two riders are called Sugi");
  assert.equal(matchSailor(sailor("Nobody", "X-1", 1), entries), null);
});

test("a typo in a long surname, or a cut-off sail number, still matches one entry", () => {
  const entries = [entry(20, "Mateusz Wieczorek", "G-192"), entry(13, "Takuma Sugi", "J-7"), entry(17, "Ryoma Sugi", "JPN-12"), entry(5, "Antoine Albert", "NC-21")];
  assert.equal(matchSailor(sailor("Wieczzorek", "GER-192", 0), entries).name, "Mateusz Wieczorek");
  assert.equal(matchSailor(sailor("Sugi", "J-", 0), entries).name, "Takuma Sugi");
  assert.equal(matchSailor(sailor("Alber", "", 0), entries).name, "Antoine Albert");
  assert.equal(matchSailor(sailor("Sugo", "", 0), entries), null, "short surnames must match exactly");
});

test("withinOneEdit allows one letter added, dropped or changed", () => {
  assert.ok(withinOneEdit("wieczorek", "wieczzorek"));
  assert.ok(withinOneEdit("wieczzorek", "wieczorek"));
  assert.ok(withinOneEdit("muller", "mueller"));
  assert.ok(withinOneEdit("thode", "thode"));
  assert.ok(withinOneEdit("thode", "thoda"));
  assert.ok(!withinOneEdit("thode", "theda"));
  assert.ok(!withinOneEdit("albert", "alb"));
});

test("heat ranks: positive places rank, 0 comes last, equal places tie", () => {
  assert.deepEqual(heatRanks([1, 0]), [1, 2]);
  assert.deepEqual(heatRanks([2, 1]), [2, 1]);
  assert.deepEqual(heatRanks([0, 0]), [1, 1]);
  assert.deepEqual(heatRanks([2, 0, 1, 2]), [2, 4, 1, 2]);
});

const rawEvent = (id, start, season, divisions) => ({ season, id, slug: `e${id}`, name: `Event ${id}`, start, end: start, location: "Somewhere", divisions });

test("resolveEvents gives ids to entries and ladder sailors, in date order", () => {
  const later = rawEvent(2, "2025-07-18", 2025, {
    men: {
      entries: [entry(2, "Balz Müller", "SUI-22", 8500), entry(1, "Yentel Caers", "B-16", 10000), entry(3, "Ghost Rider", "", 7650)],
      ladders: [{ title: "Final", double: false, rounds: [[{ heat: "17", sailors: [sailor("Caers", "B-16", 1), sailor("Muller", "SUI-22", 0)] }, { heat: "16", sailors: [sailor("Unknown", "X-9", 1), sailor("Rider", "", 0)] }]] }],
    },
  });
  const earlier = rawEvent(1, "2024-07-18", 2024, { men: { entries: [entry(1, "Balz Muller", "SUI-21", 10000)], ladders: [] } });
  const { events, riders, unmatched } = resolveEvents([later, earlier]);
  assert.deepEqual(events.map((e) => e.id), [1, 2]);
  const men = events[1].divisions.men;
  assert.deepEqual(men.entries.map((e) => e.rider), ["m:yentel-caers", "m:balz-muller", "m:ghost-rider"], "in place order");
  assert.deepEqual(men.ladders[0].rounds[0][0], { heat: "17", riders: ["m:yentel-caers", "m:balz-muller"], ranks: [1, 2] });
  assert.deepEqual(men.ladders[0].rounds[0][1].riders, [{ surname: "Unknown", sailNumber: "X-9" }, "m:ghost-rider"]);
  assert.deepEqual(unmatched, [{ event: 2, division: "men", heat: "16", surname: "Unknown", sailNumber: "X-9" }]);
  assert.deepEqual(riders.find((r) => r.id === "m:balz-muller"), { id: "m:balz-muller", division: "men", name: "Balz Müller", sailNumbers: ["SUI-22", "SUI-21"] });
  assert.deepEqual(riders.find((r) => r.id === "m:ghost-rider").sailNumbers, []);
});

test("resolveEvents fails when two entries of one division get the same id", () => {
  const event = rawEvent(1, "2025-01-01", 2025, { men: { entries: [entry(1, "Balz Müller", "SUI-21"), entry(2, "Balz Muller", "SUI-9")], ladders: [] } });
  assert.throws(() => resolveEvents([event]), /Event 1: two men entries are m:balz-muller/);
});

test("possible duplicates: one sail number under two ids, or the same surname and initial", () => {
  const events = [
    rawEvent(1, "2012-05-01", 2012, { men: { entries: [entry(1, "Jose Estredo", "V-10"), entry(2, "Kiri Thode", "NB-61"), entry(3, "Old Timer", "E-13")], ladders: [] } }),
    rawEvent(2, "2014-05-01", 2014, { men: { entries: [entry(1, 'Jose "Gollito" Estredo Rodriguez', "V-10")], ladders: [] } }),
    rawEvent(3, "2020-05-01", 2020, { men: { entries: [entry(1, "New Kid", "E-13")], ladders: [] } }),
  ];
  const { events: resolved, riders } = resolveEvents(events);
  const extra = [...riders, { id: "m:kai-thode", division: "men", name: "Kai Thode", sailNumbers: [] }];
  assert.deepEqual(possibleDuplicates(resolved, extra), [
    { a: "m:jose-estredo", b: "m:jose-estredo-rodriguez", reason: "sail number V-10" },
    { a: "m:kai-thode", b: "m:kiri-thode", reason: "same surname and first initial" },
  ]);
});
