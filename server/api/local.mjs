// Endpoints used only by our mods, never by the original client: list the
// heats stored on this computer and fetch one with its recording.
import { fail, ok } from "./reply.mjs";

function summary(heat, data, game) {
  const r = data.riders.find((x) => x.key === heat.playerKey);
  return {
    heatId: heat.heatId,
    nickname: r?.nickname ?? "Unknown rider",
    appearance: r?.appearance ?? {},
    score: heat.score,
    weekStart: heat.weekStart,
    finishedAt: heat.finishedAt,
    conditions: heat.conditions ?? game.weekConditions(heat.weekStart),
    scoringVersion: heat.scoringVersion,
    hasReplay: !!heat.replay,
  };
}

export function listHeats(query, store, game) {
  const week = query.has("week") ? game.weekStart(Number(query.get("week"))) : null;
  const version = query.has("version") ? Number(query.get("version")) : null;
  const heats = store.data.heats
    .filter((h) => h.finishedAt && (week === null || h.weekStart === week) && (version === null || h.scoringVersion === version))
    .sort((a, b) => b.finishedAt - a.finishedAt);
  return ok(heats.map((h) => summary(h, store.data, game)));
}

export function heatDetail(heatId, store, game) {
  const heat = store.data.heats.find((h) => h.heatId === heatId && h.finishedAt);
  if (!heat) return fail(404, "No finished heat with that ID on this computer.");
  return ok({ ...summary(heat, store.data, game), attempts: heat.attempts, tricks: heat.tricks, replay: heat.replay });
}
