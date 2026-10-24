# Sub-project 3a: PWA rider and event data

Part of the roadmap in `docs/roadmap.md`. Tournament mode (sub-project 3) is built
in three pieces, each with its own spec: this one (rider and event data), then AI
riders, then the tournament mod. This piece changes nothing in the game, the mods
or the local server. It adds a data tool and the data it builds.

## Goal

A re-runnable tool that reads the PWA World Tour site and builds a committed
dataset of every PWA freestyle event from 2006 to 2026, men and women:

- the events: name, dates, location
- each event's entries: real name, pseudonym, sail number, final place, points
- each event's elimination ladders, heat by heat, where the site has them
- a Glicko-2 rating for every rider going into every event they entered

## Decisions

| Topic | Decision |
|---|---|
| Order of the tournament pieces | Data first, then AI riders, then the tournament mod |
| Real names | Committed alongside the pseudonyms (the repo is private). The game only ever shows pseudonyms |
| Rider strength | Each rider's form going into that event, built from all results before it. A 2012 event pits you against riders as they were in 2012 |
| Rating model | Glicko-2, one rating period per event |
| Seasons | 2006 (the first season the site lists) to 2026 |
| Divisions | Freestyle Men and Freestyle Women, rated separately |
| Pseudonyms | A fixed rule changes one letter in each name (Balz Müller becomes Balt Möller), with hand fixes in a committed file |

## Success criteria

1. `npm run tour-data` builds `tour/` from the site. Its summary lists, per
   season, the events, entries and ladder heats found. Running it again with
   `--offline` gives byte-identical files.
2. Every entry has a rider id. At least 99% of ladder sailors are matched to an
   entry of their event; the rest are listed in the summary.
3. Every rider has a pseudonym. Pseudonyms are unique, none equals any rider's
   real name, and Balz Müller is Balt Möller.
4. `tour/ratings.json` gives every entry its rider's rating going into the event.
   With those ratings, the higher-rated rider wins at least 65% of the 2022–2026
   ladder heats.
5. `npm test` passes, and the game, mods and server are unchanged.

## Out of scope

- Turning ratings into heat scores in the game, and the AI riders themselves
  (piece 3b).
- The tournament mod: picking events, ladders you play, points (piece 3c).
- Nations, flags, sponsors and equipment.
- What each venue is like (sub-project 4). This piece only stores each event's
  location as the site gives it.
- Events before 2006.

## Sources

All on pwaworldtour.com, checked on 2026-10-24:

| Page | What it gives |
|---|---|
| `/events/<year>/` | Links to every event of the season, `/events/detail/<slug>/` |
| `/events/detail/<slug>/` | Name, dates (`Jul 18 - Jul 27 2025`), disciplines (`Men Freestyle, Women Freestyle, …`), location (`Sotavento, Fuerteventura`), and links to the event's results and ladders, which carry the event's numeric id |
| `/events/results/results/<id>?type=24` | One tab link per division (`Freestyle Men`, `Freestyle Women`, slalom and wave tabs). A tab's page lists place, name, sail number, eliminations, final and points. An event with one discipline has no tabs: the page shows that discipline's table, and the event page names the discipline |
| `/events/elimination-ladder/elimination-ladders/<id>?type=25` | Links to each of the event's ladders, titled like `Mens 2025 Fuerteventura Grand Slam Mens Freestyle elimination(double)` |
| A ladder's page | The ladder as XML in the page (`ladderXml`): sex, discipline (missing in older seasons), rounds, heats, and for each sailor the surname, sail number and place. Places rank the sailors of a heat: 2025 ladders give the winner 1 and the loser 0, 2014 ladders give 1 and 2. Heats not sailed have empty places |

What the site has:

- Final placings for events from 2006 on. Some divisions have no results; their
  tab says so. Some old ones list every place as 0.
- Ladders from 2014 on. Earlier events have placings only.
- No heat scores, for any year.
- Ladders name sailors by surname only, sometimes without accents (`Muller`,
  `SUI-21`), and a sail number can differ from the one in the results.
- Nicknames appear in quotes (`Jose "Gollito" Estredo`) or brackets
  (`Elton (Taty) Frans`).
- Points follow the PWA table (10000, 8500, 7650, 6885…, tied places share
  the average).
- Some results pages fail with a server error every time (the 2025 Margaret
  River Wave Classic answers 500).

Tab and ladder links include a `cHash` parameter. The tool follows the links as
the pages give them and never builds these URLs itself.

## Approach

Crawl politely into a local cache, parse each page type with a small pure parser,
resolve riders across events, then run Glicko-2 over the events in date order.

