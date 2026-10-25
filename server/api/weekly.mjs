// Endpoints for the super final mod: this week's event and opponents, and
// getting an opponent ready in the local 1v1 lobby. Pseudonyms only.
import { DEFAULT_WIND, opponentFor, roomIdsFor, weekOf } from "../weekly.mjs";
import { fail, ok } from "./reply.mjs";

const NO_TOUR = "No tour data on this computer: run npm run tour-data.";

// This week's event, its divisions' opponents, the wind, your best score,
// whether you won, and whether the prize is earned.
export function weeklyInfo({ tour, game, now, weekly }) {
  if (!tour) return fail(404, NO_TOUR);
  const week = weekOf(tour, game.weekStart(now()));
  const { event } = week;
  const divisions = {};
  for (const name of Object.keys(event.divisions)) {
    const opponent = opponentFor(tour, week, name);
    divisions[name] = { pseudonym: opponent.nickname, average: opponent.average };
  }
  const record = weekly.data.weeks[week.weekStart];
  return ok({
    weekStart: week.weekStart,
    event: { id: event.id, name: event.name, start: event.start, location: event.location },
    divisions,
    wind: DEFAULT_WIND,
    best: record?.best ?? null,
    won: !!record?.won,
    prize: !!weekly.data.prize,
  });
}

// Sails (or reuses) the opponent's heat in the room's wind, turns it into a
// pose track and offers the challenge in the lobby. body: { division }.
export async function startWeekly(body, { tour, game, now, ai, aiHeats, lobby, snapshot }) {
  if (!tour) return fail(404, NO_TOUR);
  const week = weekOf(tour, game.weekStart(now()));
  const opponent = opponentFor(tour, week, body.division);
  if (!opponent) return fail(404, `${week.event.name} had no ${body.division}'s final.`);
  const { target } = opponent;
  // Without gusts every matching room has the same wind, so one heat serves the
  // whole week; gusty winds will need the room's seed in the key.
  const key = `${snapshot}|super-final|${week.weekStart}|${body.division}|${DEFAULT_WIND.knots}-${DEFAULT_WIND.gustKnots}|${target}`;
  try {
    const roomIds = roomIdsFor(game.roomConditions, DEFAULT_WIND, `super-final-${week.event.id}-${now()}`);
    const firstRoom = roomIds.next().value;
    const conditions = game.roomConditions(firstRoom);
    let heat = aiHeats.data.heats[key];
    if (!heat) {
      const sailed = await ai.sail(conditions, target);
      heat = { key, rider: opponent.id, pseudonym: opponent.nickname, conditions, target, score: sailed.score, attempts: sailed.attempts, replay: sailed.replay };
      aiHeats.update((data) => void (data.heats[key] = heat));
    }
    const { poses, settledAt } = await ai.poses(conditions, heat.replay);
    let next = firstRoom;
    const nextRoomId = () => {
      const id = next ?? roomIds.next().value;
      next = null;
      return id;
    };
    lobby.offer(opponent, { score: heat.score, attempts: heat.attempts, poses, settledAt }, nextRoomId, { weekStart: week.weekStart, event: week.event.id, division: body.division });
  } catch (error) {
    return fail(500, `Couldn't get ${opponent.nickname} ready: ${error.message}`);
  }
  return ok({ pseudonym: opponent.nickname, wind: DEFAULT_WIND });
}
