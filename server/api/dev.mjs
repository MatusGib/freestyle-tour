// Endpoints for the developer panel (the dev mod): the files' values, the
// draft and the events by venue; setting and discarding the draft; writing it
// into the repo's data files. ctx.data: createDevData().
import { DATA_FILES } from "../dev.mjs";
import { venueForLocation } from "../venues.mjs";
import { ok } from "./reply.mjs";

// The events grouped by venue, in the catalog's order, then the rest; each
// group in date order.
function eventsByVenue(tour, venues) {
  const groups = new Map((venues?.venues ?? []).map((v) => [v.id, { venue: { id: v.id, name: v.name }, events: [] }]));
  const other = { venue: null, events: [] };
  const events = [...(tour?.events.values() ?? [])].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id));
  for (const event of events) {
    const venue = venueForLocation(venues, event.location);
    (venue ? groups.get(venue.id) : other).events.push({ id: event.id, slug: event.slug, name: event.name, start: event.start });
  }
  return [...groups.values(), other].filter((group) => group.events.length);
}

export function devState({ data, tour }) {
  return ok({ files: data.files(), draft: data.draft(), dropped: data.dropped(), problem: data.problem(), events: eventsByVenue(tour, data.values().venues), dataFiles: DATA_FILES });
}

// A refused draft answers 400 with the reason and the field it is about.
export function setDraft(body, ctx) {
  try {
    ctx.data.setDraft(body ?? {});
  } catch (error) {
    if (!error.path) throw error;
    return { status: 400, body: { error: error.message, path: error.path } };
  }
  return devState(ctx);
}

export function discardDraft(ctx) {
  ctx.data.discard();
  return devState(ctx);
}

// Answers with the data files written, as the repo names them.
export function writeDraft(ctx) {
  try {
    const written = ctx.data.write().map((part) => DATA_FILES[part]);
    return ok({ ...devState(ctx).body, written });
  } catch (error) {
    return { status: 500, body: { error: error.message, written: (error.written ?? []).map((part) => DATA_FILES[part]) } };
  }
}