We considered Elo (simpler, but no measure of how sure a rating is, so newcomers
and comebacks swing too much or too little) and one Bradley–Terry fit per season
(steadier, but form can't change within a season, and it needs an iterative
solver). Glicko-2 gives each rider a deviation that shrinks with results and
grows while they are away, which suits a tour where riders come and go.

## Components

### Crawler (`lib/pwa/crawl.mjs`)

- `createCrawler({ cacheDir, offline, fetch })` returns `get(url, { fresh })`.
  It resolves to the page's text.
- Pages are cached in the git-ignored `cache/pwa/`, one file per URL. A cached
  page is read from disk. Otherwise the crawler downloads it, one request at a
  time, at least 1 second after the previous request, with a User-Agent naming
  the tool. Failed requests are never cached.
- `fresh` downloads a cached page again, once per run. The tool passes it for
  every page of the seasons named by `--refresh` (a season, like `2026`, or
  `all`), from the season listing down. `offline` never downloads; a page
  missing from the cache is an error.
- Downloads resume where they stopped, because every finished page is already
  in the cache.

### Parsers (`lib/pwa/parse.mjs`)

Pure functions from page text to plain data. Each throws an error naming the URL
and what was missing when a page doesn't have the expected shape.

- `parseSeason(html)`: the event detail slugs.
- `parseEvent(html)`: `{ id, name, start, end, location, disciplines, resultsUrl, laddersUrl }`.
  Dates are ISO (`2025-07-18`). The year on the page belongs to the end date; a
  start month later than the end month means the start is in the year before.
- `parseResultTabs(html)`: `[{ label, url }]`, `[]` on a page without tabs.
- `parseResults(html)`: `[{ place, name, sailNumber, points }]`, or `[]` when
  the page says there are no results. Names are decoded from HTML (`&quot;` and
  the like).
- `placesFromPoints(entries)`: for a division whose places are all 0, places
  from the points, highest first, equal points sharing a place.
- `parseLadderIndex(html)`: `[{ title, url }]`.
- `parseLadder(html)`: `{ title, sex, discipline, double, rounds: [[{ heat, sailors: [{ surname, sailNumber, place }] }]] }`.
  Only sailed heats are kept: two or more named sailors, each with a place.
  `discipline` is null when the XML has none. `double` is true when the title
  ends in `(double)`.

### Riders (`lib/pwa/riders.mjs`)

- **Name key:** the real name with nicknames (in quotes or brackets) removed,
  accents removed, lower case, words joined by `-`: `Jose "Gollito" Estredo`
  becomes `jose-estredo`.
- **Rider id:** the division's letter and the name key, `m:balz-muller` or
  `w:…`. `tour/aliases.json` maps an id to the one it should merge into, for
  riders whose name is spelt differently across seasons.
- **Matching ladder sailors** to the entries of the same event and division:
  the same sail number first, then the same surname with accents and case
  ignored. Ladders have typos and cut-off sail numbers, so a surname of five
  letters or more may be one letter off (`Wieczzorek` finds Wieczorek), and
  two entries with the same surname are told apart by a sail number that
  starts with the sailor's (`Sugi J-` finds Takuma Sugi, `J-7`). A sailor still
  unmatched (or matching two entries) is listed in the
  summary and kept as published, `{ surname, sailNumber }`. Heats with an
  unmatched sailor are left out of the ratings.
- **Heat ranks:** each heat's places become ranks. Positive places rank the
  sailors (1 is best), 0 comes after every positive place, and equal places
  tie. So 1 and 0, and 1 and 2, both mean the first sailor won.
- **Possible duplicates** are listed in the summary for a person to check: one
  sail number under two ids within two seasons, or two ids with the same surname
  and first initial.

### Pseudonyms (`lib/pwa/pseudonym.mjs`)

`candidates(name)` drops nicknames, then changes one letter in the first
name (the first word) and one in the surname (the last word, so `Van der Eyken`
changes `Eyken`). A one-word name gets only the surname change. Letters keep their
case.

- **First name:** the last letter changes:

  | From | z | t | d | s | n | m | r | l | k | c | x | b | p | g | f | v | j | w | y | a | o | e | i | u |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | To | t | d | t | z | m | n | l | r | c | k | s | p | b | k | v | f | y | v | i | o | a | a | y | o |

  A letter not in the table (like `h`) is skipped, and the letter before it
  changes instead.
- **Surname:** the first vowel changes:

  | From | a | e | i | o | u | y | ä | ö | ü | á | é | í | ó | ú |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | To | e | a | y | u | o | i | e | ü | ö | e | a | y | u | o |

