// Registers a solo heat before it starts, as the original server does. The
// heat ID lets the finished heat be submitted to the leaderboard.
import { randomUUID } from "node:crypto";
import { fail, ok } from "./reply.mjs";

export function startHeat(body, store, game, now) {
  if (!store.data.riders.some((r) => r.key === body.playerKey)) return fail(401, "Choose a rider nickname first.");
  const heat = { heatId: randomUUID(), playerKey: body.playerKey, scoringVersion: body.scoringVersion ?? 2, weekStart: game.weekStart(now), startedAt: now };
  store.update((d) => void d.heats.push(heat));
  return ok({ heatId: heat.heatId, weekStart: heat.weekStart });
}
