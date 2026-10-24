// Leaderboards built from heats played on this computer. Heats are scored with
// the game's own heat totals and weeks come from the game's own calendar, so
// the numbers match what the player saw at the end of the heat.
import { fail, ok } from "./reply.mjs";

const ranked = (data) => data.heats.filter((h) => h.finishedAt && h.score > 0);

// Each rider's best heat, best first; the earlier heat wins a tie.
function bestPerRider(heats) {
  const best = new Map();
  for (const h of heats) {
    const current = best.get(h.playerKey);
    if (!current || h.score > current.score || (h.score === current.score && h.finishedAt < current.finishedAt)) best.set(h.playerKey, h);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.finishedAt - b.finishedAt);
}

function rows(heats, data, game) {
  return bestPerRider(heats).map((h, i) => {
    const r = data.riders.find((x) => x.key === h.playerKey);
    return {
      rank: i + 1,
      nickname: r?.nickname ?? "Unknown rider",
      appearance: r?.appearance ?? {},
      score: h.score,
      achievedAt: h.finishedAt,
      scoringVersion: h.scoringVersion,
      conditions: game.weekConditions(h.weekStart),
      tricks: h.tricks,
    };
  });
}

export function submitHeat(body, store, game, now) {
  const heat = store.data.heats.find((h) => h.heatId === body.heatId && h.playerKey === body.playerKey);
  if (!heat) return fail(404, "That heat was not started on this computer.");
  if (heat.finishedAt) return fail(410, "That heat has already been saved.");
  const attempts = Array.isArray(body.attempts) ? body.attempts : [];
  const totals = game.heatTotals({ attempts });
  const finished = {
    ...heat,
    finishedAt: now,
    attempts,
    replay: body.replay ?? null,
    score: totals.total,
    tricks: totals.counting.map((a) => ({ tack: a.tack, label: a.label, score: a.score })),
  };
  store.update((d) => {
    d.heats[d.heats.findIndex((h) => h.heatId === heat.heatId)] = finished;
  });
  const mine = ranked(store.data).filter((h) => h.playerKey === heat.playerKey);
  const best = Math.max(0, ...mine.map((h) => h.score));
  if (finished.score <= 0) return ok({ best });
  const week = bestPerRider(ranked(store.data).filter((h) => h.weekStart === heat.weekStart));
  const rank = week.findIndex((h) => h.playerKey === heat.playerKey) + 1;
  return ok({ best, weekly: { rank, best: week[rank - 1].score } });
}

export function board(query, store, game, now) {
  const version = Number(query.get("version") ?? 2);
  const currentWeekStart = game.weekStart(now);
  const weekStart = query.has("week") ? game.weekStart(Number(query.get("week"))) : currentWeekStart;
  const heats = ranked(store.data);
  return ok({
    scoringVersionStarts: {},
    rows: rows(heats.filter((h) => h.scoringVersion === version), store.data, game),
    elo: [],
    weekly: {
      weekStart,
      weekEnd: game.nextWeekStart(weekStart),
      currentWeekStart,
      firstWeekStart: Math.min(currentWeekStart, ...heats.map((h) => h.weekStart)),
      conditions: game.weekConditions(weekStart),
      rows: rows(heats.filter((h) => h.weekStart === weekStart), store.data, game),
    },
  });
}
