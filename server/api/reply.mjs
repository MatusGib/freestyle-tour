// Response helpers for the fake APIs. Errors carry an `error` message, which
// the client shows to the player.
export const ok = (body) => ({ status: 200, body });
export const fail = (status, error) => ({ status, body: { error } });
