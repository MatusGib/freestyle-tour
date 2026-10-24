# Sub-project 3a addendum: results from the season rankings

An addition to the rider and event data (`docs/superpowers/specs/2026-10-24-tour-data-design.md`).
Some freestyle results pages on pwaworldtour.com fail with a server error every
time, so their divisions are missing from `tour/`. The season rankings pages
list every rider's points and place at each event of the season, so they can
stand in.

## Goal

When a freestyle division's results page fails, take that division's entries
from the season rankings page instead.

## What it fills

Checked on 2026-10-24:

| Missing division | Its rankings page | Outcome |
|---|---|---|
| 2010 Sotavento Fuerteventura, men | A "Sotavento Fuerteventura" column, 38 placed riders | Filled |
| 2010 Colgate World Cup Sylt, men | A "Colgate World Cup Sylt, Germany" column, 37 placed riders | Filled |
| 2011 Podersdorf Austria, men | A "Podersdorf Austria" column, 47 placed riders | Filled |
| 2006 Sotavento, Fuerteventura, men | Shows wave riders with no event columns | Stays missing |
| 2006 Sotavento, Fuerteventura, women | Empty | Stays missing |

The tabs that say "no results" (2011 Sylt, 2015 Podersdorf, 2015 Sylt and
others) aren't gaps: their events aren't in the season's rankings either. They
are left as they are.

## Decisions

| Topic | Decision |
|---|---|
| When to use the rankings | Only when a freestyle division's results can't be read because a page answers an HTTP error |
| Which divisions | A failing tab: that tab's division. A failing results page: the freestyle divisions the event page lists (`Men Freestyle`, `Women Freestyle`) |
| Which column | The one whose title equals the event name without its leading year, ignoring accents, case and punctuation |
| Entries | Riders with a place in that column: their name, sail number, place and points |
| Ladders | Read as before (the three events have none) |

## Success criteria

1. `tour/` has men's divisions for 2010 Sotavento (38 entries), 2010 Sylt (37)
   and 2011 Podersdorf (47). Each has a note in the summary saying its results
   come from the rankings.
2. The two 2006 Sotavento divisions stay missing, with a note.
3. Season files other than 2010 and 2011 are unchanged. `riders.json` only
   gains riders: no existing rider's pseudonym changes. (A new rider could take
   a pseudonym another rider had before; if that happens, a line in
   `tour/pseudonyms.json` keeps the old one.) Ratings in `ratings.json` shift,
   because three events gained results.
4. The 65% check still holds, an offline rebuild gives identical files, and
   `npm test` passes.

## Sources

`/rankings/<season>/freestyle-men/` and `/rankings/<season>/freestyle-women/`:

- A table whose header row has `#`, `Name`, `Sail`, one `<th>` per event of the
  season (titled like ` Sotavento Fuerteventura`), then `Points`.
- One row per rider:
  - `rank-name` holds the name in a link, as on results pages;
  - `rank-sail` holds the sail number;
  - each event has a `rank-score` cell. `2034 (3)` is 2034 points and 3rd
    place, `0 (33)` is 33rd with no points, and a bare `0` means the rider
    didn't compete.
- A page with no event columns (2006 men) or no rows (2006 women) gives no
  entries.

## Components

- **`parseRanking(html)`** in `lib/pwa/parse.mjs`: returns
  `{ events: [title], riders: [{ name, sailNumber, results: [{ place, points } | null] }] }`,
  with `null` for a bare `0`. A page without the table gives
  `{ events: [], riders: [] }`.
- **`rankingEntries(ranking, eventName)`** in `lib/pwa/parse.mjs`: the entries
  `[{ place, name, sailNumber, points }]` of the column matching the event name,
  or `null` when no column matches. Entries are in place order, as
  `parseResults` gives them.
- **The collector** (`lib/pwa/collect.mjs`):
  - If the results page fails, it no longer skips the event. It takes the
    divisions from the event page's disciplines and goes to the rankings for
    each.
  - If a tab fails, it goes to the rankings for that tab's division.
  - It reads the rankings page with the same "skip on HTTP error" handling.
  - It notes `<event>: men's results taken from the 2010 rankings`. When no
    column matches, it notes `<event>: no men's results, not even in the 2006
    rankings`.
  - Two events of one season read the same rankings page; the crawler's cache
    downloads it once.

## Errors

- A rankings page that answers an HTTP error is skipped and noted, like other
  optional pages.
- A rankings page with an unexpected shape (no `rank-score` cells in a row that
  has a name, say) stops the run with its URL, like the other parsers.

## Testing

- **Fixture:** a trimmed copy of the 2010 men's rankings. It keeps the header,
  the first three riders, and two riders with `0 (33)` and bare `0` cells.
- **`parseRanking`:** event titles, the three kinds of cell, and an empty page.
- **`rankingEntries`:** picks "Colgate World Cup Sylt, Germany" for "2010
  Colgate World Cup Sylt, Germany", keeps only riders with a place, and gives
  `null` for an event with no column.
- **Collector:**
  - a failing results page gets its men's entries from the rankings;
  - a failing tab gets its entries from the rankings;
  - no matching column leaves the division out with a note.
- **The data test:** `test/tour-data.test.mjs` gains a check that the three
  filled divisions are there with 38, 37 and 47 entries.
