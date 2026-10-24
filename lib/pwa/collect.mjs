// Reads the PWA site through a crawler into raw events: every event with
// freestyle results, its entries and its freestyle ladders, as the pages give
// them. Also returns notes for the summary.
import { parseEvent, parseLadder, parseLadderIndex, parseResultTabs, parseResults, parseSeason, placesFromPoints } from "./parse.mjs";

export const BASE = "https://www.pwaworldtour.com";
export const FIRST_SEASON = 2006;
export const LAST_SEASON = 2026;
const TABS = { "Freestyle Men": "men", "Freestyle Women": "women" };
// An event with one discipline has no tabs; its event page names the discipline.
const DISCIPLINES = { "Men Freestyle": "men", "Women Freestyle": "women" };
const SEXES = { male: "men", female: "women" };
const isFreestyle = (title) => /freestyle/i.test(title) && !/foil/i.test(title);

// refresh is a season, "all" or null; its pages are downloaded again.
export async function collect(crawler, { seasons, refresh = null, log = () => {} }) {
  const events = [];
  const notes = [];
  const ids = new Set();
  for (const season of seasons) {
    const fresh = refresh === "all" || refresh === season;
    const read = async (path, parse) => {
      const url = new URL(path, BASE).href;
      const text = await crawler.get(url, { fresh });
      try {
        return parse(text);
      } catch (error) {
        throw new Error(`${url}: ${error.message}`);
      }
    };
    // Like read, but an HTTP error is noted and gives null. Errors aren't
    // cached, so the next run tries the page again.
    const readIfThere = async (path, parse) => {
      try {
        return await read(path, parse);
      } catch (error) {
        if (!error.status) throw error;
        notes.push(`${new URL(path, BASE).href} answered ${error.status}, skipped`);
        return null;
      }
    };
    let found = 0;
    for (const slug of await read(`/events/${season}/`, parseSeason)) {
      const event = await read(`/events/detail/${slug}/`, parseEvent);
      if (!event.resultsUrl || ids.has(event.id)) continue;
      const tabs = await readIfThere(event.resultsUrl, parseResultTabs);
      if (!tabs) continue;
      const sources = tabs.filter((tab) => TABS[tab.label]).map((tab) => ({ division: TABS[tab.label], url: tab.url }));
      const only = event.disciplines.length === 1 && DISCIPLINES[event.disciplines[0]];
      if (!tabs.length && only) sources.push({ division: only, url: event.resultsUrl });
      if (!sources.length) continue;
      const divisions = {};
      for (const { division, url } of sources) {
        let entries = await readIfThere(url, parseResults);
        if (!entries?.length) {
          if (entries) notes.push(`${event.name}: no ${division}'s results`);
          continue;
        }
        if (entries.every((e) => e.place === 0)) {
          entries = placesFromPoints(entries);
          notes.push(`${event.name}: ${division}'s places taken from points`);
        }
        divisions[division] = { entries, ladders: [] };
      }
      if (!Object.keys(divisions).length) continue;
      if (event.laddersUrl) {
        const links = (await readIfThere(event.laddersUrl, parseLadderIndex)) ?? [];
        const ladders = [];
        for (const link of links.filter((l) => isFreestyle(l.title))) {
          const ladder = await readIfThere(link.url, parseLadder);
          if (ladder) ladders.push({ ...ladder, link: link.title });
        }
        // An index without links may hold its one ladder itself.
        if (!links.length) {
          const embedded = await read(event.laddersUrl, (text) => (text.includes("ladderXml = `") ? parseLadder(text) : null));
          if (embedded) ladders.push({ ...embedded, link: null });
        }
        for (const ladder of ladders) {
          // The site sometimes serves another event's slalom ladder behind a
          // freestyle link (2015 Fuerteventura).
          if (!ladder.sex || (ladder.discipline ? ladder.discipline !== "freestyle" : !isFreestyle(ladder.title))) {
            if (ladder.link) notes.push(`${event.name}: the link "${ladder.link}" gave the ladder "${ladder.title}", skipped`);
            continue;
          }
          const rounds = ladder.rounds.filter((round) => round.length);
          const division = divisions[SEXES[ladder.sex]];
          if (division && rounds.length) division.ladders.push({ title: ladder.title, double: ladder.double, rounds });
        }
      }
      ids.add(event.id);
      events.push({ season, id: event.id, slug, name: event.name, start: event.start, end: event.end, location: event.location, divisions });
      found += 1;
    }
    log(`${season}: ${found} freestyle events`);
  }
  return { events, notes };
}
