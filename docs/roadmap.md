# Roadmap

A private copy of the fristajlo.ws windsurf freestyle game, extended with new
features in the spirit of the PWA freestyle World Cup. It exists to show the
game's developer concrete improvement ideas. It is never released.

## Ground rules

- **Private.** The repo stays private and the game is never published or hosted.
- **The base game is the original, unchanged.** Its controls, physics, tricks,
  heat rules, scoring and flags stay exactly as they are. Our work is new
  features on top, not changes to how the game plays.
- **The original's code is never committed.** A script downloads a dated
  snapshot of the live site into `vendor/`; the repo holds only our tooling and
  our features.
- **No contact with fristajlo.ws servers.** The local copy talks only to our local
  server. No scores reach their leaderboard and we never join their 1v1 lobby.
- **Every feature is a separate mod.** Each one can be switched on or off and
  shown to the developer on its own.
- **Real people appear only under pseudonyms.** The tour and the riders get
  recognisable but changed names in the game. The private repo's data keeps the
  real names beside the pseudonyms, so they can be checked and fixed.

## Working names

- Tour: *Pro Freestyle Circuit* (PFC), our stand-in for the PWA World Cup.
- Riders: close enough to recognise, with real nationality and sail number
  (for example, Balz Müller becomes "Balt Möller").

## Decisions

Answers from the planning rounds. "Default" means the user accepted the
proposed answer.

| Topic | Decision |
|---|---|
| Visibility | Private, never released |
| Base game | The original, unchanged: same 3D look, controls, platforms (desktop and mobile, keyboard and touch), heat rules (3-minute heats, 8 attempts per tack, best 3 per tack count), scoring and flags |
| Approach | Local mirror of the original plus a mod layer; small serve-time patches only where a feature can't hook in |
| Backend | Our own local server with fake versions of the original's APIs; no hosting |
| Heats and ladders (default) | Tournament mode uses 2-rider heats, single elimination then double elimination; field taken from the real entry list where known (at most 48), 16 for quick events. Each heat is played under the original's heat rules |
| Ghosts | Your best run and the week's top local run, in practice and solo only, never in competition heats |
| Opponents | AI riders that actually sail on the water, tuned to hit their target scores; online play needs hosting and is out of scope while the copy stays private |
| Riders | Men and women from PWA freestyle events 2006–2026; pre-2006 legends later |
| Rider strength | Each rider's form going into that event: a Glicko-2 rating from all results before it, one rating period per event |
| Score scale | Riders are mapped onto the game's own scoring scale, not each era's real scale |
| Venues | Every venue that hosted a PWA freestyle World Cup, each with its own wind, water and scenery; wave and slalom venues later |
| Tricks | New tricks drawn from the move names in Tricktionary 3's contents (names only, the book is copyrighted) and from modern PWA freestyle |
| Career | Future work |
| Dropped | A PWA rules mod (Best Move counting, judge panel, longer heats, start flags): it would change the base game |

## Sub-projects

Each sub-project gets its own spec, implementation plan and build, in this
order. Later ones depend on earlier ones.

### 1. Base: local copy and mod layer (done)

Snapshot tool, local server with fake APIs, mod loader, headless test harness.
Spec: `docs/superpowers/specs/2026-10-24-local-copy-design.md`.
Plan: `docs/superpowers/plans/2026-10-24-local-copy.md`.

The original game runs entirely from this machine, the browser makes no requests
to any other host, and a proof mod changes the game.

### 2. Replays and ghosts (idea 1, done)

Heat replay viewer (scrub, slow motion, cameras, score overlay) and sailing
against a ghost of a stored run. The original already records each heat's
inputs, and our local server stores them, so this builds on data we already
keep.

Done when any stored heat replays exactly, and you can sail against a ghost of
your best run.
Spec: `docs/superpowers/specs/2026-10-24-replays-ghosts-design.md`.
Plan: `docs/superpowers/plans/2026-10-24-replays-ghosts.md`.

### 3. Tournament mode with pseudo-real riders (ideas 4 and 19)

Built in three pieces, each with its own spec, in this order:

- **3a. Rider and event data (done):** every PWA freestyle event 2006–2026 with its
  entries, placings, points and (from 2014) heat-by-heat ladders, riders under
  pseudonyms, and a Glicko-2 rating for each rider going into each event. Per-heat
  scores are not public, so strength comes from who beat whom.
  Spec: `docs/superpowers/specs/2026-10-24-tour-data-design.md`.
  Plan: `docs/superpowers/plans/2026-10-24-tour-data.md`.
