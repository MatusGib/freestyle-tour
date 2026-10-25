// Endpoints for the Champion's challenge mod: this week's event, and getting the
// champion ready in the local 1v1 lobby. Real names: the champion and the
// podiums are named as they are.
import { WIND, championRooms, opponentFor, weekOf } from "../weekly.mjs";
import { fail, ok } from "./reply.mjs";

// This week's event and its story, the champion, the wind, your best score,
// whether you won, your last win, and whether the prize is earned.
export function weeklyInfo({ champion, game, now, weekly }) {
  const week = weekOf(champion, game.weekStart(now()));
  const { id, name, when, place, podium, story } = week.event;
  const opponent = opponentFor(champion);
  const record = weekly.data.weeks[week.weekStart];
  return ok({
    weekStart: week.weekStart,
    event: { id, name, when, place, podium },
    story,
    opponent: { name: opponent.nickname, target: opponent.target },
    wind: WIND,
    best: record?.best ?? null,
    won: !!record?.won,
    lastWin: weekly.data.lastWin ?? null,
    prize: !!weekly.data.prize,
  });
}

// Each room needs its own heat: gusts make every room's wind different, and
// room ids are never reused. rooms: championRooms(). take() hands out the
// ready room, or null, and starts sailing the next one, so "Challenge again"
// seldom has to wait.
export function roomQueue(rooms, heatFor, log = () => {}) {
  let ready = null;
  const fill = async () => {
    const { id, conditions } = rooms.next().value;
    ready = { id, heat: await heatFor(conditions) };
  };
  return {
    start: fill,
    take() {
      const room = ready;
      if (!room) return null;
      ready = null;
      fill().catch((error) => log(`Couldn't get the next room ready: ${error.message}`));
      return room;
    },
  };
}

// Sails the champion's heat for the first room, offers his challenge in the
// lobby, and keeps the next room's heat sailing behind it.
export async function startWeekly({ champion, game, now, ai, lobby, log }) {
  const week = weekOf(champion, game.weekStart(now()));
  const opponent = opponentFor(champion);
  const heatFor = async (conditions) => {
    const sailed = await ai.sail(conditions, opponent.target);
    const { poses, settledAt } = await ai.poses(conditions, sailed.replay);
    return { score: sailed.score, attempts: sailed.attempts, poses, settledAt };
  };
  try {
    const rooms = roomQueue(championRooms(game.roomConditions, week.event.id, now()), heatFor, log);
    await rooms.start();
    lobby.offer(opponent, rooms.take, { weekStart: week.weekStart, event: week.event.id });
  } catch (error) {
    return fail(500, `Couldn't get ${opponent.nickname} ready: ${error.message}`);
  }
  return ok({ name: opponent.nickname, wind: WIND });
}
