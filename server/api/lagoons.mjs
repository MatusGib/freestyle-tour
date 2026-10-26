// The game's 1v1 endpoints. Lobby polls and actions go to the local lobby
// (server/lagoon/lobby.mjs), which is empty until a Champion's challenge starts;
// the relay hands out tickets for its socket, and the HTTP pose exchange gets
// the AI's latest pose. The lobby socket is told there is no relay, which
// keeps the lobby itself on HTTP polling, and WebRTC signaling is unavailable.
import { fail, ok } from "./reply.mjs";

const EMPTY = { room: null, riders: [], challenges: [], rankings: [] };

const playerOf = (store, key) => {
  const rider = store.data.riders.find((r) => r.key === key);
  return { nickname: rider?.nickname ?? "Rider", appearance: rider?.appearance ?? {} };
};

// ctx: { store, now, lobby, relay } (lobby and relay are missing in some tests).
export function lagoons(path, body = {}, host, { store, now, lobby, relay }) {
  if (path === "/api/lagoons/lobby-connect") return ok({ relay: null });
  if (path === "/api/lagoons") return ok(lobby ? lobby.act(body, playerOf(store, body.playerKey)) : { serverTime: now(), ...EMPTY });
  if (path === "/api/lagoons/connect" && relay) return ok({ relay: relay.authorize(host) });
  if (path === "/api/lagoons/opponent" && relay) return ok({ opponent: relay.sample() });
  return fail(404, "1v1 is unavailable in the local copy.");
}
