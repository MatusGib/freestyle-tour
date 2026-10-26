// Endpoints for the Champion's challenge mod: this week's event, and starting
// a heat with the champion in the local 1v1 lobby. Real names: the champion and
// the podiums are named as they are.
import { WIND, championRooms, opponentFor, weekOf } from "../weekly.mjs";
import { fail, ok } from "./reply.mjs";

// This week's event and its story, the champion, the wind, your best score,
// whether you won, your last win, and whether the prize is earned. Asking also
// starts sailing the champion's first heat, so starting seldom has to wait.
export function weeklyInfo({ champion, game, now, weekly, weekRooms }) {
  const week = weekOf(champion, game.weekStart(now()));
  weekRooms(week).prepare();
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
// room ids are never reused. rooms: championRooms(). One heat sails at a time.
// prepare() starts sailing one unless one is ready or sailing; ready()
// resolves once one is ready, sailing it if needed (it rejects if sailing
// fails, and the next call tries again); take() hands out the ready room, or
// null, and starts sailing the next one, so "Challenge again" seldom has to
// wait.
export function roomQueue(rooms, heatFor, log = () => {}) {
  let ready = null;
  let sailing = null;
  const fill = () =>
    (sailing ??= (async () => {
      const { id, conditions } = rooms.next().value;
      ready = { id, heat: await heatFor(conditions) };
    })().finally(() => (sailing = null)));
  const report = (error) => log(`Couldn't get the next room ready: ${error.message}`);
  return {
    prepare() {
      if (!ready && !sailing) fill().catch(report);
    },
    async ready() {
      while (!ready) await fill();
    },
    take() {
      const room = ready;
      if (!room) return null;
      ready = null;
      fill().catch(report);
      return room;
    },
  };
}

// The champion's rooms for each week, as a function of the week (weekOf()):
// one room queue a week, made when the week is first asked for, since the
// week's event is in the room ids.
export function createWeekRooms({ champion, game, now, ai, log }) {
  const opponent = opponentFor(champion);
  const heatFor = async (conditions) => {
    const sailed = await ai.sail(conditions, opponent.target);
    const { poses, settledAt } = await ai.poses(conditions, sailed.replay);
    return { score: sailed.score, attempts: sailed.attempts, poses, settledAt };
  };
  let current = null;
  return (week) => {
    if (current?.weekStart !== week.weekStart) current = { weekStart: week.weekStart, rooms: roomQueue(championRooms(game.roomConditions, week.event.id, now()), heatFor, log) };
    return current.rooms;
  };
}

// Opens a room with the champion at once, as your challenge he has accepted:
// waits for his heat if it's still sailing, and keeps the next room's heat
// sailing behind it.
export async function startWeekly({ champion, game, now, lobby, weekRooms }) {
  const week = weekOf(champion, game.weekStart(now()));
  const opponent = opponentFor(champion);
  const rooms = weekRooms(week);
  try {
    await rooms.ready();
  } catch (error) {
    return fail(500, `Couldn't get ${opponent.nickname} ready: ${error.message}`);
  }
  lobby.start(opponent, rooms.take, { weekStart: week.weekStart, event: week.event.id });
  return ok({ name: opponent.nickname, wind: WIND });
}
