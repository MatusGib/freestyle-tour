# Weekly Super Final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Super final" section in the game's main menu. Each week it offers one past PWA event's final against that event's winner, sailed as the game's own 1v1 heat (the local server plays the multiplayer side). Your first win switches on the game's hidden gear.

**Architecture:**
- The weekly picker chooses the event and its winner, and finds room ids whose wind (by the game's own function) matches.
- The AI riders (3b) sail the winner's heat, and the worker turns it into a pose track.
- A local lobby state machine answers the game's 1v1 lobby requests.
- A minimal WebSocket relay streams the AI's poses.
- A mod adds the menu button and unlocks the prize.

**Tech Stack:** Node 22+ (`node:http` upgrade, `node:crypto`, `node:net` in tests), browser ES modules, the game's own 1v1 client from the snapshot.

**Spec:** `docs/superpowers/specs/2026-10-25-weekly-super-final-design.md`

---

## Facts this plan relies on (verified 2026-10-25)

- **The prototype:** every file in this plan was first run as a prototype in a copy of the repo with the real snapshot. All 220 tests pass: today's 189 plus 31 new.
- **The browser run.** Against the real game (the pane visible), the prototype gave:
  - the menu button: "Super final · This week: 2019 Mercedes-Benz World Cup Sylt · vs Amada Vryeswijk · 17 kt";
  - "Getting Amada Vryeswijk ready…" (7 seconds), then the game's challenge toast, "Amada Vryeswijk challenges you";
  - after Accept, the game's countdown ("Heat starts in 5 · … Wind: 17 kt, steady wind");
  - the AI sailing, its HUD score rising ("vs Amada Vryeswijk 12.07" at 23 s);
  - the result screen, "Amada Vryeswijk won the heat!" (0.00 against 36.08);
  - "Challenge again", which started a new heat at once;
  - "Forfeit · back to lobby", shown as a forfeit and not recorded;
  - after a win was recorded by hand, the look editor listing "Severne Freek CC1" and "Severne Psycho";
  - with tour/ moved away, the button saying "No tour data on this computer: run npm run tour-data.".
- **Room ids:**
  - The game ignores rooms whose id it has dismissed, and resumes an unfinished heat it kept for a room id (sessionStorage).
  - A reused id after a restart resumed an old heat at 178 s. So room ids carry the start time.
  - Without gusts, any room ids with the same knots gave exactly the same wind at every point checked. With gusts, two ids differed by up to 5 kt.
- **The game's room wind** is `function c(e){return i(n(e))}` in the wind part (`conditions-*.js`), a string hash then `conditions(seed)`. It's the only export matching the new `roomConditions` signature.
- **Before Task 1,** `npm test` passes 189 tests.
- **Line endings:** most checked-out files have Windows line endings. Use the Edit tool for "replace" steps, not `sed`.

## File structure

| File | Responsibility |
|---|---|
| `server/weekly.mjs` (create) | The week's event, the opponent, room ids for a wind, results |
| `mods/lib/identify.js` (modify) | The `roomConditions` signature |
| `lib/ai/worker.mjs`, `lib/ai/sailer.mjs` (replace) | The pose-track job: poses 30 a second and when each attempt settled |
| `server/lagoon/lobby.mjs` (create) | The local 1v1 lobby state machine |
| `server/lagoon/relay.mjs` (create) | The WebSocket relay: tickets, frames, poses |
| `server/api/lagoons.mjs` (replace) | 1v1 endpoints through the lobby and relay |
| `server/api/weekly.mjs` (create) | `GET /api/local/weekly`, `POST /api/local/weekly/start` |
| `server/api/index.mjs`, `server/app.mjs` (modify) | Routes, the host header, wiring, the upgrade handler |
| `mods/super-final/super-final.js`, `mods/super-final/index.js` (create) | The mod |
| `mods/enabled.json`, `README.md`, `docs/roadmap.md` (modify) | Enable and document |
| Tests | `test/weekly.test.mjs`, `test/room-wind-snapshot.test.mjs`, `test/pose-track-snapshot.test.mjs`, `test/lobby.test.mjs`, `test/relay.test.mjs`, `test/api-weekly.test.mjs`, `test/super-final.test.mjs` (create) |

Run all commands from the repo root (`C:\Users\mateusz\Projects\freestyle-tour`) in Git Bash. Work on a branch: `git checkout -b super-final`.

---

### Task 1: Weekly picker

**Files:**
- Create: `server/weekly.mjs`
- Test: `test/weekly.test.mjs`

- [ ] **Step 1: Write the failing test** in `test/weekly.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { heatTarget, seedOf } from "../lib/ai/score.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { DEFAULT_WIND, lookFor, opponentFor, recordResult, recordRoom, roomIdsFor, weekOf } from "../server/weekly.mjs";
import { WEEK, tempDir, writeTour } from "./helpers.mjs";

const WEEK_START = 1792360800000;

function tour(t) {
  const dir = tempDir(t);
  writeTour(dir);
  return loadTour(dir);
}

test("each week picks one event, the same all week, from all events in id order", (t) => {
  const data = tour(t);
  const ids = [300, 375, 378];
  const week = weekOf(data, WEEK_START);
  assert.equal(week.event.id, ids[seedOf("weekly", WEEK_START) % 3]);
  assert.equal(weekOf(data, WEEK_START).event.id, week.event.id);
  const picks = new Set(Array.from({ length: 12 }, (_, i) => weekOf(data, WEEK_START + i * WEEK).event.id));
  assert.ok(picks.size > 1, "the event changes from week to week");
});

test("the opponent is the division's winner, aiming for a target seeded by the week", (t) => {
  const data = tour(t);
  const week = { weekStart: WEEK_START, event: data.events.get(378) };
  const men = opponentFor(data, week, "men");
  assert.deepEqual({ ...men, average: undefined, target: undefined }, { id: "m:yentel-caers", nickname: "Yenter Ceers", appearance: lookFor("men"), rating: 1938, average: undefined, target: undefined });
  assert.equal(men.target, Math.round(heatTarget(1938, seedOf("m:yentel-caers", 378, WEEK_START, "super-final")) * 100) / 100);
  assert.equal(opponentFor(data, week, "women").nickname, "Sarah-Quito Uffringa");
  assert.equal(opponentFor(data, week, "women").appearance.bodyType, "female");
  assert.equal(opponentFor(data, { weekStart: WEEK_START, event: data.events.get(375) }, "women"), null);
});

test("room ids are those whose wind matches, in order, under the given prefix", () => {
  const knotsOf = (id) => 15 + (Number(id.split("-").at(-1)) % 5);
  const roomConditions = (id) => ({ seed: 1, knots: knotsOf(id), gustKnots: Number(id.split("-").at(-1)) % 2 ? 5 : 0 });
  const ids = roomIdsFor(roomConditions, DEFAULT_WIND, "super-final-378-99");
  const first = [ids.next().value, ids.next().value, ids.next().value];
  assert.deepEqual(first, ["super-final-378-99-2", "super-final-378-99-12", "super-final-378-99-22"]);
  for (const id of first) assert.deepEqual(roomConditions(id), { seed: 1, ...DEFAULT_WIND });
});

test("results keep each week's best score and whether you won; the prize comes with the first win", (t) => {
  const store = createStore(join(tempDir(t), "weekly.json"), { weeks: {}, prize: null });
  const result = (score, won, at) => recordResult(store, { weekStart: WEEK_START, event: 378, division: "men", score, won, at });
  result(20, false, 1);
  result(15, false, 2);
  assert.deepEqual(store.data, { weeks: { [WEEK_START]: { event: 378, division: "men", best: 20, won: false } }, prize: null });
  result(41, true, 3);
  result(30, false, 4);
  assert.deepEqual(store.data.weeks[WEEK_START], { event: 378, division: "men", best: 41, won: true });
  recordResult(store, { weekStart: WEEK_START + WEEK, event: 300, division: "men", score: 45, won: true, at: 5 });
  assert.deepEqual(store.data.prize, { earnedAt: 3 });
});

test("a finished room is recorded as a win only with outcome 1, and a forfeit not at all", (t) => {
  const store = createStore(join(tempDir(t), "weekly.json"), { weeks: {}, prize: null });
  const meta = { weekStart: WEEK_START, event: 378, division: "men" };
  const room = (outcome, score, forfeited = false) => ({ meta, outcome, you: { score, forfeited } });
  recordRoom(store, room("2", 25), 1);
  assert.deepEqual(store.data.weeks[WEEK_START], { event: 378, division: "men", best: 25, won: false });
  recordRoom(store, room("2", 0, true), 2);
  recordRoom(store, { ...room("1", 50), meta: null }, 3);
  assert.deepEqual(store.data.weeks[WEEK_START].best, 25, "forfeits and rooms without a super final aren't recorded");
  recordRoom(store, room("1", 33), 4);
  assert.deepEqual([store.data.weeks[WEEK_START].won, store.data.prize], [true, { earnedAt: 4 }]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/weekly.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/weekly.mjs`.

- [ ] **Step 3: Write `server/weekly.mjs`:**

```js
// This week's super final: one past event per week, seeded by the week, with
// the winner of the division you pick as the opponent. The opponent's heat is
// sailed by the AI riders at a target seeded by the week, in the wind of a room
// id chosen to match the event's wind.
import { averageScore, heatTarget, seedOf } from "../lib/ai/score.mjs";

// Until the event winds table exists, every super final sails at 17 kt.
export const DEFAULT_WIND = { knots: 17, gustKnots: 0 };
const round = (value) => Math.round(value * 100) / 100;

// The game's default look, as a woman or a man, so the lobby and result
// screens have a full appearance to draw.
const LOOK = { country: "", skinColor: "warm", hair: "short", glasses: "sunglasses", helmet: "none", facialHair: "none", hairColor: "brown", facialHairColor: "brown", bodyType: "male", outfit: "wetsuit", harness: "black", sail: "orange", board: "orange" };
export const lookFor = (division) => ({ ...LOOK, bodyType: division === "women" ? "female" : "male", hair: division === "women" ? "long" : "short" });

// The week's event, from all events with results in id order.
export function weekOf(tour, weekStart) {
  const events = [...tour.events.values()].sort((a, b) => a.id - b.id);
  return { weekStart, event: events[seedOf("weekly", weekStart) % events.length] };
}

// The division's winner as the opponent, or null when the event had no such
// division.
export function opponentFor(tour, { event, weekStart }, division) {
  const winner = event.divisions[division]?.entries[0];
  if (!winner) return null;
  const rating = tour.ratings.events[event.id][division][winner.rider].rating;
  return {
    id: winner.rider,
    nickname: tour.riders.get(winner.rider).pseudonym,
    appearance: lookFor(division),
    rating: Math.round(rating),
    average: round(averageScore(rating)),
    target: round(heatTarget(rating, seedOf(winner.rider, event.id, weekStart, "super-final"))),
  };
}

// Room ids ("<prefix>-<n>") whose wind (by the game's own roomConditions)
// matches, in order. Every room needs an id never used before: the game ignores
// ids it has dismissed, and resumes an unfinished heat it kept for an id. So
// the prefix should carry the time the super final was started. Without gusts,
// all matching ids give exactly the same wind.
export function* roomIdsFor(roomConditions, wind, prefix) {
  for (let n = 0; n < 100_000; n++) {
    const id = `${prefix}-${n}`;
    const c = roomConditions(id);
    if (c.knots === wind.knots && c.gustKnots === wind.gustKnots) yield id;
  }
  throw new Error(`no room id gives ${wind.knots} kt with gusts of ${wind.gustKnots}`);
}

// Keeps each week's best score and whether you won, and when the prize was
// earned (the first win). store: createStore(file, { weeks: {}, prize: null }).
export function recordResult(store, { weekStart, event, division, score, won, at }) {
  store.update((data) => {
    const week = data.weeks[weekStart] ?? { event, division, best: 0, won: false };
    week.best = Math.max(week.best, score);
    week.won ||= won;
    data.weeks[weekStart] = week;
    if (won && !data.prize) data.prize = { earnedAt: at };
  });
}

// Records a finished super final room from the lobby; a forfeit isn't recorded.
export function recordRoom(store, room, at) {
  if (!room.meta || room.you.forfeited) return;
  recordResult(store, { ...room.meta, score: room.you.score, won: room.outcome === "1", at });
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/weekly.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/weekly.mjs test/weekly.test.mjs
git commit -m "Pick each week's super final and its opponent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Room winds from the game

**Files:**
- Modify: `mods/lib/identify.js`
- Test: `test/room-wind-snapshot.test.mjs`

- [ ] **Step 1: Write the failing test** in `test/room-wind-snapshot.test.mjs`:

```js
// Room winds come from the game's own room-conditions function. Skipped when
// no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { DEFAULT_WIND, roomIdsFor } from "../server/weekly.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("room ids with the default wind are found quickly and all give the same wind", { skip }, async () => {
  const game = await loadGame(snapshot, ["wind"]);
  const ids = roomIdsFor(game.roomConditions, DEFAULT_WIND, "super-final-378-1792885000000");
  const [a, b] = [ids.next().value, ids.next().value];
  assert.match(a, /^super-final-378-1792885000000-\d+$/);
  for (const id of [a, b]) assert.deepEqual({ ...game.roomConditions(id), seed: 0 }, { seed: 0, ...DEFAULT_WIND });
  const [ca, cb] = [game.roomConditions(a), game.roomConditions(b)];
  for (let t = 0; t < 180; t += 1.3) for (const [x, z] of [[0, 0], [60, -90]]) assert.equal(game.wind(ca, x, z, t), game.wind(cb, x, z, t));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/room-wind-snapshot.test.mjs`
Expected: FAIL with `TypeError: roomConditions is not a function`.

- [ ] **Step 3: Add the signature.** In `mods/lib/identify.js`, in the `wind` part, after the `wind:` line, add:

```js
    // A 1v1 room's wind: the room id hashed into a seed, then conditions(seed).
    roomConditions: (v) => /^function [\w$]+\(([\w$]+)\)\{return [\w$]+\([\w$]+\(\1\)\)\}$/.test(src(v)),
```

- [ ] **Step 4: Run the test and the identification checks**

Run: `node --test test/room-wind-snapshot.test.mjs test/identify-snapshot.test.mjs`
Expected: PASS, 1 + 2 tests. The identification check requires every signature to match exactly one export.

- [ ] **Step 5: Commit**

```bash
git add mods/lib/identify.js test/room-wind-snapshot.test.mjs
git commit -m "Identify the game's 1v1 room wind" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: The AI's pose track

**Files:**
- Replace: `lib/ai/worker.mjs`, `lib/ai/sailer.mjs`
- Test: `test/pose-track-snapshot.test.mjs`

- [ ] **Step 1: Write the failing test** in `test/pose-track-snapshot.test.mjs`:

```js
// The worker turns a recorded heat into the AI's pose track for the 1v1 relay.
// Skipped when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSailer } from "../lib/ai/sailer.mjs";
import { sailHeat } from "../lib/ai/sail.mjs";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { createRunner } from "../mods/lib/replay.js";
import { DEFAULT_WIND, roomIdsFor } from "../server/weekly.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("the pose track has a pose every 4 steps and when each attempt settled", { skip }, async (t) => {
  const engine = await loadGame(snapshot, ["engine", "wind", "controls", "week", "pose"]);
  const conditions = engine.roomConditions(roomIdsFor(engine.roomConditions, DEFAULT_WIND, "probe").next().value);
  const heat = sailHeat(engine, conditions, 40, { seconds: 20 });
  const sailer = createSailer({ root: ROOT });
  t.after(() => sailer.close());
  const { poses, settledAt } = await sailer.poses(conditions, heat.replay);
  assert.equal(poses.length, heat.steps / 4 + 1);
  const runner = createRunner(engine, { conditions, replay: heat.replay });
  runner.advance(400);
  assert.deepEqual(poses[100], engine.riderPose(runner.state));
  const settled = heat.attempts.filter((a) => a.status !== "pending");
  assert.ok(settled.length > 0, "the planner should settle a move in 20 seconds");
  for (const attempt of settled) assert.ok(settledAt[attempt.id] > attempt.startedAt && settledAt[attempt.id] <= 20, `attempt ${attempt.id} settled at ${settledAt[attempt.id]}`);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/pose-track-snapshot.test.mjs`
Expected: FAIL with `TypeError: sailer.poses is not a function`.

- [ ] **Step 3: Replace `lib/ai/worker.mjs`** with:

```js
// A worker thread that sails AI heats for the local server. It loads the
// snapshot's engine once, sails each requested heat, and checks that the
// recording replays to the same score before answering. It also turns a
// recording into a pose track for the 1v1 relay.
import { parentPort, workerData } from "node:worker_threads";
import { createRunner } from "../../mods/lib/replay.js";
import { loadGame, openSnapshot } from "../snapshot.mjs";
import { sailHeat } from "./sail.mjs";

const engine = await loadGame(openSnapshot(workerData.root, workerData.snapshot), ["engine", "wind", "controls", "week", "pose"]);

// The rider's pose every `every` steps of a recorded heat (4 steps: 30 a
// second), and the heat time at which each attempt was settled (no longer
// pending), by attempt id, so a live score can follow the heat.
function poseTrack(conditions, replay, every = 4) {
  const runner = createRunner(engine, { conditions, replay });
  const poses = [engine.riderPose(runner.state)];
  const settledAt = {};
  while (!runner.done) {
    runner.advance(every);
    poses.push(engine.riderPose(runner.state));
    for (const attempt of runner.state.heat.attempts) {
      if (attempt.status !== "pending" && !(attempt.id in settledAt)) settledAt[attempt.id] = runner.state.totalTime;
    }
  }
  return { poses, settledAt };
}

parentPort.on("message", ({ id, kind = "sail", conditions, target, seconds, replay }) => {
  try {
    if (kind === "poses") {
      parentPort.postMessage({ id, track: poseTrack(conditions, replay) });
      return;
    }
    const { state, ...heat } = sailHeat(engine, conditions, target, { seconds });
    const runner = createRunner(engine, { conditions, replay: heat.replay });
    runner.advance(heat.steps);
    const replayed = engine.heatTotals(runner.state.heat).total;
    if (replayed !== heat.score) throw new Error(`the recording replays to ${replayed}, not ${heat.score}`);
    parentPort.postMessage({ id, heat });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
```

- [ ] **Step 4: Replace `lib/ai/sailer.mjs`** with:

```js
// Sails AI heats in a worker thread, so the local server keeps answering while
// a heat is planned (about 20 seconds). The worker takes one heat at a time, in
// the order asked, and starts on the first request.
import { Worker } from "node:worker_threads";

export function createSailer({ root, snapshot }) {
  let worker = null;
  let next = 0;
  const waiting = new Map();
  const failAll = (error) => {
    for (const { reject } of waiting.values()) reject(error);
    waiting.clear();
    worker = null;
  };
  const start = () => {
    worker = new Worker(new URL("./worker.mjs", import.meta.url), { workerData: { root, snapshot } });
    worker.unref();
    worker.on("message", ({ id, heat, track, error }) => {
      const job = waiting.get(id);
      waiting.delete(id);
      if (error) job.reject(new Error(error));
      else job.resolve(heat ?? track);
    });
    worker.on("error", failAll);
  };
  const ask = (message) => {
    if (!worker) start();
    const id = next++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, ...message });
    });
  };
  return {
    // Resolves to { replay, score, attempts, tricks, steps }.
    sail: (conditions, target, { seconds } = {}) => ask({ conditions, target, seconds }),
    // Resolves to { poses, settledAt }: the recorded heat's poses, 30 a second,
    // and when each attempt was settled, by attempt id.
    poses: (conditions, replay) => ask({ kind: "poses", conditions, replay }),
    close() {
      return worker?.terminate();
    },
  };
}
```

- [ ] **Step 5: Run the new test and the sailer's existing one**

Run: `node --test test/pose-track-snapshot.test.mjs test/ai-sailer-snapshot.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/worker.mjs lib/ai/sailer.mjs test/pose-track-snapshot.test.mjs
git commit -m "Turn AI heats into pose tracks for the 1v1 relay" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Local 1v1 lobby

**Files:**
- Create: `server/lagoon/lobby.mjs`
- Test: `test/lobby.test.mjs`

- [ ] **Step 1: Write the failing test** in `test/lobby.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { HEAT_SECONDS, TIMES, createLobby } from "../server/lagoon/lobby.mjs";

const PLAYER = { nickname: "Tester", appearance: { sail: "teal" } };
const OPPONENT = { id: "m:balz-muller", nickname: "Balt Möller", appearance: { sail: "orange" }, rating: 1757 };
const attempt = (id, score) => ({ id, status: "landed", score, tack: "port", label: "Culo" });
// The AI's heat: three attempts, settled at 20, 50 and 170 seconds.
const HEAT = { score: 30, attempts: [attempt(1, 8), attempt(2, 10), attempt(3, 12)], poses: [{ x: 0 }, { x: 1 }, { x: 2 }], settledAt: { 1: 20, 2: 50, 3: 170 } };
const total = (attempts) => attempts.reduce((sum, a) => sum + a.score, 0);

function setup() {
  let time = 1_000_000;
  const results = [];
  const logs = [];
  let n = 0;
  const lobby = createLobby({ now: () => time, score: total, onResult: (room) => results.push(room), log: (m) => logs.push(m) });
  return {
    lobby,
    results,
    logs,
    later: (ms) => void (time += ms),
    get time() {
      return time;
    },
    offer: (meta = { weekStart: 1, event: 291, division: "men" }) => lobby.offer(OPPONENT, HEAT, () => `room-${n++}`, meta),
    poll: (body = {}) => lobby.act(body, PLAYER),
  };
}

// Accepts the offered challenge and runs the clock to the start of the heat.
function race(s) {
  const challengeId = s.poll().challenges[0].id;
  s.poll({ action: "accept", challengeId });
  s.later(TIMES.racingAfter + TIMES.countdown);
}

test("the lobby answers the old empty lobby until an opponent is offered", () => {
  const s = setup();
  assert.deepEqual(s.poll({ action: "sync" }), { serverTime: s.time, room: null, riders: [], challenges: [], rankings: [] });
  assert.deepEqual(s.logs, [], "quiet actions aren't logged");
});

test("an offer puts the opponent online with an incoming challenge", () => {
  const s = setup();
  s.offer();
  const { riders, challenges, room } = s.poll();
  assert.deepEqual(riders, [
    { id: "m:balz-muller", nickname: "Balt Möller", appearance: { sail: "orange" }, rating: 1757, activity: "lobby", status: "available", you: false },
    { id: "you", nickname: "Tester", appearance: { sail: "teal" }, rating: 1500, activity: "lobby", status: "available", you: true },
  ]);
  assert.equal(challenges.length, 1);
  assert.deepEqual({ ...challenges[0], id: "id" }, { id: "id", status: "pending", incoming: true, expiresAt: s.time + TIMES.offerFor, senderName: "Balt Möller", recipientName: "Tester" });
  assert.equal(room, null);
});

test("accepting opens a pending room that races with a countdown to startsAt", () => {
  const s = setup();
  s.offer();
  const challengeId = s.poll().challenges[0].id;
  const pending = s.poll({ action: "accept", challengeId }).room;
  assert.deepEqual([pending.id, pending.status, pending.startsAt - s.time, pending.yourSeat], ["room-0", "pending", TIMES.racingAfter + TIMES.countdown, 1]);
  assert.deepEqual(pending.seats.map((seat) => [seat.seat, seat.riderId, seat.nickname, seat.score, seat.ratingDelta]), [[1, "you", "Tester", null, null], [2, "m:balz-muller", "Balt Möller", 0, null]]);
  s.later(TIMES.racingAfter);
  const { room, challenges, riders } = s.poll();
  assert.equal(room.status, "racing");
  assert.equal(challenges[0].status, "accepted");
  assert.deepEqual(riders.map((r) => r.activity), ["match", "match"]);
});

test("during the heat the AI's seat shows only its settled attempts and their total", () => {
  const s = setup();
  s.offer();
  race(s);
  s.later(30_000);
  const seat = s.poll().room.seats[1];
  assert.deepEqual([seat.attempts.map((a) => a.id), seat.score, seat.submitted], [[1], 8, false]);
  s.later(25_000);
  assert.deepEqual(s.poll().room.seats[1].attempts.map((a) => a.id), [1, 2]);
});

test("the AI submits at the end of the heat; your finish decides the outcome", () => {
  for (const [yours, outcome] of [[[attempt(9, 31)], "1"], [[attempt(9, 20)], "2"], [[attempt(9, 30)], "draw"]]) {
    const s = setup();
    s.offer();
    race(s);
    s.later(HEAT_SECONDS * 1000);
    assert.equal(s.poll().room.seats[1].submitted, true);
    const room = s.poll({ action: "finish", roomId: "room-0", attempts: yours }).room;
    assert.deepEqual([room.status, room.outcome, room.seats[0].score, room.seats[1].score], ["finished", outcome, total(yours), 30]);
    assert.equal(s.results.length, 1);
    assert.deepEqual(s.results[0].meta, { weekStart: 1, event: 291, division: "men" });
  }
});

test("finishing first waits for the AI, and the result is reported once", () => {
  const s = setup();
  s.offer();
  race(s);
  s.later(179_000);
  assert.equal(s.poll({ action: "finish", roomId: "room-0", attempts: [attempt(9, 40)] }).room.status, "racing");
  s.later(1_000);
  assert.equal(s.poll().room.outcome, "1");
  s.poll();
  assert.equal(s.results.length, 1);
});

test("leaving before the start voids the room; leaving during the heat forfeits it", () => {
  const before = setup();
  before.offer();
  before.poll({ action: "accept", challengeId: before.poll().challenges[0].id });
  assert.deepEqual(before.poll({ action: "leave", roomId: "room-0" }).room.outcome, "void");
  assert.equal(before.results.length, 0);
  const during = setup();
  during.offer();
  race(during);
  const room = during.poll({ action: "leave", roomId: "room-0" }).room;
  assert.deepEqual([room.status, room.outcome, room.seats[0].forfeited], ["finished", "2", true]);
  assert.equal(during.results[0].you.forfeited, true);
});

test("a challenge can be rejected, cancelled or left to expire", () => {
  for (const [action, status] of [["reject", "rejected"], ["cancel", "cancelled"]]) {
    const s = setup();
    s.offer();
    const challengeId = s.poll().challenges[0].id;
    assert.equal(s.poll({ action, challengeId }).challenges[0].status, status);
  }
  const s = setup();
  s.offer();
  s.later(TIMES.offerFor);
  const { challenges } = s.poll();
  assert.equal(challenges[0].status, "expired");
  assert.equal(s.poll({ action: "accept", challengeId: challenges[0].id }).room, null);
});

test("challenging again after a heat opens a new room at once, and dismissing hides the old one", () => {
  const s = setup();
  s.offer();
  race(s);
  s.later(HEAT_SECONDS * 1000);
  s.poll({ action: "finish", roomId: "room-0", attempts: [] });
  assert.equal(s.poll({ action: "dismiss", roomId: "room-0" }).room, null);
  const again = s.poll({ action: "challenge", challengeId: "c2", riderId: "m:balz-muller" });
  assert.deepEqual([again.room.id, again.room.status, again.challenges[0].status, again.challenges[0].incoming], ["room-1", "pending", "accepted", false]);
  assert.equal(s.poll({ action: "challenge", challengeId: "c3", riderId: "m:balz-muller" }).room.id, "room-1", "not while a room runs");
});

test("unknown actions are logged and answered with the snapshot", () => {
  const s = setup();
  s.offer();
  assert.equal(s.poll({ action: "teleport" }).challenges.length, 1);
  assert.deepEqual(s.logs, ["lobby: unknown action teleport"]);
});

test("the racing pose follows the room's clock, 30 a second", () => {
  const s = setup();
  s.offer();
  assert.equal(s.lobby.racingPose(), null);
  race(s);
  assert.deepEqual(s.lobby.racingPose(), { roomId: "room-0", pose: { x: 0 } });
  s.later(40);
  assert.deepEqual(s.lobby.racingPose().pose, { x: 1 });
  s.later(10_000);
  assert.deepEqual(s.lobby.racingPose().pose, { x: 2 }, "the last pose after the track ends");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/lobby.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/lagoon/lobby.mjs`.

- [ ] **Step 3: Write `server/lagoon/lobby.mjs`:**

```js
// The local 1v1 lobby: plays the multiplayer side of the game's 1v1 for one AI
// opponent at a time. offer() puts the opponent online with a challenge for
// you; the game accepts it (or, after a heat, challenges again), and each room
// goes through pending, racing (with a countdown to startsAt) and finished, the
// way the real lobby's rooms do. A plain state machine on an injected clock, so
// it can be tested without a browser.
import { randomUUID } from "node:crypto";

export const HEAT_SECONDS = 180;
export const TIMES = { racingAfter: 2000, countdown: 5000, offerFor: 10 * 60 * 1000 };
export const POSES_PER_SECOND = 30;
const YOU = "you";
const QUIET = new Set(["sync", "exit", "offline", "presence"]);

// score(attempts): the heat total, by the game's own rules. onResult(room) is
// called once when a room finishes.
export function createLobby({ now, score, onResult = () => {}, log = () => {} }) {
  let offer = null; // { challenge, opponent, heat, nextRoomId, meta }
  let room = null;

  const clock = () => (now() - room.startsAt) / 1000;

  function openRoom() {
    const racingAt = now() + TIMES.racingAfter;
    room = {
      id: offer.nextRoomId(),
      status: "pending",
      racingAt,
      startsAt: racingAt + TIMES.countdown,
      outcome: null,
      dismissed: false,
      you: { attempts: [], score: 0, submitted: false, forfeited: false },
      ai: { attempts: offer.heat.attempts, score: offer.heat.score, submitted: false, forfeited: false },
      meta: offer.meta,
    };
  }

  function finishRoom() {
    room.status = "finished";
    const { you, ai } = room;
    room.outcome = you.forfeited ? "2" : you.score > ai.score ? "1" : you.score < ai.score ? "2" : "draw";
    onResult(room);
  }

  // Moves the challenge and room along with the clock.
  function tick() {
    if (offer?.challenge.status === "pending" && now() >= offer.challenge.expiresAt) offer.challenge.status = "expired";
    if (!room) return;
    if (room.status === "pending" && now() >= room.racingAt) room.status = "racing";
    if (room.status !== "racing") return;
    if (!room.ai.submitted && clock() >= HEAT_SECONDS) room.ai.submitted = true;
    if (room.ai.submitted && (room.you.submitted || room.you.forfeited)) finishRoom();
  }

  // The AI's side as the game should see it now: during the heat, only the
  // attempts it has settled so far, and their total, like a live opponent.
  function aiNow() {
    if (room.ai.submitted || room.status === "finished") return room.ai;
    if (room.status !== "racing") return { ...room.ai, attempts: [], score: 0 };
    const attempts = room.ai.attempts.filter((a) => offer.heat.settledAt[a.id] <= clock());
    return { ...room.ai, attempts, score: score(attempts) };
  }

  const seatOf = (seat, rider, side) => ({
    seat,
    riderId: rider.id,
    nickname: rider.nickname,
    appearance: rider.appearance,
    submitted: side.submitted,
    forfeited: side.forfeited,
    score: side.score,
    rating: rider.rating,
    ratingDelta: null,
    attempts: side.attempts,
  });

  function roomView(player) {
    const you = { id: YOU, nickname: player.nickname, appearance: player.appearance, rating: 1500 };
    const yours = room.you.submitted ? room.you : { ...room.you, score: null, attempts: null };
    return { id: room.id, status: room.status, startsAt: room.startsAt, yourSeat: 1, outcome: room.outcome, seats: [seatOf(1, you, yours), seatOf(2, offer.opponent, aiNow())] };
  }

  // The reply to any lobby poll: the empty lobby the local copy has always
  // answered, until an opponent is offered. player: { nickname, appearance }.
  function snapshot(player) {
    tick();
    if (!offer) return { serverTime: now(), room: null, riders: [], challenges: [], rankings: [] };
    const inHeat = !!room && room.status !== "finished";
    const riders = [
      { id: offer.opponent.id, nickname: offer.opponent.nickname, appearance: offer.opponent.appearance, rating: offer.opponent.rating, activity: inHeat ? "match" : "lobby", status: inHeat ? "in-heat" : "available", you: false },
      { id: YOU, nickname: player.nickname, appearance: player.appearance, rating: 1500, activity: inHeat ? "match" : "lobby", status: "available", you: true },
    ];
    const challenges = [{ ...offer.challenge, senderName: offer.opponent.nickname, recipientName: player.nickname }];
    return { serverTime: now(), room: room && !room.dismissed ? roomView(player) : null, riders, challenges, rankings: [] };
  }

  const ACTIONS = {
    accept({ challengeId }) {
      if (offer?.challenge.id !== challengeId || offer.challenge.status !== "pending") return;
      offer.challenge.status = "accepted";
      openRoom();
    },
    reject({ challengeId }) {
      if (offer?.challenge.id === challengeId && offer.challenge.status === "pending") offer.challenge.status = "rejected";
    },
    cancel({ challengeId }) {
      if (offer?.challenge.id === challengeId && offer.challenge.status === "pending") offer.challenge.status = "cancelled";
    },
    // "Challenge again" after a heat: the AI accepts at once, in a new room.
    challenge({ challengeId, riderId }) {
      if (!offer || riderId !== offer.opponent.id || (room && room.status !== "finished")) return;
      offer.challenge = { id: challengeId, status: "accepted", incoming: false, expiresAt: now() + TIMES.offerFor };
      openRoom();
    },
    progress({ roomId, attempts }) {
      if (room?.id === roomId && room.status === "racing") room.you.attempts = attempts;
    },
    finish({ roomId, attempts }) {
      if (room?.id !== roomId || room.status === "finished") return;
      room.you = { ...room.you, attempts, score: score(attempts), submitted: true };
    },
    leave({ roomId }) {
      if (room?.id !== roomId || room.status === "finished") return;
      if (room.status === "pending") {
        room.status = "finished";
        room.outcome = "void";
        return;
      }
      room.you.forfeited = true;
      room.ai.submitted = true;
    },
    dismiss({ roomId }) {
      if (room?.id === roomId && room.status === "finished") room.dismissed = true;
    },
  };

  return {
    snapshot,
    // body.action: what the player did, if anything. Answers with the snapshot.
    act(body, player) {
      tick();
      const handler = ACTIONS[body.action];
      if (handler) handler(body);
      else if (body.action && !QUIET.has(body.action)) log(`lobby: unknown action ${body.action}`);
      return snapshot(player);
    },
    // opponent: { id, nickname, appearance, rating }; heat: { score, attempts,
    // poses, settledAt }; nextRoomId(): a new room id with the heat's wind for
    // every room (the game ignores room ids it has dismissed); meta: what
    // onResult gets back with the room.
    offer(opponent, heat, nextRoomId, meta = null) {
      offer = { challenge: { id: randomUUID(), status: "pending", incoming: true, expiresAt: now() + TIMES.offerFor }, opponent, heat, nextRoomId, meta };
      room = null;
    },
    // The AI's pose at the room's clock while it races, or null.
    racingPose() {
      tick();
      if (room?.status !== "racing") return null;
      const { poses } = offer.heat;
      const i = Math.max(0, Math.min(poses.length - 1, Math.floor(clock() * POSES_PER_SECOND)));
      return { roomId: room.id, pose: poses[i] };
    },
    get room() {
      return room;
    },
  };
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/lobby.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lagoon/lobby.mjs test/lobby.test.mjs
git commit -m "Add a local 1v1 lobby for one AI opponent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: WebSocket relay

**Files:**
- Create: `server/lagoon/relay.mjs`
- Test: `test/relay.test.mjs`

- [ ] **Step 1: Write the failing test** in `test/relay.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { connect } from "node:net";
import { PROTOCOL, RELAY_PATH, createRelay, decodeFrames, encodeFrame } from "../server/lagoon/relay.mjs";

// A client frame, masked as browsers send them.
function clientFrame(text) {
  const data = Buffer.from(text);
  const mask = randomBytes(4);
  const masked = Buffer.from(data.map((byte, i) => byte ^ mask[i % 4]));
  return Buffer.concat([Buffer.from([0x81, 0x80 | data.length]), mask, masked]);
}

test("frames round-trip, including two-byte lengths and split frames", () => {
  const long = "x".repeat(300);
  const { frames, rest } = decodeFrames(Buffer.concat([encodeFrame("hi"), encodeFrame(long)]));
  assert.deepEqual(frames.map((f) => [f.opcode, f.payload.toString()]), [[1, "hi"], [1, long]]);
  assert.equal(rest.length, 0);
  const masked = clientFrame('{"type":"ping","id":7}');
  const first = decodeFrames(masked.subarray(0, 5));
  assert.deepEqual([first.frames.length, first.rest.length], [0, 5]);
  assert.equal(decodeFrames(masked).frames[0].payload.toString(), '{"type":"ping","id":7}');
});

test("tickets carry the socket's address and last a minute", () => {
  const relay = createRelay({ lobby: { racingPose: () => null }, now: () => 1000 });
  const { url, ticket, expiresInMs } = relay.authorize("localhost:5180");
  assert.equal(url, `ws://localhost:5180${RELAY_PATH}`);
  assert.match(ticket, /^[0-9a-f-]{36}$/);
  assert.equal(expiresInMs, 60_000);
});

test("samples carry the AI's pose with a rising sequence, or nothing when no room races", () => {
  let racing = null;
  const relay = createRelay({ lobby: { racingPose: () => racing }, now: () => 5000 });
  assert.equal(relay.sample(), null);
  racing = { roomId: "r1", pose: { x: 3 } };
  assert.deepEqual(relay.sample(), { streamId: "ai-r1", seq: 1, capturedAt: 5000, updatedAt: 5000, pose: { x: 3 } });
  assert.equal(relay.sample().seq, 2);
});

// A real server with the relay on its upgrade event, and a raw socket client.
// Upgraded sockets aren't closed by server.close(), so the test ends them.
async function startRelay(t, racingPose) {
  const relay = createRelay({ lobby: { racingPose }, now: Date.now, rate: 50 });
  const server = createServer();
  const sockets = new Set();
  server.on("upgrade", (req, socket) => {
    sockets.add(socket);
    relay.handleUpgrade(req, socket);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    return new Promise((resolve) => server.close(resolve));
  });
  return { relay, port: server.address().port };
}

function openSocket(port, protocols) {
  const key = randomBytes(16).toString("base64");
  const socket = connect(port, "127.0.0.1");
  socket.write([`GET ${RELAY_PATH} HTTP/1.1`, `Host: 127.0.0.1:${port}`, "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Key: ${key}`, "Sec-WebSocket-Version: 13", `Sec-WebSocket-Protocol: ${protocols}`, "", ""].join("\r\n"));
  let buffer = Buffer.alloc(0);
  const messages = [];
  let head = null;
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!head) {
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      head = buffer.subarray(0, end).toString();
      buffer = buffer.subarray(end + 4);
    }
    const { frames, rest } = decodeFrames(buffer);
    buffer = rest;
    for (const frame of frames) messages.push(JSON.parse(frame.payload.toString()));
  });
  const until = async (check) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
  };
  return { socket, messages, until, head: () => head, accept: createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64") };
}

test("a socket with a valid ticket gets ready, pongs and the AI's poses", async (t) => {
  const { relay, port } = await startRelay(t, () => ({ roomId: "r1", pose: { x: 1 } }));
  const { ticket } = relay.authorize(`127.0.0.1:${port}`);
  const client = openSocket(port, `${PROTOCOL}, ticket.${ticket}`);
  t.after(() => client.socket.destroy());
  await client.until(() => client.messages.some((m) => m.type === "pose"));
  assert.match(client.head(), /^HTTP\/1\.1 101/);
  assert.match(client.head(), new RegExp(`Sec-WebSocket-Accept: ${client.accept.replace(/[+/]/g, "\\$&")}`));
  assert.match(client.head(), new RegExp(`Sec-WebSocket-Protocol: ${PROTOCOL}`));
  assert.deepEqual(client.messages[0], { type: "ready" });
  const pose = client.messages.find((m) => m.type === "pose");
  assert.deepEqual([pose.sample.streamId, pose.sample.pose], ["ai-r1", { x: 1 }]);
  client.socket.write(clientFrame('{"type":"ping","id":42}'));
  await client.until(() => client.messages.some((m) => m.type === "pong"));
  assert.deepEqual(client.messages.find((m) => m.type === "pong"), { type: "pong", id: 42 });
});

test("a socket without a valid ticket is refused", async (t) => {
  const { port } = await startRelay(t, () => null);
  const client = openSocket(port, `${PROTOCOL}, ticket.not-a-ticket`);
  t.after(() => client.socket.destroy());
  await client.until(() => client.head());
  assert.match(client.head(), /^HTTP\/1\.1 401/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/relay.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/lagoon/relay.mjs`.

- [ ] **Step 3: Write `server/lagoon/relay.mjs`:**

```js
// A minimal WebSocket relay for the local 1v1, speaking the game's relay
// protocol: the game connects with a ticket from POST /api/lagoons/connect,
// gets "ready", and then the AI's poses about 30 times a second while the room
// races. It answers pings and ignores the game's own poses. No dependencies:
// just the handshake and text frames.
import { createHash, randomUUID } from "node:crypto";

export const PROTOCOL = "fristajlo-v2";
export const RELAY_PATH = "/__relay";
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const TICKET_MS = 60_000;

// A server-to-client text frame.
export function encodeFrame(text, opcode = 0x1) {
  const data = Buffer.from(text);
  const length = data.length;
  let header;
  if (length < 126) header = Buffer.from([0x80 | opcode, length]);
  else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, data]);
}

// Complete frames from the start of buffer (client frames are masked), and the
// bytes left over: { frames: [{ opcode, payload }], rest }.
export function decodeFrames(buffer) {
  const frames = [];
  let at = 0;
  while (buffer.length - at >= 2) {
    const opcode = buffer[at] & 0x0f;
    const masked = buffer[at + 1] & 0x80;
    let length = buffer[at + 1] & 0x7f;
    let head = 2;
    if (length === 126) {
      if (buffer.length - at < 4) break;
      length = buffer.readUInt16BE(at + 2);
      head = 4;
    } else if (length === 127) {
      if (buffer.length - at < 10) break;
      length = Number(buffer.readBigUInt64BE(at + 2));
      head = 10;
    }
    const maskAt = at + head;
    const dataAt = maskAt + (masked ? 4 : 0);
    if (buffer.length < dataAt + length) break;
    const payload = Buffer.from(buffer.subarray(dataAt, dataAt + length));
    if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= buffer[maskAt + (i % 4)];
    frames.push({ opcode, payload });
    at = dataAt + length;
  }
  return { frames, rest: buffer.subarray(at) };
}

// lobby.racingPose() gives { roomId, pose } or null.
export function createRelay({ lobby, now, rate = 30 }) {
  const tickets = new Map();

  // The answer to POST /api/lagoons/connect. host: the request's Host header.
  function authorize(host) {
    for (const [ticket, expires] of tickets) if (expires < now()) tickets.delete(ticket);
    const ticket = randomUUID();
    tickets.set(ticket, now() + TICKET_MS);
    return { url: `ws://${host}${RELAY_PATH}`, ticket, expiresInMs: TICKET_MS };
  }

  // The AI's latest pose as a relay sample, or null when no room races.
  let seq = 0;
  function sample() {
    const current = lobby.racingPose();
    if (!current) return null;
    const t = now();
    return { streamId: `ai-${current.roomId}`, seq: ++seq, capturedAt: t, updatedAt: t, pose: current.pose };
  }

  function handleUpgrade(req, socket) {
    const offered = (req.headers["sec-websocket-protocol"] ?? "").split(",").map((p) => p.trim());
    const ticket = offered.find((p) => p.startsWith("ticket."))?.slice("ticket.".length);
    const path = new URL(req.url, "http://localhost").pathname;
    if (path !== RELAY_PATH || !offered.includes(PROTOCOL) || !tickets.has(ticket) || tickets.get(ticket) < now()) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + GUID).digest("base64");
    socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, `Sec-WebSocket-Protocol: ${PROTOCOL}`, "", ""].join("\r\n"));
    const send = (message) => socket.writable && socket.write(encodeFrame(JSON.stringify(message)));
    send({ type: "ready" });
    const timer = setInterval(() => {
      const next = sample();
      if (next) send({ type: "pose", sample: next });
    }, 1000 / rate);
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      const { frames, rest } = decodeFrames(Buffer.concat([pending, chunk]));
      pending = rest;
      for (const { opcode, payload } of frames) {
        if (opcode === 0x8) socket.end(encodeFrame("", 0x8));
        else if (opcode === 0x9) socket.write(encodeFrame(payload.toString(), 0xa));
        else if (opcode === 0x1) {
          let message;
          try {
            message = JSON.parse(payload.toString());
          } catch {
            continue;
          }
          if (message.type === "ping") send({ type: "pong", id: message.id });
        }
      }
    });
    const stop = () => clearInterval(timer);
    socket.on("close", stop);
    socket.on("error", stop);
  }

  return { authorize, sample, handleUpgrade };
}
```

- [ ] **Step 4: Run the test to see it pass** (with a time limit: a hang means an upgraded socket wasn't closed)

Run: `timeout 60 node --test test/relay.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lagoon/relay.mjs test/relay.test.mjs
git commit -m "Add a WebSocket relay for the AI's poses" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Endpoints and wiring

