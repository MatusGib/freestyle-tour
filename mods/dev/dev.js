// Pure helpers for the developer panel, shared with the tests. A draft holds
// only changed values, as POST /api/local/dev/draft takes it: { eventWinds:
// { <event>: {…} }, venues: { <id>: {…} }, champion: {…}, tuning: {…} }. A
// field is named by its path, as the server names a refused one:
// eventWinds.378.knots, venues.<id>.windZones.gain, champion.wind.knots,
// tuning.aiTargetOffset.

// The value at a dotted path, or undefined.
export const valueAt = (source, path) => path.split(".").reduce((node, key) => node?.[key], source);

// The files' value for a field (GET /api/local/dev's files), or undefined.
export function fileValue(files, path) {
  const [part, id, ...rest] = path.split(".");
  if (part === "eventWinds") return valueAt(files.eventWinds?.events.find((e) => String(e.event) === id), rest.join("."));
  if (part === "venues") return valueAt(files.venues?.venues.find((v) => v.id === id), rest.join("."));
  return valueAt(files[part], [id, ...rest].join("."));
}

// What a field shows: the draft's value, else the files'.
export function shownValue(draft, files, path) {
  const value = valueAt(draft, path);
  return value === undefined ? fileValue(files, path) : value;
}

// A copy of the draft with the field set; setting it back to the files'
// value takes the change out, with any group it leaves empty.
export function withChange(draft, files, path, value) {
  const next = structuredClone(draft);
  const keys = path.split(".");
  const chain = [next];
  for (const key of keys.slice(0, -1)) chain.push((chain.at(-1)[key] ??= {}));
  chain.at(-1)[keys.at(-1)] = value;
  if (value === fileValue(files, path)) {
    delete chain.at(-1)[keys.at(-1)];
    for (let i = keys.length - 2; i >= 0; i--) if (!Object.keys(chain[i + 1]).length) delete chain[i][keys[i]];
  }
  return next;
}

// How many values a draft changes.
export const changeCount = (draft) => (draft && typeof draft === "object" ? Object.values(draft).reduce((sum, child) => sum + changeCount(child), 0) : 1);
