// The files under tour/ that the data tool builds, as { path: text }.

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// events: resolved events in date order; riders: by id; pseudonyms: Map from
// rider id; ratings: what buildRatings returns.
export function tourFiles({ events, riders, pseudonyms, ratings }) {
  const seasons = new Map();
  for (const { season, ...event } of events) seasons.set(season, [...(seasons.get(season) ?? []), event]);
  const files = {};
  for (const season of [...seasons.keys()].sort((a, b) => a - b)) files[`seasons/${season}.json`] = json({ season, events: seasons.get(season) });
  files["riders.json"] = json(riders.map((r) => ({ id: r.id, division: r.division, name: r.name, pseudonym: pseudonyms.get(r.id), sailNumbers: r.sailNumbers })));
  files["ratings.json"] = json(ratings);
  return files;
}