**Files:**
- Replace: `server/api/lagoons.mjs`
- Create: `server/api/weekly.mjs`
- Modify: `server/api/index.mjs`, `server/app.mjs`
- Test: `test/api-weekly.test.mjs`

- [ ] **Step 1: Write the failing test** in `test/api-weekly.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { createLobby } from "../server/lagoon/lobby.mjs";
import { createRelay } from "../server/lagoon/relay.mjs";
import { createStore } from "../server/store.mjs";
import { loadTour } from "../server/tour.mjs";
import { DEFAULT_WIND, weekOf } from "../server/weekly.mjs";
import { fakeGame, tempDir, writeTour } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
// Room ids ending in a multiple of 3 have the default wind; the rest don't.
const roomConditions = (id) => (Number(id.split("-").at(-1)) % 3 ? { seed: 2, knots: 19, gustKnots: 5 } : { seed: 1, ...DEFAULT_WIND });
const attempt = (id, score) => ({ id, status: "landed", score, tack: "port", label: "Culo" });

function setup(t, { tour = true, ai } = {}) {
  const dir = tempDir(t);
  if (tour) writeTour(join(dir, "tour"));
  const store = createStore(join(dir, "db.json"));
  store.update((data) => void data.riders.push({ key: "k1", nickname: "Tester", appearance: { sail: "teal" } }));
  const calls = [];
  ai ??= {
    async sail(conditions, target) {
      calls.push(["sail", conditions, target]);
      return { replay: { format: 1, steps: 10, events: "" }, score: 30, attempts: [attempt(1, 30)], tricks: [], steps: 10 };
    },
    async poses(conditions, replay) {
      calls.push(["poses", conditions, replay]);
      return { poses: [{ x: 0 }], settledAt: { 1: 50 } };
    },
  };
  const game = { ...fakeGame, roomConditions };
  const lobby = createLobby({ now: () => NOW, score: (attempts) => fakeGame.heatTotals({ attempts }).total });
  const ctx = {
    store,
    game,
    now: () => NOW,
    tour: loadTour(join(dir, "tour")),
    ai,
    aiHeats: createStore(join(dir, "ai-heats.json"), { heats: {} }),
    weekly: createStore(join(dir, "weekly.json"), { weeks: {}, prize: null }),
    lobby,
    relay: createRelay({ lobby, now: () => NOW }),
    snapshot: "2026-10-24",
  };
  const call = (method, path, body = {}) => handleApi({ method, path, query: new URLSearchParams(), body, host: "localhost:5180" }, ctx);
  return { ctx, call, calls };
}

test("this week's super final names the event and each division's opponent, under pseudonyms", (t) => {
  const { ctx, call } = setup(t);
  const week = weekOf(ctx.tour, fakeGame.weekStart(NOW));
  const { status, body } = call("GET", "/api/local/weekly");
  assert.equal(status, 200);
  assert.deepEqual({ ...body, divisions: Object.keys(body.divisions) }, {
    weekStart: fakeGame.weekStart(NOW),
    event: { id: week.event.id, name: week.event.name, start: week.event.start, location: "Somewhere" },
    divisions: Object.keys(week.event.divisions),
    wind: DEFAULT_WIND,
    best: null,
    won: false,
    prize: false,
  });
  assert.ok(!JSON.stringify(body).includes("Yentel Caers") && !JSON.stringify(body).includes("Balz Müller"));
});

test("starting sails the winner's heat in a room with the default wind, offers the challenge, and reuses the heat", async (t) => {
  const { ctx, call, calls } = setup(t);
  const week = weekOf(ctx.tour, fakeGame.weekStart(NOW));
  const division = Object.keys(week.event.divisions)[0];
  const { status, body } = await call("POST", "/api/local/weekly/start", { division });
  assert.equal(status, 200);
  assert.deepEqual(body, { pseudonym: ctx.tour.riders.get(week.event.divisions[division].entries[0].rider).pseudonym, wind: DEFAULT_WIND });
  assert.deepEqual(calls.map(([kind, conditions]) => [kind, conditions]), [["sail", { seed: 1, ...DEFAULT_WIND }], ["poses", { seed: 1, ...DEFAULT_WIND }]]);
  const lobby = call("POST", "/api/lagoons", { playerKey: "k1" }).body;
  assert.deepEqual([lobby.challenges[0].senderName, lobby.challenges[0].recipientName], [body.pseudonym, "Tester"]);
  const room = call("POST", "/api/lagoons", { playerKey: "k1", action: "accept", challengeId: lobby.challenges[0].id }).body.room;
  assert.equal(room.id, `super-final-${week.event.id}-${NOW}-0`);
  await call("POST", "/api/local/weekly/start", { division });
  assert.deepEqual(calls.map(([kind]) => kind), ["sail", "poses", "poses"], "the second start reuses the sailed heat");
});

test("the 1v1 endpoints go to the lobby and relay: tickets, the AI's pose, and the old answers", (t) => {
  const { call } = setup(t);
  assert.deepEqual(call("POST", "/api/lagoons/lobby-connect").body, { relay: null });
  const { relay } = call("POST", "/api/lagoons/connect", { roomId: "r" }).body;
  assert.equal(relay.url, "ws://localhost:5180/__relay");
  assert.deepEqual(call("POST", "/api/lagoons/opponent", { roomId: "r" }).body, { opponent: null });
  assert.equal(call("POST", "/api/lagoons/signaling").status, 404);
  assert.deepEqual(call("POST", "/api/lagoons", { playerKey: "k1", action: "sync" }).body, { serverTime: NOW, room: null, riders: [], challenges: [], rankings: [] });
});

test("errors: no tour data, a division the event didn't have, and a planner failure", async (t) => {
  const noTour = setup(t, { tour: false });
  assert.equal(noTour.call("GET", "/api/local/weekly").status, 404);
  assert.equal((await noTour.call("POST", "/api/local/weekly/start", { division: "men" })).status, 404);
  const failing = setup(t, { ai: { sail: async () => { throw new Error("the planner fell over"); }, poses: async () => ({}) } });
  const week = weekOf(failing.ctx.tour, fakeGame.weekStart(NOW));
  assert.equal((await failing.call("POST", "/api/local/weekly/start", { division: "juniors" })).status, 404);
  const present = Object.keys(week.event.divisions)[0];
  const { status, body } = await failing.call("POST", "/api/local/weekly/start", { division: present });
  assert.equal(status, 500);
  assert.match(body.error, /^Couldn't get .+ ready: the planner fell over$/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/api-weekly.test.mjs`
