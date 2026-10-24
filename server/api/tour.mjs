// Endpoints for the challenge mod: the tour's seasons and events, an event's
// riders, and an AI rider's heat for this week's solo wind. Riders appear only
// under their pseudonyms; real names never leave the server.
import { averageScore, heatTarget, seedOf } from "../../lib/ai/score.mjs";
import { fail, ok } from "./reply.mjs";

const NO_TOUR = "No tour data on this computer: run npm run tour-data.";
const round = (value) => Math.round(value * 100) / 100;

// Seasons newest first, each with its events in date order.
export function listSeasons(tour) {
  if (!tour) return fail(404, NO_TOUR);
  const seasons = new Map();
  for (const event of tour.events.values()) {
    const list = seasons.get(event.season) ?? [];
    list.push({ id: event.id, name: event.name, start: event.start, divisions: Object.keys(event.divisions) });
    seasons.set(event.season, list);
  }
  return ok([...seasons].sort(([a], [b]) => b - a).map(([season, events]) => ({ season, events: events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id)) })));
}

// An event's riders by division, in place order, with each one's average heat
// score going into the event.
export function eventRiders(tour, id) {
  if (!tour) return fail(404, NO_TOUR);
  const event = tour.events.get(Number(id));
  if (!event) return fail(404, `No event ${id} in the tour data.`);
  const divisions = {};
  for (const [name, { entries }] of Object.entries(event.divisions)) {
    const ratings = tour.ratings.events[event.id][name];
    divisions[name] = entries.map((e) => ({ rider: e.rider, pseudonym: tour.riders.get(e.rider).pseudonym, place: e.place, average: round(averageScore(ratings[e.rider].rating)) }));
  }
  return ok({ id: event.id, name: event.name, divisions });
}

// The rider's heat for this week's solo wind, sailed by the AI (or from the
// cache). body: { rider, event }.
export async function aiHeat(body, { tour, game, now, ai, aiHeats, snapshot }) {
  if (!tour) return fail(404, NO_TOUR);
  const event = tour.events.get(Number(body.event));
  if (!event) return fail(404, `No event ${body.event} in the tour data.`);
  const division = Object.keys(event.divisions).find((name) => event.divisions[name].entries.some((e) => e.rider === body.rider));
  if (!division) return fail(404, `${body.rider} didn't sail at ${event.name}.`);
  const weekStart = game.weekStart(now());
  const key = `${snapshot}|${weekStart}|${body.rider}|${event.id}`;
  const cached = aiHeats.data.heats[key];
  if (cached) return ok(cached);
  const conditions = game.weekConditions(weekStart);
  const rating = tour.ratings.events[event.id][division][body.rider].rating;
  const target = round(heatTarget(rating, seedOf(body.rider, event.id, weekStart)));
  let heat;
  try {
    heat = await ai.sail(conditions, target);
  } catch (error) {
    return fail(500, `Couldn't plan the heat: ${error.message}`);
  }
  const record = {
    key,
    rider: body.rider,
    pseudonym: tour.riders.get(body.rider).pseudonym,
    event: event.id,
    eventName: event.name,
    weekStart,
    conditions,
    target,
    score: heat.score,
    tricks: heat.tricks,
    replay: heat.replay,
  };
  aiHeats.update((data) => void (data.heats[key] = record));
  return ok(record);
}
