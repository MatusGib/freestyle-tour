// Who is who across events: name keys and rider ids, matching ladder sailors
// to entries, heat ranks, and a list of possible duplicates for a person to check.

// Plain comparison, so the order never depends on the machine's locale.
export const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const LETTERS = { ø: "o", ß: "ss", æ: "ae", œ: "oe", đ: "d", ł: "l", ı: "i" };

// Nicknames in a name: "Gollito" in quotes, (Taty) in brackets.
export const NICKNAME = /["“”][^"“”]*["“”]|\([^)]*\)/g;

// A name without nicknames, accents or case, words joined by "-":
// Jose "Gollito" Estredo → jose-estredo.
export function nameKey(name) {
  return name
    .replace(NICKNAME, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[øßæœđłı]/g, (c) => LETTERS[c])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const DIVISION_LETTERS = { men: "m", women: "w" };

export function riderId(division, name, aliases = {}) {
  const id = `${DIVISION_LETTERS[division]}:${nameKey(name)}`;
  return aliases[id] ?? id;
}

const sailKey = (sail) => sail.toUpperCase().replace(/\s+/g, "");

// True when b is a with at most one letter added, dropped or changed.
export function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// The entry a ladder sailor is: the only one with their sail number, else the
// only one with their surname. A surname of five letters or more may be one
// letter off (ladders have typos). Two entries with the surname are told apart
// by a cut-off sail number ("J-" for "J-7"). null when nothing is unique.
export function matchSailor(sailor, entries) {
  const sail = sailor.sailNumber ? sailKey(sailor.sailNumber) : "";
  const bySail = entries.filter((e) => sail && sailKey(e.sailNumber) === sail);
  if (bySail.length === 1) return bySail[0];
  const surname = nameKey(sailor.surname);
  const words = surname.split("-").length;
  const tail = (e) => nameKey(e.name).split("-").slice(-words).join("-");
  let bySurname = entries.filter((e) => tail(e) === surname);
  if (!bySurname.length && surname.length >= 5) bySurname = entries.filter((e) => withinOneEdit(tail(e), surname));
  if (bySurname.length > 1 && sail) bySurname = bySurname.filter((e) => sailKey(e.sailNumber).startsWith(sail));
  return bySurname.length === 1 ? bySurname[0] : null;
}

// A heat's ranks from its published places: positive places rank the sailors
// (1 is best), 0 comes after every positive place, and equal places tie.
export function heatRanks(places) {
  const order = (place) => (place > 0 ? place : Infinity);
  return places.map((place) => 1 + places.filter((other) => order(other) < order(place)).length);
}

const byDate = (a, b) => byText(a.start, b.start) || a.id - b.id;

// Gives every entry a rider id and every ladder sailor the id of their entry.
// Returns the events in date order, the riders by id, and the ladder sailors
// that matched no entry (kept in their heat as { surname, sailNumber }).
export function resolveEvents(rawEvents, aliases = {}) {
  const riders = new Map();
  const unmatched = [];
  const events = [...rawEvents].sort(byDate).map((event) => {
    const divisions = {};
    for (const [division, { entries, ladders }] of Object.entries(event.divisions)) {
      const ids = new Set();
      const resolved = entries.map((entry) => {
        const id = riderId(division, entry.name, aliases);
        if (ids.has(id)) throw new Error(`${event.name}: two ${division} entries are ${id}`);
        ids.add(id);
        const rider = riders.get(id) ?? { id, division, name: entry.name, sailNumbers: [] };
        rider.name = entry.name; // events run oldest first, so this ends as the newest spelling
        rider.sailNumbers = [entry.sailNumber, ...rider.sailNumbers.filter((s) => s !== entry.sailNumber)].filter(Boolean);
        riders.set(id, rider);
        return { rider: id, name: entry.name, sailNumber: entry.sailNumber, place: entry.place, points: entry.points };
      });
      resolved.sort((a, b) => a.place - b.place || byText(a.name, b.name));
      divisions[division] = {
        entries: resolved,
        ladders: ladders.map((ladder) => ({
          title: ladder.title,
          double: ladder.double,
          rounds: ladder.rounds.map((round) => round.map(({ heat, sailors }) => ({
            heat,
            riders: sailors.map((sailor) => {
              const entry = matchSailor(sailor, resolved);
              if (entry) return entry.rider;
              unmatched.push({ event: event.id, division, heat, surname: sailor.surname, sailNumber: sailor.sailNumber });
              return { surname: sailor.surname, sailNumber: sailor.sailNumber };
            }),
            ranks: heatRanks(sailors.map((s) => s.place)),
          }))),
        })),
      };
    }
    return { ...event, divisions };
  });
  return { events, riders: [...riders.values()].sort((a, b) => byText(a.id, b.id)), unmatched };
}

// Pairs of ids that may be one person: one sail number under two ids within
// two seasons, or the same surname and first initial in a division.
export function possibleDuplicates(events, riders) {
  const pairs = new Map();
  const add = (a, b, reason) => {
    const [x, y] = [a, b].sort(byText);
    if (x !== y && !pairs.has(`${x} ${y}`)) pairs.set(`${x} ${y}`, { a: x, b: y, reason });
  };
  const sails = new Map();
  for (const event of events) {
    for (const [division, { entries }] of Object.entries(event.divisions)) {
      for (const entry of entries) {
        if (!/\d/.test(entry.sailNumber)) continue;
        const key = `${division} ${sailKey(entry.sailNumber)}`;
        const uses = sails.get(key) ?? [];
        for (const use of uses) if (Math.abs(use.season - event.season) <= 2) add(use.rider, entry.rider, `sail number ${entry.sailNumber}`);
        uses.push({ rider: entry.rider, season: event.season });
        sails.set(key, uses);
      }
    }
  }
  const names = new Map();
  for (const rider of riders) {
    const words = nameKey(rider.name).split("-");
    if (words.length < 2) continue;
    const key = `${rider.division} ${words.at(-1)} ${words[0][0]}`;
    for (const other of names.get(key) ?? []) add(other, rider.id, "same surname and first initial");
    names.set(key, [...(names.get(key) ?? []), rider.id]);
  }
  return [...pairs.values()].sort((p, q) => byText(p.a, q.a) || byText(p.b, q.b));
}
