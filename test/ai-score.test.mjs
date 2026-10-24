import { test } from "node:test";
import assert from "node:assert/strict";
import { winChance as glickoChance } from "../lib/pwa/glicko.mjs";
import { CEILING, FLOOR, SLOPE, SPREAD, averageScore, heatTarget, seedOf, winChance } from "../lib/ai/score.mjs";

const near = (actual, expected, within, what) => assert.ok(Math.abs(actual - expected) <= within, `${what}: ${actual} is not within ${within} of ${expected}`);

test("a 1965 rating averages 42, and 400 rating points are worth about 11.5", () => {
  assert.equal(averageScore(1965), 42);
  near(SLOPE, 0.0287, 0.0001, "slope");
  near(averageScore(1500), 28.65, 0.01, "a newcomer");
  near(averageScore(2365) - averageScore(1965), 11.48, 0.01, "400 points");
});

test("the model's win chances are within 0.02 of Glicko's", () => {
  const rider = (rating) => ({ rating, rd: 50, volatility: 0.06 });
  for (let gap = 0; gap <= 600; gap += 50) {
    near(winChance(1500 + gap, 1500), glickoChance(rider(1500 + gap), rider(1500)), 0.02, `gap ${gap}`);
  }
  near(winChance(1700, 1500) + winChance(1500, 1700), 1, 1e-9, "chances add up");
});

test("seeds are stable and differ for different challenges", () => {
  assert.equal(seedOf("m:balz-muller", 378, 1792800000000), seedOf("m:balz-muller", 378, 1792800000000));
  assert.notEqual(seedOf("m:balz-muller", 378, 1792800000000), seedOf("m:balz-muller", 378, 1793404800000));
  assert.notEqual(seedOf("m:balz-muller", 378), seedOf("m:yentel-caers", 378));
});

test("a seed always gives the same target, and targets stay within 22-50", () => {
  assert.equal(heatTarget(1757, 12345), heatTarget(1757, 12345));
  assert.notEqual(heatTarget(1757, 12345), heatTarget(1757, 12346));
  for (const rating of [700, 1200, 1500, 2000, 2300]) {
    for (let seed = 0; seed < 500; seed++) {
      const target = heatTarget(rating, seed);
      assert.ok(target >= FLOOR && target <= CEILING, `rating ${rating}, seed ${seed}: ${target}`);
    }
  }
});

test("targets average the rider's average score and spread about 6", () => {
  const targets = Array.from({ length: 4000 }, (_, seed) => heatTarget(1700, seedOf("spread", seed)));
  const mean = targets.reduce((sum, t) => sum + t, 0) / targets.length;
  const sd = Math.sqrt(targets.reduce((sum, t) => sum + (t - mean) ** 2, 0) / targets.length);
  near(mean, averageScore(1700), 0.3, "mean");
  near(sd, SPREAD, 0.3, "spread");
});
