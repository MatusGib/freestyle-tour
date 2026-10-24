// Builds tour/ from the PWA World Tour site: every freestyle event 2006–2026
// with its entries and ladders, riders under pseudonyms, and a Glicko-2 rating
// for each rider going into each event. Pages are cached in cache/pwa/.
//   npm run tour-data -- [--refresh <season|all>] [--offline]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { collect, FIRST_SEASON, LAST_SEASON } from "../lib/pwa/collect.mjs";
import { createCrawler } from "../lib/pwa/crawl.mjs";
import { tourFiles } from "../lib/pwa/files.mjs";
import { assignPseudonyms } from "../lib/pwa/pseudonym.mjs";
import { BAR, buildRatings, CHECK_SEASONS } from "../lib/pwa/ratings.mjs";
import { possibleDuplicates, resolveEvents } from "../lib/pwa/riders.mjs";

// Everything from raw events to the files, without the network or the disk.
export function buildTour(rawEvents, { aliases = {}, fixes = {} } = {}) {
  const { events, riders, unmatched } = resolveEvents(rawEvents, aliases);
  const pseudonyms = assignPseudonyms(riders, fixes);
  const ratings = buildRatings(events);
  const files = tourFiles({ events, riders, pseudonyms, ratings });
  return { files, events, riders, unmatched, duplicates: possibleDuplicates(events, riders), ratings };
}

const percent = (share) => `${(share * 100).toFixed(1)}%`;

export function summarize({ events, unmatched, duplicates, ratings }, notes) {
  const lines = ["Season  events  entries  ladder heats"];
  const seasons = [...new Set(events.map((e) => e.season))];
  let sailors = 0;
  for (const season of seasons) {
    const divisions = events.filter((e) => e.season === season).flatMap((e) => Object.values(e.divisions));
    const heats = divisions.flatMap((d) => d.ladders.flatMap((l) => l.rounds.flat()));
    sailors += heats.reduce((sum, h) => sum + h.riders.length, 0);
    lines.push(`${season}    ${String(events.filter((e) => e.season === season).length).padStart(6)}  ${String(divisions.reduce((sum, d) => sum + d.entries.length, 0)).padStart(7)}  ${String(heats.length).padStart(12)}`);
  }
  const noLadder = events.filter((e) => e.season >= 2014).flatMap((e) => Object.entries(e.divisions).filter(([, d]) => !d.ladders.length).map(([name]) => `${e.name}: ${name}`));
  lines.push("", `Divisions from 2014 on without a freestyle ladder (${noLadder.length}):`, ...noLadder.map((n) => `  ${n}`));
  lines.push("", `Notes (${notes.length}):`, ...notes.map((n) => `  ${n}`));
  lines.push("", `Unmatched ladder sailors: ${unmatched.length} of ${sailors} (${percent(unmatched.length / Math.max(sailors, 1))})`, ...unmatched.map((u) => `  event ${u.event} ${u.division} heat ${u.heat}: ${u.surname} ${u.sailNumber}`));
  lines.push("", `Possible duplicates (${duplicates.length}):`, ...duplicates.map((d) => `  ${d.a} / ${d.b}: ${d.reason}`));
  const { settings, check } = ratings;
  lines.push("", `Ratings: tau ${settings.tau}, newcomers ${settings.newcomerRating}, placings worth ${settings.placingsWeight} heats`);
  lines.push(`Check on ${CHECK_SEASONS.join("–")}: favourite won ${percent(check.hitRate)} of ${check.heats} heats, log loss ${check.logLoss} (bar ${percent(BAR)})`);
  return lines.join("\n");
}

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});

async function main() {
  const { values } = parseArgs({ options: { refresh: { type: "string" }, offline: { type: "boolean", default: false } } });
  if (values.refresh !== undefined && values.offline) throw new Error("--refresh and --offline can't be used together");
  const refresh = values.refresh === undefined ? null : values.refresh === "all" ? "all" : Number(values.refresh);
  if (Number.isNaN(refresh)) throw new Error(`--refresh takes a season or "all", not "${values.refresh}"`);
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tour = join(root, "tour");
  const crawler = createCrawler({ cacheDir: join(root, "cache", "pwa"), offline: values.offline });
  const seasons = Array.from({ length: LAST_SEASON - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON + i);
  const { events, notes } = await collect(crawler, { seasons, refresh, log: (line) => console.log(line) });
  const built = buildTour(events, { aliases: readJson(join(tour, "aliases.json")), fixes: readJson(join(tour, "pseudonyms.json")) });
  console.log(`\n${summarize(built, notes)}\n`);
  if (built.ratings.check.hitRate < BAR) {
    throw new Error(`The favourite won ${percent(built.ratings.check.hitRate)} of ${CHECK_SEASONS.join("–")} heats, below the ${percent(BAR)} bar. Nothing was written.`);
  }
  for (const [path, text] of Object.entries(built.files)) {
    const out = join(tour, path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
  }
  for (const name of ["aliases.json", "pseudonyms.json"]) if (!existsSync(join(tour, name))) writeFileSync(join(tour, name), "{}\n");
  console.log(`Wrote ${Object.keys(built.files).length} files to tour/ (${crawler.downloads} pages downloaded)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
