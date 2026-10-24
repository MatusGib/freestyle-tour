// Recognisable but changed names: one letter changes in the first name and one
// in the surname, so Balz Müller becomes Balt Möller.
import { NICKNAME, nameKey } from "./riders.mjs";

// The first name's last letter that is in this table changes.
const FIRST = { z: "t", t: "d", d: "t", s: "z", n: "m", m: "n", r: "l", l: "r", k: "c", c: "k", x: "s", b: "p", p: "b", g: "k", f: "v", v: "f", j: "y", w: "v", y: "i", a: "o", o: "a", e: "a", i: "y", u: "o" };
// The surname's first vowel changes.
const VOWEL = { a: "e", e: "a", i: "y", o: "u", u: "o", y: "i", ä: "e", ö: "ü", ü: "ö", á: "e", é: "a", í: "y", ó: "u", ú: "o" };

// Positions in word of the letters table can change, in reading order.
const changeable = (word, table) => [...word].flatMap((letter, i) => (letter.toLowerCase() in table ? [i] : []));

// word with the letter at i changed through table, keeping its case.
function swap(word, i, table) {
  const letters = [...word];
  const lower = letters[i].toLowerCase();
  letters[i] = letters[i] === lower ? table[lower] : table[lower].toUpperCase();
  return letters.join("");
}

// The pseudonyms to try for a name, best first: the first name's last
// changeable letter with the surname's first vowel, then the surname's second
// vowel, then the first name's next-to-last letter, then both. Nicknames are
// dropped; a one-word name only gets the surname change.
export function candidates(name) {
  const words = name.normalize("NFC").replace(NICKNAME, " ").trim().split(/\s+/);
  const last = words.length - 1;
  const surnames = changeable(words[last], VOWEL).slice(0, 2).map((i) => swap(words[last], i, VOWEL));
  const lasts = surnames.length ? surnames : [words[last]];
  if (!last) return lasts.filter((n) => n !== words[0]);
  const firstNames = changeable(words[0], FIRST).reverse().slice(0, 2).map((i) => swap(words[0], i, FIRST));
  const firsts = firstNames.length ? firstNames : [words[0]];
  const names = [[0, 0], [0, 1], [1, 0], [1, 1]]
    .filter(([f, l]) => f < firsts.length && l < lasts.length)
    .map(([f, l]) => [firsts[f], ...words.slice(1, last), lasts[l]].join(" "));
  return [...new Set(names)].filter((n) => n !== words.join(" "));
}

// A pseudonym for every rider (riders in id order): their hand fix, or the
// first candidate that is neither another rider's pseudonym nor any rider's
// real name. Returns a Map from rider id to pseudonym.
export function assignPseudonyms(riders, fixes = {}) {
  const ids = new Set(riders.map((r) => r.id));
  for (const id of Object.keys(fixes)) if (!ids.has(id)) throw new Error(`tour/pseudonyms.json names ${id}, who is not a rider`);
  const realNames = new Map(riders.map((r) => [nameKey(r.name), r.id]));
  const taken = new Map();
  const pseudonyms = new Map();
  // The rider a pseudonym would clash with, or null.
  const clash = (rider, name) => {
    const key = nameKey(name);
    const holder = taken.get(key);
    return holder && holder !== rider.id ? holder : realNames.get(key) ?? null;
  };
  const claim = (rider, name) => {
    taken.set(nameKey(name), rider.id);
    pseudonyms.set(rider.id, name);
  };
  for (const rider of riders) {
    if (!fixes[rider.id]) continue;
    const other = clash(rider, fixes[rider.id]);
    if (other) throw new Error(`the pseudonym fix for ${rider.id} (${fixes[rider.id]}) clashes with ${other}`);
    claim(rider, fixes[rider.id]);
  }
  for (const rider of riders) {
    if (pseudonyms.has(rider.id)) continue;
    const options = candidates(rider.name);
    const free = options.find((name) => !clash(rider, name));
    if (!free) {
      const tried = options.map((name) => `${name} (${clash(rider, name)})`).join(", ") || "none";
      throw new Error(`no free pseudonym for ${rider.id} (${rider.name}); tried ${tried}. Add one to tour/pseudonyms.json`);
    }
    claim(rider, free);
  }
  return pseudonyms;
}
