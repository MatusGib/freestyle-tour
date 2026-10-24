// Parsers for the PWA World Tour pages the data tool reads. Each takes a page's
// text and returns plain data. They throw, saying what was missing, when a page
// doesn't have the expected shape; the caller adds the URL.

const ENTITIES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

// Decodes until nothing changes, because some pages encode twice
// ("Alaçat&amp;#305;").
export function decodeHtml(text) {
  const decoded = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
    return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
  });
  return decoded === text ? text : decodeHtml(decoded);
}

// Text without tags or entities, with runs of white space as one space.
const clean = (html) => decodeHtml(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const NO_ENTRIES = 'class="no-entries-found-msg"';

// The event pages a season listing links to, as slugs.
export function parseSeason(html) {
  return [...new Set([...html.matchAll(/class="event-calendar-link" href="\/events\/detail\/([^"/]+)\/"/g)].map((m) => m[1]))];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Jul 18 - Jul 27 2025" as ISO dates. The year belongs to the end date, so a
// start month later than the end month is in the year before.
export function parseDates(text) {
  const m = text.match(/^([A-Z][a-z]{2}) (\d{1,2})(?: - ([A-Z][a-z]{2}) (\d{1,2}))? (\d{4})$/);
  const [startMonth, endMonth] = m ? [MONTHS.indexOf(m[1]), MONTHS.indexOf(m[3] ?? m[1])] : [-1, -1];
  if (startMonth < 0 || endMonth < 0) throw new Error(`unreadable dates "${text}"`);
  const year = Number(m[5]);
  const iso = (y, month, day) => `${y}-${String(month + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  return { start: iso(startMonth > endMonth ? year - 1 : year, startMonth, m[2]), end: iso(year, endMonth, m[4] ?? m[2]) };
}

export function parseEvent(html) {
  const name = html.match(/<h1>([\s\S]*?)<\/h1>/);
  const date = html.match(/<span class="date">\s*<span class="label">Date: <\/span>([\s\S]*?)<\/span>/);
  if (!name) throw new Error("missing the event name (<h1>)");
  if (!date) throw new Error("missing the event dates");
  const location = html.match(/<span class="event-location"><span class="label">Location: <\/span>([\s\S]*?)<\/span>/);
  const disciplines = html.match(/<span class="event-disciplines"><span class="label">Disciplines: <\/span>([\s\S]*?)<\/span>/);
  const results = html.match(/href="(\/events\/results\/results\/(\d+)\?type=24)"/);
  const ladders = html.match(/href="(\/events\/elimination-ladder\/elimination-ladders\/\d+\?type=25)"/);
  return {
    id: results ? Number(results[2]) : null,
    name: clean(name[1]),
    ...parseDates(clean(date[1])),
    location: location ? clean(location[1]) : "",
    disciplines: disciplines ? disciplines[1].split(",").map(clean).filter(Boolean) : [],
    resultsUrl: results?.[1] ?? null,
    laddersUrl: ladders?.[1] ?? null,
  };
}

// The division tabs of a results page: [{ label, url }].
export function parseResultTabs(html) {
  return [...html.matchAll(/<a class="get-from-ajax[^"]*" href="([^"]*eventDiscipline[^"]*)">([\s\S]*?)<\/a>/g)].map((m) => ({ label: clean(m[2]), url: decodeHtml(m[1]) }));
}

// The entries of the division a results page shows, or [] when it has none.
export function parseResults(html) {
  if (html.includes(NO_ENTRIES)) return [];
  const table = html.match(/<table>([\s\S]*?)<\/table>/);
  if (!table) throw new Error("missing the results table");
  return table[1].split("<tr>").filter((row) => row.includes('class="rank-no"')).map((row) => {
    const cell = (cls) => {
      const m = row.match(new RegExp(`<(td|div) class="${cls}">([\\s\\S]*?)</\\1>`));
      if (!m) throw new Error(`a results row is missing ${cls}`);
      return clean(m[2]);
    };
    return { place: Number(cell("rank-no")) || 0, name: cell("rank-name"), sailNumber: cell("rank-sail-number"), points: Number(cell("rank-total-points")) || 0 };
  });
}

// Some old results list every place as 0. Their places then come from the
// points, highest first, with equal points sharing a place.
export function placesFromPoints(entries) {
  const sorted = [...entries].sort((a, b) => b.points - a.points);
  return sorted.map((entry) => ({ ...entry, place: 1 + sorted.filter((other) => other.points > entry.points).length }));
}
