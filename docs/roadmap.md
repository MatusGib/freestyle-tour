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
  recognisable but changed names.

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

### 2. Replays and ghosts (idea 1)

Heat replay viewer (scrub, slow motion, cameras, score overlay) and sailing
against a ghost of a stored run. The original already records each heat's
inputs, and our local server stores them, so this builds on data we already
keep.

Done when any stored heat replays exactly, and you can sail against a ghost of
your best run.

### 3. Tournament mode with pseudo-real riders (ideas 4 and 19)

- **Data pipeline:** PWA freestyle results and rankings 2006–2026, giving each
  rider a skill rating from their real placings. The score scale is anchored to
  the few heat totals published in news reports, because per-heat scores are
  not public.
- **AI riders:** they sail with the game's engine, using a planner like the
  Freestajlo bot, and are tuned so their heat scores match their rating.
- **Events:** real event fields, 2-rider heats under the original's heat rules,
  single and double elimination ladders, and finishing points (1st 10,000, 100
  fewer per place).

Done when you can play a full event against a recognisable 2026 field and the
AI riders' results resemble the real ones.

### 4. Every PWA freestyle venue (idea 17)

Compile the full venue list from the PWA ranking pages (2006–2026) and news
reports (1997–2005). Model each venue's typical wind strength and gustiness,
water state (flat, chop, swell), scenery and course orientation.

Done when each venue plays and looks distinct and the tournament mode uses the
real venue for each event.

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
