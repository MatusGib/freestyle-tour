// Keeps feedback-form messages on this computer instead of sending them.
import { ok } from "./reply.mjs";

export function feedback(body, store, now) {
  store.update((d) => void d.feedback.push({ id: body.id ?? null, message: String(body.message ?? ""), contact: String(body.contact ?? ""), at: now }));
  return ok({ ok: true });
}
