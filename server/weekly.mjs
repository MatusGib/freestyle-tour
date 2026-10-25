// This week's super final: one past event per week, seeded by the week, with
// the winner of the division you pick as the opponent. The opponent's heat is
// sailed by the AI riders at a target seeded by the week, in the wind of a room
// id chosen to match the event's wind.
import { averageScore, heatTarget, seedOf } from "../lib/ai/score.mjs";

// Until the event winds table exists, every super final sails at 17 kt.
export const DEFAULT_WIND = { knots: 17, gustKnots: 0 };
const round = (value) => Math.round(value * 100) / 100;

// The game's default look, as a woman or a man, so the lobby and result
// screens have a full appearance to draw.
const LOOK = { country: "", skinColor: "warm", hair: "short", glasses: "sunglasses", helmet: "none", facialHair: "none", hairColor: "brown", facialHairColor: "brown", bodyType: "male", outfit: "wetsuit", harness: "black", sail: "orange", board: "orange" };
export const lookFor = (division) => ({ ...LOOK, bodyType: division === "women" ? "female" : "male", hair: division === "women" ? "long" : "short" });

// The week's event, from all events with results in id order.
export function weekOf(tour, weekStart) {
  const events = [...tour.events.values()].sort((a, b) => a.id - b.id);
  return { weekStart, event: events[seedOf("weekly", weekStart) % events.length] };
}

// The division's winner as the opponent, or null when the event had no such
// division.
export function opponentFor(tour, { event, weekStart }, division) {
  const winner = event.divisions[division]?.entries[0];
  if (!winner) return null;
  const rating = tour.ratings.events[event.id][division][winner.rider].rating;
  return {
    id: winner.rider,
    nickname: tour.riders.get(winner.rider).pseudonym,
    appearance: lookFor(division),
    rating: Math.round(rating),
    average: round(averageScore(rating)),
    target: round(heatTarget(rating, seedOf(winner.rider, event.id, weekStart, "super-final"))),
  };
}

// Room ids ("<prefix>-<n>") whose wind (by the game's own roomConditions)
// matches, in order. Every room needs an id never used before: the game ignores
// ids it has dismissed, and resumes an unfinished heat it kept for an id. So
// the prefix should carry the time the super final was started. Without gusts,
// all matching ids give exactly the same wind.
export function* roomIdsFor(roomConditions, wind, prefix) {
  for (let n = 0; n < 100_000; n++) {
    const id = `${prefix}-${n}`;
    const c = roomConditions(id);
    if (c.knots === wind.knots && c.gustKnots === wind.gustKnots) yield id;
  }
  throw new Error(`no room id gives ${wind.knots} kt with gusts of ${wind.gustKnots}`);
}

// Keeps each week's best score and whether you won, and when the prize was
// earned (the first win). store: createStore(file, { weeks: {}, prize: null }).
export function recordResult(store, { weekStart, event, division, score, won, at }) {
  store.update((data) => {
    const week = data.weeks[weekStart] ?? { event, division, best: 0, won: false };
    week.best = Math.max(week.best, score);
    week.won ||= won;
    data.weeks[weekStart] = week;
    if (won && !data.prize) data.prize = { earnedAt: at };
  });
}

// Records a finished super final room from the lobby; a forfeit isn't recorded.
export function recordRoom(store, room, at) {
  if (!room.meta || room.you.forfeited) return;
  recordResult(store, { ...room.meta, score: room.you.score, won: room.outcome === "1", at });
}