- **Clashes:** if the result equals another rider's pseudonym or any rider's real
  name, the surname's next vowel changes instead, then the first name's
  next-to-last letter, then both. A clash left after that stops the run, naming
  both riders.
- **Hand fixes:** `tour/pseudonyms.json` maps a rider id to the pseudonym to use.
  Fixes are checked for clashes like generated pseudonyms.

Examples: Balz Müller → Balt Möller, Lennart Neubauer → Lennard Naubauer,
Antony Ruenes → Antoni Roenes.

### Glicko-2 (`lib/pwa/glicko.mjs`)

Glickman's Glicko-2 (2012), with weighted games:

- `newRider(startRating)`: `{ rating: startRating, rd: 350, volatility: 0.06 }`.
- `ratePeriod(rider, games, tau)`: `games` is `[{ opponent, score, weight }]`, with
  `score` 1, 0.5 or 0 and the opponent's rating going into the period. The
  variance and improvement sums multiply each game by its weight. With no games,
  only the deviation grows (`φ* = √(φ² + σ²)`), capped at 350.
- `winChance(a, b)`: the chance that `a` beats `b`, using both riders'
  deviations, `1 / (1 + exp(−g(√(φa² + φb²)) · (μa − μb)))`.

### Ratings (`lib/pwa/ratings.mjs`)

- Events run in order of start date, then event id. Each event is one rating
  period for each of its divisions.
- **Games from ladders:** in every heat whose sailors are all matched, each
  sailor beats each sailor ranked behind them, with weight 1. A rider and
  opponent who meet in both the single and double ladder play two games.
- **Games from placings:** a division with no freestyle ladder for that event
  uses its final places instead. Every pair of riders with different places is
  a game the better-placed one wins, with weight `w / (n − 1)`, where `n` is the
  number of entries and `w` the placings weight. So each rider's event counts
  like `w` heats.
- **Riders who miss an event** of their division have their deviation grown for
  that period.
- **Newcomers** start at the newcomer rating, deviation 350, volatility 0.06.
- **Rating going into an event** is the rider's rating, deviation and volatility
  just before that event's period.
- **Tuning:** every build tries τ from {0.3, 0.5, 0.75, 1.0}, the newcomer rating
  from {1300, 1400, 1500} and `w` from {2, 4, 6}, 36 runs in all, and keeps the
  one with the lowest mean log loss on 2014–2021 ladder heats, each heat
  predicted with `winChance` from ratings going into its event. Ties go to the
  first in that order, so builds stay repeatable. The chosen values are written
  into `ratings.json`.
- **Check:** on 2022–2026 ladder heats, the share of heats won by the
  higher-rated rider (equal ratings count as half), and the mean log loss. Both
  go into the summary and `ratings.json`. The bar is 65%. If the data falls
  short, the build stops and reports it; the bar is not lowered quietly.

### The tool (`tools/pwa.mjs`)

`npm run tour-data -- [--refresh <season|all>] [--offline]`

1. For each season 2006–2026: read the season listing, each event page, and the
   results page. Keep events with a tab named exactly `Freestyle Men` or
   `Freestyle Women` that has results, or with no tabs and one discipline,
   `Men Freestyle` or `Women Freestyle`. That leaves out foil freestyle, youth,
   slalom and wave events.
2. Read those tabs, the ladder index, and the ladders whose link title contains
   `freestyle` but not `foil`. Keep those whose XML discipline is `freestyle`,
   or that have none. A ladder belongs to the division its XML `sex` names. A
   ladder index without links may hold its one ladder itself; that one is used.
3. Resolve riders, make pseudonyms, tune and run the ratings.
4. Write `tour/` only after every step has succeeded.
5. Print the summary: per season, events, entries and ladder heats; divisions
   that had no results; unmatched ladder sailors; possible duplicates; the
   tuned values, hit rate and log loss.

Steps 1 and 2 live in `lib/pwa/collect.mjs` and the file layout in
`lib/pwa/files.mjs`, so both can be tested without the network. `package.json`
gets `"tour-data": "node tools/pwa.mjs"`. `.gitignore` gets `cache/`.

## Data files (`tour/`)

All JSON, sorted and pretty-printed, so re-runs give identical files and diffs
stay readable.

