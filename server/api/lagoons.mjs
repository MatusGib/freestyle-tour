// 1v1 needs other riders online, which a private copy never has. The lobby
// socket is told there is no relay, which makes the client switch it off, and
// lobby polls get an empty lobby so the client stays quiet.
import { fail, ok } from "./reply.mjs";

export function lagoons(path, now) {
  if (path === "/api/lagoons/lobby-connect") return ok({ relay: null });
  if (path === "/api/lagoons") return ok({ serverTime: now, room: null, riders: [], challenges: [], rankings: [] });
  return fail(404, "1v1 is unavailable in the local copy.");
}
