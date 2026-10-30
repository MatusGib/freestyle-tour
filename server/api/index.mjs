// Routes /api/* requests to the fake APIs, plus the /api/local/* endpoints our
// mods use. Anything else gets a 404 marked `unknown`, which the server logs.
import { feedback } from "./feedback.mjs";
import { startHeat } from "./heats.mjs";
import { lagoons } from "./lagoons.mjs";
import { board, submitHeat } from "./leaderboard.mjs";
import { heatDetail, listHeats } from "./local.mjs";
import { fail } from "./reply.mjs";
import { rider } from "./rider.mjs";
import { aiHeat, eventRiders, listSeasons, listVenues } from "./tour.mjs";
import { startWeekly, weeklyInfo } from "./weekly.mjs";

const HEAT_PATH = "/api/local/heats/";
const EVENT_PATH = "/api/local/tour/events/";

// request: { method, path, query: URLSearchParams, body, host }; ctx: { store,
// game, now(), tour, venues, eventWinds, mods, ai, aiHeats, snapshot, lobby, relay,
// weekly, champion, weekRooms, log }. POST
// /api/local/ai-heats and POST /api/local/weekly/start answer with a promise,
// the rest straight away.
export function handleApi({ method, path, query, body, host }, ctx) {
  const { store, game, now } = ctx;
  const route = `${method} ${path}`;
  if (route === "POST /api/rider") return rider(body, store);
  if (route === "POST /api/heats") return startHeat(body, store, game, now());
  if (route === "GET /api/leaderboard") return board(query, store, game, now());
  if (route === "POST /api/leaderboard") return submitHeat(body, store, game, now());
  if (route === "POST /api/feedback") return feedback(body, store, now());
  if (path === "/api/lagoons" || path.startsWith("/api/lagoons/")) return lagoons(path, body, host, ctx);
  if (route === "GET /api/local/heats") return listHeats(query, store, game);
  if (method === "GET" && path.startsWith(HEAT_PATH)) return heatDetail(path.slice(HEAT_PATH.length), store, game);
  if (route === "GET /api/local/tour/seasons") return listSeasons(ctx.tour);
  if (route === "GET /api/local/venues") return listVenues(ctx.venues);
  if (method === "GET" && path.startsWith(EVENT_PATH)) return eventRiders(ctx.tour, path.slice(EVENT_PATH.length), ctx.venues, ctx.mods?.includes("venues"), ctx.eventWinds);
  if (route === "POST /api/local/ai-heats") return aiHeat(body, ctx);
  if (route === "GET /api/local/weekly") return weeklyInfo(ctx);
  if (route === "POST /api/local/weekly/start") return startWeekly(ctx);
  return { ...fail(404, "Not available in the local copy."), unknown: true };
}