- **`seasons/<year>.json`**, built by the tool:

  ```json
  {
    "season": 2025,
    "events": [{
      "id": 375,
      "slug": "2025-fuerteventura-grand-slam",
      "name": "2025 Fuerteventura Grand Slam ******",
      "start": "2025-07-18",
      "end": "2025-07-27",
      "location": "Sotavento, Fuerteventura",
      "divisions": {
        "men": {
          "entries": [{ "rider": "m:yentel-caers", "name": "Yentel Caers", "sailNumber": "B-16", "place": 1, "points": 10000 }],
          "ladders": [{
            "title": "Mens 2025 Fuerteventura Grand Slam Mens Freestyle elimination",
            "double": false,
            "rounds": [[{ "heat": "1 a", "riders": ["m:antoine-albert", "m:nicolo-di-marco"], "ranks": [1, 2] }]]
          }]
        }
      }
    }]
  }
  ```

  Entries are in place order, then by name. An unmatched ladder sailor appears
  in `riders` as `{ "surname": "…", "sailNumber": "…" }`.
- **`riders.json`**, built: `[{ id, division, name, pseudonym, sailNumbers }]`,
  by id. `sailNumbers` lists every sail number the rider used, newest first.
- **`ratings.json`**, built:
  `{ "settings": { tau, newcomerRating, placingsWeight }, "check": { heats, hitRate, logLoss }, "events": { "<event id>": { "men": { "<rider id>": { rating, rd, volatility } } } } }`.
- **`aliases.json`** and **`pseudonyms.json`**, kept by hand, start as `{}`.

## Errors

- **A page with an unexpected shape** stops the run with the URL and what was
  missing. Nothing is written.
- **An HTTP error on a season listing or an event page** stops the run.
- **An HTTP error on a results page, a division tab, a ladder index or a
  ladder** skips that page and notes it in the summary. One broken wave event
  shouldn't block the build, and errors aren't cached, so the next run tries
  the page again.
- **A season or event with nothing for freestyle** is skipped without a note,
  because most events on the site are slalom, wave or youth events.
- **A division whose places are all 0** (some old events list results that way)
  takes its places from the points, highest first, equal points sharing a
  place. The summary lists these divisions.

## Testing

- **Parsers:** each page type on trimmed copies of real pages in
  `test/fixtures/pwa/`, from 2006, 2008, 2012, 2014 and 2025 events: the 2025
  Fuerteventura men's results and ladder, a page with no results, a page with
  no ladders, a one-discipline event without tabs, and a 2014 ladder.
- **Dates:** `Jul 18 - Jul 27 2025` and a range across New Year.
- **Glicko-2:** Glickman's worked example: a 1500 / 200 / 0.06 rider who beats a
  1400 / 30 rider and loses to 1550 / 100 and 1700 / 300, with τ 0.5, ends at
  1464.06 / 151.52 / 0.05999. Weights of 1 give the same result as no weights.
  A period with no games only grows the deviation, and never past 350.
- **Pseudonyms:** the examples above, a one-word name, a nickname, a name with a
  particle, a clash that moves to the next letter, a clash that can't be solved,
  and a hand fix.
- **Riders:** `Muller, SUI-21` matches Balz Müller's entry. Matching by surname
  when the sail number changed. Aliases merge two ids. Possible duplicates are
  found.
- **Ratings:** a rating going into an event leaves that event out. A rider who
  misses an event comes back with a wider deviation. Placings games add up to
  `w` heats per rider. Ladder heats with an unmatched sailor are left out.
- **Crawler:** with a stand-in fetch: cached pages aren't downloaded again,
  requests are at least 1 second apart, `offline` fails on a missing page, and
  `refresh` downloads only the chosen season.
- **The committed data** (`test/tour-data.test.mjs`):
  - rider ids and pseudonyms are unique
  - no pseudonym equals a real name
  - every entry's rider is in `riders.json` and has a rating going into the
    event
  - at most 1% of ladder sailors are unmatched
  - the check in `ratings.json` is at least 65%

## Risks

- **Older pages may be laid out differently.** The parser fixtures cover four
  seasons, and an unexpected shape stops the run instead of writing bad data.
- **Names change over the years** (nicknames, second surnames, spelling). The
  possible-duplicates list and `aliases.json` handle it, but someone has to read
  the list once.
- **The 2006–2013 ratings rest on placings only,** so they are less sharp than
  later ones.
- **The 65% bar may not be met.** Freestyle has dominant riders, so a hit rate
  around 70% is likely, but it is unmeasured. If it falls short, we decide
  together what to change.
- **The site may slow down or block the crawl.** It is about 2,000 pages, one per
  second, cached, and resumable.
- **Some generated pseudonyms will read oddly** (Steven → Stevem). They are fixed
  in `pseudonyms.json` after reading the list in `riders.json`.