Expected: FAIL in all 4 tests. The weekly routes answer 404, and `/api/lagoons/connect` answers 404.

- [ ] **Step 3: Replace `server/api/lagoons.mjs`** with:

```js
// The game's 1v1 endpoints. Lobby polls and actions go to the local lobby
// (server/lagoon/lobby.mjs), which is empty until a super final is offered;
// the relay hands out tickets for its socket, and the HTTP pose exchange gets
// the AI's latest pose. The lobby socket is told there is no relay, which
// keeps the lobby itself on HTTP polling, and WebRTC signaling is unavailable.
import { fail, ok } from "./reply.mjs";

const EMPTY = { room: null, riders: [], challenges: [], rankings: [] };

const playerOf = (store, key) => {
  const rider = store.data.riders.find((r) => r.key === key);
  return { nickname: rider?.nickname ?? "Rider", appearance: rider?.appearance ?? {} };
};

// ctx: { store, now, lobby, relay } (lobby and relay are missing in some tests).
export function lagoons(path, body = {}, host, { store, now, lobby, relay }) {
  if (path === "/api/lagoons/lobby-connect") return ok({ relay: null });
  if (path === "/api/lagoons") return ok(lobby ? lobby.act(body, playerOf(store, body.playerKey)) : { serverTime: now(), ...EMPTY });
  if (path === "/api/lagoons/connect" && relay) return ok({ relay: relay.authorize(host) });
  if (path === "/api/lagoons/opponent" && relay) return ok({ opponent: relay.sample() });
  return fail(404, "1v1 is unavailable in the local copy.");
}
```

