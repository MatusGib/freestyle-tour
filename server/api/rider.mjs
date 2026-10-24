// Rider profiles. The copy has one local user, so passwords are never checked.
// Profiles have the shape the client validates: a v4 UUID key, a revision from
// 1, a protected flag, a nickname and an appearance object.
import { randomUUID } from "node:crypto";
import { fail, ok } from "./reply.mjs";

const NOT_FOUND = "This rider is not on this computer. Choose a nickname again.";
const profile = (r) => ({ key: r.key, revision: r.revision, protected: false, nickname: r.nickname, appearance: r.appearance });
const byKey = (data, key) => data.riders.find((r) => r.key === key);
const byName = (data, nickname) => data.riders.find((r) => r.nickname.toLowerCase() === String(nickname ?? "").toLowerCase());

export function rider(body, store) {
  const { data } = store;
  switch (body.action) {
    case "create": {
      if (byName(data, body.nickname)) return fail(409, "That nickname is taken. Log in instead.");
      const r = { key: randomUUID(), revision: 1, nickname: body.nickname, appearance: body.appearance ?? {} };
      store.update((d) => void d.riders.push(r));
      return ok({ profile: profile(r) });
    }
    case "login": {
      const r = byName(data, body.nickname);
      return r ? ok({ profile: profile(r) }) : fail(404, "No rider with that nickname.");
    }
    case "lookup": {
      const r = byName(data, body.nickname);
      return ok({ rider: r ? { nickname: r.nickname, appearance: r.appearance, protected: false } : null });
    }
    case "load": {
      const r = byKey(data, body.playerKey);
      return r ? ok({ profile: profile(r) }) : fail(401, NOT_FOUND);
    }
    case "save": {
      const r = byKey(data, body.playerKey);
      if (!r) return fail(401, NOT_FOUND);
      const next = { ...r, nickname: body.nickname ?? r.nickname, appearance: body.appearance ?? r.appearance, revision: r.revision + 1 };
      store.update((d) => {
        d.riders[d.riders.findIndex((x) => x.key === r.key)] = next;
      });
      return ok({ profile: profile(next) });
    }
    case "logout":
      return ok({});
    default:
      return fail(400, `Unknown rider action: ${body.action}`);
  }
}
