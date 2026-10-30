// Registers a solo heat before it starts, as the original server does. The
// heat ID lets the finished heat be submitted to the leaderboard. The heat's
// wind is stored too, so replays can rebuild its starting state: this week's,
// or the venue's the venues mod sends with the request (the game sends none).
import { randomUUID } from "node:crypto";
import { fail, ok } from "./reply.mjs";

const ZONE_NUMBERS = ["inX", "inZ", "shoreline", "gain", "from", "over", "lee"];

// The conditions a mod says this heat is sailed in, if the game can sail them.
export function heatConditions(conditions) {
  if (!conditions || typeof conditions !== "object") return null;
  const { seed, knots, gustKnots, zones } = conditions;
  const whole = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
  if (!whole(seed, 0, 2 ** 32) || !whole(knots, 12, 28) || !whole(gustKnots, 0, 6)) return null;
  if (zones === undefined) return { seed, knots, gustKnots };
  const valid = zones && ZONE_NUMBERS.every((key) => Number.isFinite(zones[key])) &&
    Array.isArray(zones.curve) && zones.curve.length === 4 && zones.curve.every(Number.isFinite);
  if (!valid) return null;
  return { seed, knots, gustKnots, zones: Object.fromEntries([...ZONE_NUMBERS, "curve"].map((key) => [key, zones[key]])) };
}

export function startHeat(body, store, game, now) {
  if (!store.data.riders.some((r) => r.key === body.playerKey)) return fail(401, "Choose a rider nickname first.");
  const weekStart = game.weekStart(now);
  const heat = {
    heatId: randomUUID(),
    playerKey: body.playerKey,
    scoringVersion: body.scoringVersion ?? 2,
    weekStart,
    conditions: heatConditions(body.conditions) ?? game.weekConditions(weekStart),
    startedAt: now,
  };
  store.update((d) => void d.heats.push(heat));
  return ok({ heatId: heat.heatId, weekStart: heat.weekStart });
}