- [ ] **Step 4: Write `server/api/weekly.mjs`:**

```js
// Endpoints for the super final mod: this week's event and opponents, and
// getting an opponent ready in the local 1v1 lobby. Pseudonyms only.
import { DEFAULT_WIND, opponentFor, roomIdsFor, weekOf } from "../weekly.mjs";
import { fail, ok } from "./reply.mjs";

const NO_TOUR = "No tour data on this computer: run npm run tour-data.";

// This week's event, its divisions' opponents, the wind, your best score,
// whether you won, and whether the prize is earned.
export function weeklyInfo({ tour, game, now, weekly }) {
  if (!tour) return fail(404, NO_TOUR);
  const week = weekOf(tour, game.weekStart(now()));
  const { event } = week;
  const divisions = {};
  for (const name of Object.keys(event.divisions)) {
    const opponent = opponentFor(tour, week, name);
    divisions[name] = { pseudonym: opponent.nickname, average: opponent.average };
  }
  const record = weekly.data.weeks[week.weekStart];
  return ok({
    weekStart: week.weekStart,
    event: { id: event.id, name: event.name, start: event.start, location: event.location },
    divisions,
    wind: DEFAULT_WIND,
    best: record?.best ?? null,
    won: !!record?.won,
    prize: !!weekly.data.prize,
  });
}

// Sails (or reuses) the opponent's heat in the room's wind, turns it into a
// pose track and offers the challenge in the lobby. body: { division }.
export async function startWeekly(body, { tour, game, now, ai, aiHeats, lobby, snapshot }) {
  if (!tour) return fail(404, NO_TOUR);
  const week = weekOf(tour, game.weekStart(now()));
  const opponent = opponentFor(tour, week, body.division);
  if (!opponent) return fail(404, `${week.event.name} had no ${body.division}'s final.`);
  const { target } = opponent;
  const roomIds = roomIdsFor(game.roomConditions, DEFAULT_WIND, `super-final-${week.event.id}-${now()}`);
  const firstRoom = roomIds.next().value;
  const conditions = game.roomConditions(firstRoom);
  const key = `${snapshot}|super-final|${week.weekStart}|${body.division}|${DEFAULT_WIND.knots}-${DEFAULT_WIND.gustKnots}|${target}`;
  try {
    let heat = aiHeats.data.heats[key];
    if (!heat) {
      const sailed = await ai.sail(conditions, target);
      heat = { key, rider: opponent.id, pseudonym: opponent.nickname, conditions, target, score: sailed.score, attempts: sailed.attempts, replay: sailed.replay };
      aiHeats.update((data) => void (data.heats[key] = heat));
    }
    const { poses, settledAt } = await ai.poses(conditions, heat.replay);
    let next = firstRoom;
    const nextRoomId = () => {
      const id = next ?? roomIds.next().value;
      next = null;
      return id;
    };
    lobby.offer(opponent, { score: heat.score, attempts: heat.attempts, poses, settledAt }, nextRoomId, { weekStart: week.weekStart, event: week.event.id, division: body.division });
  } catch (error) {
    return fail(500, `Couldn't get ${opponent.nickname} ready: ${error.message}`);
  }
  return ok({ pseudonym: opponent.nickname, wind: DEFAULT_WIND });
}
```

- [ ] **Step 5: Route them.** In `server/api/index.mjs`:
  - after `import { aiHeat, eventRiders, listSeasons } from "./tour.mjs";` add `import { startWeekly, weeklyInfo } from "./weekly.mjs";`;
  - change `export function handleApi({ method, path, query, body }, ctx) {` to `export function handleApi({ method, path, query, body, host }, ctx) {`;
  - change the lagoons line to:

    ```js
      if (path === "/api/lagoons" || path.startsWith("/api/lagoons/")) return lagoons(path, body, host, ctx);
    ```

  - after the `POST /api/local/ai-heats` line add:

    ```js
      if (route === "GET /api/local/weekly") return weeklyInfo(ctx);
      if (route === "POST /api/local/weekly/start") return startWeekly(body, ctx);
    ```

- [ ] **Step 6: Wire the lobby, relay and results into the server.** In `server/app.mjs`:
  - Replace the import `import { createStore } from "./store.mjs";` with:

    ```js
    import { createLobby } from "./lagoon/lobby.mjs";
    import { createRelay } from "./lagoon/relay.mjs";
    import { createStore } from "./store.mjs";
    ```

    and after `import { loadTour } from "./tour.mjs";` add `import { recordRoom } from "./weekly.mjs";`.
  - Replace:

    ```js
    // `ai` can be replaced in tests; by default the snapshot's engine and calendar
    // are loaded, the tour data is read from tour/, and AI heats are sailed in a
    // worker thread.
    ```

    with:

    ```js
    // `ai` can be replaced in tests; by default the snapshot's engine, calendar and
    // wind are loaded, the tour data is read from tour/, and AI heats are sailed in
    // a worker thread.
    ```

  - Change `game ??= await loadGame(snapshot, ["engine", "week"]);` to `game ??= await loadGame(snapshot, ["engine", "week", "wind"]);`.
  - After the line `const aiHeats = createStore(join(dirname(dataFile), "ai-heats.json"), { heats: {} });` add:

    ```js
      const weekly = createStore(join(dirname(dataFile), "weekly.json"), { weeks: {}, prize: null });
      const lobby = createLobby({
        now,
        score: (attempts) => game.heatTotals({ attempts }).total,
        onResult: (room) => recordRoom(weekly, room, now()),
        log,
      });
      const relay = createRelay({ lobby, now });
    ```

  - Change `const ctx = { store, game, now, tour, ai, aiHeats, snapshot: snapshot.name };` to:

    ```js
      const ctx = { store, game, now, tour, ai, aiHeats, snapshot: snapshot.name, lobby, relay, weekly };
    ```

  - In `handle()`, pass the host:

    ```js
          const result = await handleApi({ method: req.method, path, query: url.searchParams, body, host: req.headers.host }, ctx);
    ```

  - Replace the end of `createApp`:

    ```js
      return createServer((req, res) => {
        handle(req, res).catch((error) => {
          log(error.stack ?? String(error));
          send(res, 500, "text/plain", "Local server error");
        });
      });
    }
    ```

    with:

    ```js
      const server = createServer((req, res) => {
        handle(req, res).catch((error) => {
          log(error.stack ?? String(error));
          send(res, 500, "text/plain", "Local server error");
        });
      });
      server.on("upgrade", (req, socket) => relay.handleUpgrade(req, socket));
      return server;
    }
    ```

- [ ] **Step 7: Run the tests, then the whole suite**

Run: `node --test test/api-weekly.test.mjs test/api-router.test.mjs test/server.test.mjs`
Expected: PASS, 4 + 6 + 6 tests. The router's old 1v1 tests still pass: without a lobby in their context, the lobby route answers the old empty lobby.

Run: `npm test`
Expected: PASS, 216 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add server/api/lagoons.mjs server/api/weekly.mjs server/api/index.mjs server/app.mjs test/api-weekly.test.mjs
git commit -m "Serve the super final through the local 1v1 lobby and relay" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Mod helpers

**Files:**
- Create: `mods/super-final/super-final.js`
- Test: `test/super-final.test.mjs`

- [ ] **Step 1: Write the failing test** in `test/super-final.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { HIDDEN_GEAR, PRIZE_TEXT, doneText, failedText, menuLine, pickDivision, prizeDue, readyText } from "../mods/super-final/super-final.js";

