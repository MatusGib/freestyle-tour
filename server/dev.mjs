// The data the developer panel changes (event winds, venues, the champion and
// the AI's tuning) as their files have it, with the panel's draft laid over
// it. The draft is kept in data/ (git-ignored), so the repo's files change
// only when it is written to them. The server's readers all ask values().
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { checkEventWinds, indexEventWinds } from "./event-winds.mjs";
import { problem } from "./problem.mjs";
import { NO_TUNING, checkTuning } from "./tuning.mjs";
import { indexVenueCatalog } from "./venues.mjs";
import { checkChampion } from "./weekly.mjs";

// Each part's file, from the repo's root, as the panel names them.
export const DATA_FILES = { eventWinds: "tour/event-winds.json", venues: "tour/venues.json", champion: "server/champion.json", tuning: "server/tuning.json" };

// The layout the data files are kept in, so a write's diff shows only the
// values that changed.
export const formatJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const read = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
const NO_WINDS = { version: 1, events: [] };

// The files' data with a draft laid over it, and the parts of the draft for
// events or venues no longer in the files. draft: { eventWinds: { <event>:
// { knots, gustKnots, confidence, reported } }, venues: { <id>: {
// gameConditions, windZones, windPatch } }, champion: { wind, target }, tuning: {
// aiTargetOffset } }, holding only changed values. An event without an entry
// gets one, inferred.
export function overlay(files, draft, tour) {
  const dropped = [];
  const eventWinds = structuredClone(files.eventWinds ?? NO_WINDS);
  for (const [id, change] of Object.entries(draft.eventWinds ?? {})) {
    const event = tour?.events.get(Number(id));
    if (!event) {
      dropped.push(`eventWinds.${id}`);
      continue;
    }
    let entry = eventWinds.events.find((e) => e.event === event.id);
    if (!entry) eventWinds.events.push((entry = { event: event.id, slug: event.slug, knots: null, gustKnots: 0, reported: "Set in the developer panel", confidence: "inferred", sources: [] }));
    Object.assign(entry, change);
  }
  const venues = structuredClone(files.venues);
  for (const [id, change] of Object.entries(draft.venues ?? {})) {
    const venue = venues?.venues.find((v) => v.id === id);
    if (!venue) {
      dropped.push(`venues.${id}`);
      continue;
    }
    if (change.gameConditions) Object.assign(venue.gameConditions, change.gameConditions);
    if (change.windZones) venue.windZones = { ...venue.windZones, ...change.windZones };
    if (change.windPatch) venue.windPatch = { ...venue.windPatch, ...change.windPatch };
  }
  const champion = { ...structuredClone(files.champion), ...draft.champion, wind: { ...files.champion?.wind, ...draft.champion?.wind } };
  const tuning = { ...(files.tuning ?? NO_TUNING), ...draft.tuning };
  return { data: { eventWinds, venues, champion, tuning }, dropped };
}

// paths: each part's file ({ eventWinds, venues, champion, tuning }).
// draftStore: createStore(file, { draft: {} }), or null with the dev mod off,
// when the files' values hold. Broken files throw, so the server refuses to
// start. A saved draft that no longer fits is set aside (problem()) until the
// panel sends one that does.
export function createDevData({ paths, tour, draftStore = null, log = console.log }) {
  let files;
  let current;
  let setAside = null;
  const load = () => {
    files = Object.fromEntries(Object.entries(paths).map(([part, file]) => [part, read(file)]));
    if (!files.eventWinds) log(`No ${paths.eventWinds}: events sail in their venue's usual wind.`);
  };
  // Lays the draft over the files and checks the lot; throws a problem() at
  // the first broken field, naming its file as the repo does.
  const build = (draft) => {
    const { data, dropped } = overlay(files, draft, tour);
    if (tour) checkEventWinds(data.eventWinds, tour, DATA_FILES.eventWinds);
    const values = {
      eventWinds: tour ? indexEventWinds(data.eventWinds) : null,
      venues: data.venues && indexVenueCatalog(data.venues, DATA_FILES.venues),
      champion: checkChampion(data.champion, DATA_FILES.champion),
      tuning: checkTuning(data.tuning, DATA_FILES.tuning),
    };
    return { data, values, dropped };
  };
  const draft = () => draftStore?.data.draft ?? {};

  load();
  current = build({});
  try {
    current = build(draft());
  } catch (error) {
    setAside = error.message;
    log(`The developer panel's draft doesn't fit the files, so it is set aside: ${error.message}`);
  }
  if (current.dropped.length) log(`The developer panel's draft changes things no longer in the files: ${current.dropped.join(", ")}`);

  return {
    values: () => current.values,
    files: () => files,
    draft,
    dropped: () => current.dropped,
    problem: () => setAside,
    // Replaces the draft if it fits; otherwise throws a problem() and keeps
    // the last good one.
    setDraft(next) {
      if (!draftStore) throw problem("draft", "The dev mod is off.");
      const built = build(next);
      draftStore.update((d) => void (d.draft = next));
      current = built;
      setAside = null;
    },
    discard() {
      draftStore?.update((d) => void (d.draft = {}));
      current = build({});
      setAside = null;
    },
    // Writes the parts the draft changes, each through a temporary file, then
    // reloads them and clears the draft. Returns the parts written. If a write
    // fails, the error lists the parts already written, and the draft is kept.
    write() {
      const changes = draft();
      const { data } = build(changes);
      const written = [];
      for (const part of Object.keys(paths)) {
        if (!changes[part] || formatJson(data[part]) === formatJson(files[part])) continue;
        try {
          writeFileSync(`${paths[part]}.tmp`, formatJson(data[part]));
          renameSync(`${paths[part]}.tmp`, paths[part]);
        } catch (error) {
          load();
          current = build(changes);
          throw Object.assign(new Error(`Couldn't write ${paths[part]}: ${error.message}`), { written });
        }
        written.push(part);
      }
      load();
      draftStore?.update((d) => void (d.draft = {}));
      current = build({});
      return written;
    },
  };
}
