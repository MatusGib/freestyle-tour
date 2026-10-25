// The Champion's challenge: one of the champion's recent wins each week,
// seeded by the week, with the champion himself as the opponent. His heat is
// sailed by the AI riders in the champion's wind, 21 kt with each room's own
// gusts (mods/champion/wind.js, shared with the patched game).
// champion: server/champion.json.
import { seedOf } from "../lib/ai/score.mjs";
import { WIND, roomWind } from "../mods/champion/wind.js";

export { WIND };

// The game's default look, so the lobby and result screens have a full
// appearance to draw, but with an orange sail and board (the default is teal)
// so the opponent stands apart from a default-look player.
export const LOOK = { country: "", skinColor: "warm", hair: "short", glasses: "sunglasses", helmet: "none", facialHair: "none", hairColor: "brown", facialHairColor: "brown", bodyType: "male", outfit: "wetsuit", harness: "black", sail: "orange", board: "orange" };

// The week's event, from the champion's events in the order listed.
export function weekOf(champion, weekStart) {
  return { weekStart, event: champion.events[seedOf("weekly", weekStart) % champion.events.length] };
}

// The champion as the opponent, aiming for champion.target (the AI lands about
// half a point under it in this wind).
export function opponentFor(champion) {
  return { id: champion.rider, nickname: champion.name, appearance: LOOK, rating: champion.rating, target: champion.target };
}

// The champion's rooms for an event, in order: ids "champion-<event>-<at>-<n>"
// whose gusts (by the game's own roomConditions) are the champion's, with the
// wind the patched game gives them. Every room needs an id never used before:
// the game ignores ids it has dismissed, and resumes an unfinished heat it kept
// for an id, so the ids carry the time the challenge was started (at). Each
// room has its own gusts.
export function* championRooms(roomConditions, eventId, at) {
  for (let n = 0; n < 100_000; n++) {
    const id = `champion-${eventId}-${at}-${n}`;
    const conditions = roomWind(id, roomConditions(id));
    if (conditions.gustKnots === WIND.gustKnots) yield { id, conditions };
  }
  throw new Error(`no room id gives gusts of ${WIND.gustKnots}`);
}

// Keeps each week's best score and whether you won, your last win (so the mod
// can congratulate you once), and when the prize was earned (the first win).
// store: createStore(file, { weeks: {}, prize: null }).
export function recordResult(store, { weekStart, event, score, opponentScore, won, at }) {
  store.update((data) => {
    const week = data.weeks[weekStart] ?? { event, best: 0, won: false };
    week.best = Math.max(week.best, score);
    week.won ||= won;
    data.weeks[weekStart] = week;
    if (!won) return;
    data.lastWin = { at, event, score, opponentScore };
    data.prize ??= { earnedAt: at };
  });
}

// Records a finished Champion's challenge room from the lobby; a forfeit isn't
// recorded.
export function recordRoom(store, room, at) {
  if (!room.meta || room.you.forfeited) return;
  recordResult(store, { ...room.meta, score: room.you.score, opponentScore: room.ai.score, won: room.outcome === "1", at });
}