const info = {
  event: { name: "2019 Mercedes-Benz World Cup Sylt" },
  divisions: { men: { pseudonym: "Amada Vryeswijk", average: 42.51 }, women: { pseudonym: "Sarah-Quito Uffringa", average: 49.1 } },
  wind: { knots: 17, gustKnots: 0 },
  prize: false,
};

test("the menu line names the event, the opponent and the wind", () => {
  assert.equal(menuLine(info, "men"), "This week: 2019 Mercedes-Benz World Cup Sylt · vs Amada Vryeswijk · 17 kt");
  assert.equal(menuLine({ ...info, wind: { knots: 19, gustKnots: 5 } }, "women"), "This week: 2019 Mercedes-Benz World Cup Sylt · vs Sarah-Quito Uffringa · 19 kt, gusts 5");
});

test("the button's other lines", () => {
  assert.equal(readyText("Amada Vryeswijk"), "Getting Amada Vryeswijk ready…");
  assert.equal(doneText("Amada Vryeswijk"), "Amada Vryeswijk has challenged you: accept to start the heat");
  assert.equal(failedText("Amada Vryeswijk"), "Couldn't get Amada Vryeswijk ready. Press to try again.");
  assert.equal(PRIZE_TEXT, "Unlocked: Severne Freek CC1 sail and Severne Psycho board");
});

