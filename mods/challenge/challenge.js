// Pure helpers for the challenge mod, shared with the tests. A challenge is an
// AI heat as POST /api/local/ai-heats returns it.
import { windText } from "../venues/venue.js";

// A solo heat at its first step: practice has no heat, and 1v1 heats run on a
// competition clock.
export const isSoloHeatStart = (state, game) => state.heat.enabled && state.totalTime === 0 && !game.competitionClock;

// A sample for the game's opponent display, with the pose nested the way its
// 1v1 transport sends it.
export const aiSample = (pose, now) => ({ pose, updatedAt: now, streamId: "challenge" });

export const riderLine = (r) => `${r.place}. ${r.pseudonym} · ${r.average.toFixed(1)}`;
export const planningText = (pseudonym) => `Planning ${pseudonym}'s heat…`;
export const nextHeatText = (heat) => `Next solo heat: vs ${heat.pseudonym} (target ${heat.target.toFixed(1)})${heat.venue ? ` at ${heat.venue.name}` : ""}`;

// A challenge sailed in an earlier week's wind has to be planned again.
export const isStale = (heat, weekStart) => heat.weekStart !== weekStart;

export function resultText(yours, heat) {
  const winner = yours > heat.score ? "you win" : yours < heat.score ? `${heat.pseudonym} wins` : "a draw";
  return `You ${yours.toFixed(2)} · ${heat.pseudonym} ${heat.score.toFixed(2)}: ${winner}`;
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// The event card's wind: the event's own from its reports, its venue's usual
// wind, or this week's. event: as GET /api/local/tour/events/<id> answers.
export function windLine({ wind, venue }) {
  if (wind?.source === "reported") return `Reported${wind.day ? ` (${DAY.format(new Date(wind.day))})` : ""}: ${windText(wind)}`;
  if (wind?.source === "usual") return `Usual at ${venue.name}: ${windText(wind)}`;
  return "This week's wind";
}
