import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_RD, newRider, ratePeriod, winChance } from "../lib/pwa/glicko.mjs";

const near = (actual, expected, within, what) => assert.ok(Math.abs(actual - expected) <= within, `${what}: ${actual} is not within ${within} of ${expected}`);

// The worked example in Glickman's paper.
const player = { rating: 1500, rd: 200, volatility: 0.06 };
const games = [
  { opponent: { rating: 1400, rd: 30, volatility: 0.06 }, score: 1 },
  { opponent: { rating: 1550, rd: 100, volatility: 0.06 }, score: 0 },
  { opponent: { rating: 1700, rd: 300, volatility: 0.06 }, score: 0 },
];

test("ratePeriod matches Glickman's worked example", () => {
  const after = ratePeriod(player, games, 0.5);
  near(after.rating, 1464.06, 0.01, "rating");
  near(after.rd, 151.52, 0.01, "rd");
  near(after.volatility, 0.05999, 0.00001, "volatility");
});

test("weights of 1 change nothing, and a weight of 2 counts a game twice", () => {
  assert.deepEqual(ratePeriod(player, games.map((game) => ({ ...game, weight: 1 })), 0.5), ratePeriod(player, games, 0.5));
  const once = ratePeriod(player, [...games, games[0]], 0.5);
  const weighted = ratePeriod(player, [{ ...games[0], weight: 2 }, games[1], games[2]], 0.5);
  near(weighted.rating, once.rating, 1e-9, "rating");
  near(weighted.rd, once.rd, 1e-9, "rd");
});

test("a period without games only grows the deviation, never past 350", () => {
  const after = ratePeriod(player, [], 0.5);
  assert.equal(after.rating, 1500);
  assert.equal(after.volatility, 0.06);
  near(after.rd, Math.sqrt((200 / 173.7178) ** 2 + 0.06 ** 2) * 173.7178, 1e-9, "rd");
  assert.equal(ratePeriod({ rating: 1500, rd: 349.9, volatility: 0.06 }, [], 0.5).rd, MAX_RD);
});

test("newcomers start at the given rating with deviation 350", () => {
  assert.deepEqual(newRider(1400), { rating: 1400, rd: 350, volatility: 0.06 });
});

test("winChance favours the higher rating, less so when deviations are wide", () => {
  const strong = { rating: 1700, rd: 50, volatility: 0.06 };
  const weak = { rating: 1500, rd: 50, volatility: 0.06 };
  assert.equal(winChance(weak, weak), 0.5);
  near(winChance(strong, weak) + winChance(weak, strong), 1, 1e-12, "chances add up");
  assert.ok(winChance(strong, weak) > 0.75);
  assert.ok(winChance({ ...strong, rd: 350 }, { ...weak, rd: 350 }) < winChance(strong, weak));
});