test("the division is the one chosen before, if this week's event had it", () => {
  assert.equal(pickDivision(info, "women"), "women");
  assert.equal(pickDivision({ ...info, divisions: { men: info.divisions.men } }, "women"), "men");
});

test("the prize is due when earned and the game's hidden gear isn't on yet", () => {
  assert.deepEqual(HIDDEN_GEAR, { key: "fristajlo.hidden-gear", event: "fristajlo-hidden-gear-change" });
  assert.equal(prizeDue({ ...info, prize: true }, null), true);
  assert.equal(prizeDue({ ...info, prize: true }, "true"), false);
  assert.equal(prizeDue(info, null), false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/super-final.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `mods/super-final/super-final.js`.

- [ ] **Step 3: Write `mods/super-final/super-final.js`:**

```js
// Pure helpers for the super final mod, shared with the tests. info is what
// GET /api/local/weekly returns.

// The game's own switch for its hidden gear, and the event it listens for.
export const HIDDEN_GEAR = { key: "fristajlo.hidden-gear", event: "fristajlo-hidden-gear-change" };
export const PRIZE_TEXT = "Unlocked: Severne Freek CC1 sail and Severne Psycho board";

const windText = (wind) => (wind.gustKnots ? `${wind.knots} kt, gusts ${wind.gustKnots}` : `${wind.knots} kt`);
export const menuLine = (info, division) => `This week: ${info.event.name} · vs ${info.divisions[division].pseudonym} · ${windText(info.wind)}`;
export const readyText = (pseudonym) => `Getting ${pseudonym} ready…`;
export const failedText = (pseudonym) => `Couldn't get ${pseudonym} ready. Press to try again.`;
export const doneText = (pseudonym) => `${pseudonym} has challenged you: accept to start the heat`;

// The division to show: the one chosen before if this week has it, else the
// first the event had.
export const pickDivision = (info, chosen) => (info.divisions[chosen] ? chosen : Object.keys(info.divisions)[0]);

// True when the prize is earned but the hidden gear isn't switched on yet.
export const prizeDue = (info, gearSetting) => info.prize && gearSetting !== "true";
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/super-final.test.mjs`
Expected: PASS, 4 tests. Then `npm test`: 220 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add mods/super-final/super-final.js test/super-final.test.mjs
git commit -m "Add the super final mod's helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Super final mod

**Files:**
- Create: `mods/super-final/index.js`
- Modify: `mods/enabled.json`

- [ ] **Step 1: Write `mods/super-final/index.js`:**

```js
// The weekly super final: a "Super final" button in the game's main menu. Each
// week it offers one past PWA event's final against the event's winner. The
// local server gets the winner ready (their heat sailed by the AI riders) and
// challenges you in the game's own 1v1 lobby, so the heat is the game's real 1v1
// heat. Your first win switches on the game's hidden gear.
import { HIDDEN_GEAR, PRIZE_TEXT, doneText, failedText, menuLine, pickDivision, prizeDue, readyText } from "./super-final.js";

const DIVISION_KEY = "freestyle-tour.super-final-division";
const TROPHY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
};
const getJson = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${url} answered ${res.status}`);
  return body;
};
const postJson = (url, body) => getJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default {
  name: "super-final",
  setup({ log }) {
    let info = null;
    let division = read(DIVISION_KEY) ?? "men";
    let status = "";
    let busy = false;

    const button = Object.assign(document.createElement("button"), { type: "button", className: "lagoon-menu-button" });
    const line = document.createElement("span");
    button.innerHTML = TROPHY;
    button.append(" Super final ", line);
    const switcher = document.createElement("div");
    switcher.style.cssText = "display:flex;gap:6px;justify-content:center;font:12px system-ui,sans-serif";

    function render() {
      line.textContent = status || (info ? menuLine(info, division) : "Loading this week's event…");
      const names = info ? Object.keys(info.divisions) : [];
      switcher.hidden = names.length < 2;
      switcher.replaceChildren(
        ...names.map((name) => Object.assign(document.createElement("button"), {
          type: "button",
          textContent: name === "men" ? "Men" : "Women",
          disabled: name === division || busy,
          onclick: () => {
            division = name;
            write(DIVISION_KEY, name);
            status = "";
            render();
          },
        })),
      );
    }

    function unlockGear() {
      write(HIDDEN_GEAR.key, "true");
      window.dispatchEvent(new Event(HIDDEN_GEAR.event));
      status = PRIZE_TEXT;
      log(PRIZE_TEXT);
    }

    // Runs whenever the menu comes back, so the line shows this week's event
    // again after a heat, and a win from that heat unlocks the prize. The
    // "Unlocked" line stays until the button is pressed again.
    async function refresh() {
      info = await getJson("/api/local/weekly");
      division = pickDivision(info, division);
      if (!busy && status !== PRIZE_TEXT) status = "";
      if (prizeDue(info, read(HIDDEN_GEAR.key))) unlockGear();
      render();
    }

    async function start() {
      if (busy || !info) return;
      const { pseudonym } = info.divisions[division];
      busy = true;
      status = readyText(pseudonym);
      render();
      try {
        await postJson("/api/local/weekly/start", { division });
        status = doneText(pseudonym);
      } catch (error) {
        log("could not get the opponent ready", error);
        status = failedText(pseudonym);
      } finally {
        busy = false;
        render();
      }
    }
    button.addEventListener("click", () => void start());

    // The menu is drawn by the game and redrawn often: put the button back after
    // "1v1 Lobby" whenever it's missing, and refresh this week's info then. (If
    // a game update changes the menu, the button just doesn't appear.)
    setInterval(() => {
      const lobby = [...document.querySelectorAll("section.start-panel > button.lagoon-menu-button")].find((b) => b.textContent.includes("1v1 Lobby"));
      if (lobby && button.previousElementSibling !== lobby) {
        lobby.after(button, switcher);
        // Without tour data, the server's answer says to run npm run tour-data.
        refresh().catch((error) => {
          log("could not load this week's super final", error);
          status = error.message;
          render();
        });
      }
    }, 500);
    render();
  },
};
```

- [ ] **Step 2: Enable it.** `mods/enabled.json` becomes:

```json
["local-badge", "ghosts", "replay-viewer", "challenge", "super-final"]
```

- [ ] **Step 3: Check it in the browser.** Start the server with the preview tool (`local-copy` in `.claude/launch.json`). The game only runs at full speed while the Browser pane is visible, so ask the user to keep it open. If the pane is hidden, show it with the view tool.
  1. Before pressing anything, the 1v1 Lobby says no one else is online, as before.
  2. The menu has "Super final" under "1v1 Lobby", naming this week's event, the opponent and 17 kt.
  3. Press it. The status goes "Getting … ready…", then "… has challenged you: accept to start the heat", and within a few seconds the game's challenge toast appears. Accept.
  4. The countdown shows "Wind: 17 kt, steady wind". The opponent sails under their pseudonym, and the HUD's "vs …" score rises as their moves land.
  5. Let it run out. The result screen names the winner, with both scores.
  6. Press "Challenge again". A new heat starts at once, with the clock starting from the countdown, not partway through.
  7. Open the heat menu and "Forfeit · back to lobby". The result shows "Forfeit", and `data/weekly.json` doesn't change.
  8. The prize:
     - Stop the server. In `data/weekly.json`, set this week's `won` to `true` and `prize` to `{ "earnedAt": 1 }`, then start the server again and reload.
     - The button says "Unlocked: Severne Freek CC1 sail and Severne Psycho board", and the look editor's Gear tab lists both.
     - Then put `data/weekly.json` back as it was, and in the page run `localStorage.removeItem("fristajlo.hidden-gear")`, so the prize is still the user's to win.
  9. A solo heat still works, with the ghost.

  If something fails, use superpowers:systematic-debugging before changing code.

- [ ] **Step 4: Commit**

```bash
git add mods/super-final/index.js mods/enabled.json
git commit -m "Add the super final mod" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Documentation

**Files:**
- Modify: `README.md`, `docs/roadmap.md`

- [ ] **Step 1: Document it.** In `README.md`'s Mods list, after the `challenge` item, add:

```markdown
- `super-final`: a "Super final" button in the main menu. Each week it offers
  one past PWA event's final against that event's winner, sailed as the game's
  own 1v1 heat: the local server plays the other side of the 1v1 lobby, and the
  AI riders sail the winner's heat. Your first win switches on the game's hidden
  gear (the Severne Freek CC1 sail and Severne Psycho board). If a game update
  changes the menu, the button doesn't appear.
```

After the paragraph that starts "The challenge mod uses three more", add:

```markdown
The super final uses `GET /api/local/weekly` and `POST /api/local/weekly/start`,
and the game's own 1v1 endpoints (`/api/lagoons`, `/api/lagoons/connect`, a
WebSocket at `/__relay`, `/api/lagoons/opponent`), which stay an empty lobby
until a super final is waiting. Results are kept in `data/weekly.json`.
```

- [ ] **Step 2: Mark part 1 done** in `docs/roadmap.md`. Change `1. **Weekly super final:**` to `1. **Weekly super final (done):**`, and after its `Spec:` line add `     Plan: \`docs/superpowers/plans/2026-10-25-weekly-super-final.md\`.`.

- [ ] **Step 3: Run the whole suite and commit**

Run: `npm test`
Expected: PASS, 220 tests, 0 failures.

```bash
git add README.md docs/roadmap.md
git commit -m "Document the weekly super final" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Changes during execution (2026-10-25)

Reviews after each task changed a few things from the code above:

- **Task 1:** events where a division lists more than one rider at place 1 (a
  final never sailed, such as 2024 Sylt) are left out of the weekly pool. The
  picker's tests also cover the id-order sort, draws, a forfeit into an empty
  store, and the average.
- **Task 4:** leaving during the countdown voids the room (the game calls it a
  cancel), and a cancelled room doesn't show the AI's heat.
- **Task 5:** a refused relay socket gets an error listener, so a client
  resetting the connection can't stop the server.
- **Task 6:** a result that can't be written is logged instead of thrown (it
  can run inside the relay's timer). A missing room wind answers the usual
  JSON 500, and the retry test retries an hour later in the week.
- **Task 7:** gusts are written as the game writes them ("19 kt, gusts
  21–24 kt").
- **Task 8:** the button loop starts once the game runs (`whenGame()`), the
  button is off whenever the game's lobby button is, and the Men/Women switch
  is sorted, with the chosen division in bold.
- The suite has 223 tests, not 220.
