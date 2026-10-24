// Routes /api/* requests to the fake APIs, plus the /api/local/* endpoints our
// mods use. Anything else gets a 404 marked `unknown`, which the server logs.
import { feedback } from "./feedback.mjs";
import { startHeat } from "./heats.mjs";
import { lagoons } from "./lagoons.mjs";
import { board, submitHeat } from "./leaderboard.mjs";
import { heatDetail, listHeats } from "./local.mjs";
import { fail } from "./reply.mjs";
import { rider } from "./rider.mjs";

const HEAT_PATH = "/api/local/heats/";

// request: { method, path, query: URLSearchParams, body }; ctx: { store, game, now() }
export function handleApi({ method, path, query, body }, { store, game, now }) {
  const route = `${method} ${path}`;
  if (route === "POST /api/rider") return rider(body, store);
  if (route === "POST /api/heats") return startHeat(body, store, game, now());
  if (route === "GET /api/leaderboard") return board(query, store, game, now());
  if (route === "POST /api/leaderboard") return submitHeat(body, store, game, now());
  if (route === "POST /api/feedback") return feedback(body, store, now());
  if (path === "/api/lagoons" || path.startsWith("/api/lagoons/")) return lagoons(path, now());
  if (route === "GET /api/local/heats") return listHeats(query, store, game);
  if (method === "GET" && path.startsWith(HEAT_PATH)) return heatDetail(path.slice(HEAT_PATH.length), store, game);
  return { ...fail(404, "Not available in the local copy."), unknown: true };
}