- **3b. AI riders (done):** they sail with the game's engine, using a planner like the
  Freestajlo bot, which can already aim for a chosen heat score. Ratings map to
  target scores on the game's scale, anchored to the few heat totals published
  in news reports, so that in-game win chances match the ratings. A challenge
  mod lets you sail a solo heat against any rider of any event.
  Spec: `docs/superpowers/specs/2026-10-24-ai-riders-design.md`.
  Plan: `docs/superpowers/plans/2026-10-24-ai-riders.md`.
- **3c. Weekly challenge:** each week you relive a past PWA event against the
  real riders who sailed it, in the game's own 1v1 heats, with the AI riders'
  heats following what really happened. Built in parts:
  1. **Weekly super final (done):** you against the event's winner in one real 1v1
     heat (the local server plays the 1v1 lobby and relay), with the game's
     hidden gear as the prize.
     Spec: `docs/superpowers/specs/2026-10-25-weekly-super-final-design.md`.
     Plan: `docs/superpowers/plans/2026-10-25-weekly-super-final.md`.
     Then made harder as the **Champion's challenge (done):** Lennart Neubauer
     at his five most recent wins, in 21 kt, with each event's story and a Red
     Bull helmet as the prize.
     Spec: `docs/superpowers/specs/2026-10-25-champions-challenge-design.md`.
     Plan: `docs/superpowers/plans/2026-10-25-champions-challenge.md`.
  2. **Event winds (done):** each event's wind from its PWA reports, at its real
     strength within the game's 12–28 kt, for the 43 events at Sotavento, Sylt,
     Podersdorf, Pozo and Bonaire, with a developer panel to change winds,
     venues, the champion and AI targets.
     Spec: `docs/superpowers/specs/2026-10-30-event-winds-design.md`.
  3. **Full bracket:** your slot in the event's real ladder, with AI-vs-AI
     heats following the real results, and finishing points from the PWA table
     (10000, 8500, 7650, 6885…, tied places sharing the average).
  4. **More collectibles:** new designs as prizes.

Done when you can play a full event against a recognisable 2026 field and the
AI riders' results resemble the real ones.

### 4. Every PWA freestyle venue (idea 17)

Add a venue system for PWA freestyle events. The detailed sequence, data
decisions and completion criteria are in the
[venue implementation roadmap](venues-roadmap.md).

The first optional `venues` mod now has playable Sotavento and Sylt profiles.
The full venue catalog, distinct scenery and tournament integration remain in
progress.
Pilot design: `docs/superpowers/specs/2026-10-28-venue-profiles-design.md`.
Plan: `docs/superpowers/plans/2026-10-28-venue-profiles.md`.

Start with the structured PWA freestyle events from 2006–2026, then cover
historical venues from 1997–2005. Represent each event's reported conditions
separately from its venue's typical conditions so the same spot can feel
different across years. Record typical wind and gustiness, water, scenery and
course orientation where the game supports them. Use the game's existing
environment settings and keep its heat rules and core physics unchanged.

Done when every supported freestyle event loads its sourced venue profile,
venue profiles create distinct playable environments, and tournament events
load their venue automatically.

### 5. More tricks (idea 20)

Candidates the original lacks include Grubby, Willy Skipper, Ponch, Shove-it
Spock, E-slider, Puñeta, Gozzada, Chachoo, Switch Chachoo, Toad, Clock, Kicker,
Air Bob, Switch Kono, Kabikuchi, Speed loop and Air jibe. Each trick needs its
setup, its connections, its scoring and its animation in the original's pose
format. The animation is the main cost.

Done when each added trick can be landed, is scored and animates convincingly.

### 6. Career (idea 18)

Future work: seasons from amateur to world tour, learning tricks, sponsors and
unlocks.

## Data sources

- PWA rulebook Part 4 (freestyle, 2006) and the current rule changes, for event
  formats: elimination ladders, heat sizes and finishing points.
- pwaworldtour.com event results, elimination ladder listings and rankings,
  2006–2026.
- News reports for published heat totals and pre-2006 events.
- Tricktionary 3 contents page for move names.

## Known risks

- **The original changes often.** A new snapshot can break mods. Signature-based
  lookups and patch match counts fail loudly so we know which mods to update.
- **Real heat scores are scarce.** Rider strength comes from placings; heat-score
  realism is approximate unless real heat sheets turn up.
- **New tricks need hand-made animation,** which limits how many we add.
