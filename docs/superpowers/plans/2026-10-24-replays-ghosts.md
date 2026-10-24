# Replays and Ghosts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two mods for the local copy: `ghosts` (sail a solo heat against a ghost of the week's best stored heat) and `replay-viewer` (watch stored heats again and save clips), built on a shared replay runner.

**Architecture:** A plain module, `mods/lib/replay.js`, re-simulates a stored recording by feeding its control events into the game's own `Controls` and stepping the game's own engine, with checkpoints for seeking. The ghosts mod runs it one step per player step and draws it with the game's 1v1 opponent display. The viewer swaps the replayed state into `game.state` while the menu is open. The local server stores each heat's wind and gains two read-only endpoints for the mods.

**Tech Stack:** Node 22+ built-ins, browser ES modules, the game's own engine and three.js scene (from the snapshot), `MediaRecorder` for clips.

**Spec:** `docs/superpowers/specs/2026-10-24-replays-ghosts-design.md`

---

## Facts this plan relies on (verified 2026-10-24)

- A prototype of the runner in this plan, run against `vendor/2026-10-24`:
  - It recorded a scripted 20-second heat with the game's own `Controls` and recorder. The heat landed a Forward loop (4.78) and an Air Flaka (4.85).
  - Re-simulating the recording ended in an identical state (same SHA-256 of `JSON.stringify(state)`).
  - Seeking backwards and forwards across checkpoints matched a straight run.
- New signatures each match exactly one export:
  - `keyCodes`: an array starting with `Space` that contains `SpeedDial`, in the controls module.
  - `Recorder`: a class with `step` and `replay` methods, in the controls module.
  - `riderPose`: source contains `trickStartedAt=<x>.trick?`, in the pose module.
- `Invalid rider pose.` appears in exactly one module (`visual-pose-*.js`).
- Recording format: each event is a step delta followed by an opcode.
  - **Step delta:** base-128, low bits first, high bit set on every byte except the last.
  - **Opcodes:** `254` = release; `255, x, y` = stick, with `x` and `y` as `round(v * 127) & 255`; anything else = key, as `index * 2 + (down ? 0 : 1)` into `keyCodes`.
  - **Output:** `{ format: 1, steps, events: base64 }`.
- A full 3-minute heat replays in about 53 ms in Node. Copying a state takes about 0.04 ms.
- The game object has `showOpponent(name, now, appearance = default)`, `receiveOpponent(pose)`, `clearOpponent()`, `cameraView` (with `reset()`), `wake.clear()`, `renderer.domElement`, `active` and `competitionClock`.
- When no session is running, the game draws `game.state` every frame without stepping it. The rider is drawn at the state's position once `totalTime > 0`.
- The menu lives in `.menu-layer`. Each session gets a new `game.state` object, and the step hook sees it with `totalTime === 0` before the first step.

## File structure

| File | Responsibility |
|---|---|
| `lib/snapshot.mjs` (modify) | Add the `pose` part marker and `reindexSnapshot()` |
| `tools/snapshot.mjs` (modify) | `--reindex <name>` |
| `mods/lib/identify.js` (modify) | Signatures `keyCodes`, `Recorder`, `riderPose` |
| `mods/lib/replay.js` (create) | `decodeEvents()`, `createRunner()` |
| `sim/record.mjs` (create) | `DEMO_SCRIPT`, `DEMO_STEPS`, `recordHeat()` |
| `server/api/heats.mjs` (modify) | Store `conditions` when a heat starts |
| `server/api/local.mjs` (create) | `listHeats()`, `heatDetail()` |
| `server/api/index.mjs` (modify) | Route the two local endpoints |
| `tools/demo-heat.mjs` (create) | Store a demo heat for the current week |
| `mods/ghosts/ghost.js` (create) | `pickGhost`, `ghostLabel`, `stepOf`, `isHeatStart` |
| `mods/ghosts/index.js` (create) | Ghost toggle and per-step ghost |
| `mods/replay-viewer/timeline.js` (create) | Time, speed, clip and file-name helpers, camera presets |
| `mods/replay-viewer/index.js` (create) | Viewer UI |
| `mods/enabled.json` (modify) | Enable the two mods |
| `README.md` (modify) | Document the mods and the demo tool |
| Tests | `test/snapshot-lib.test.mjs`, `test/crawl.test.mjs`, `test/identify.test.mjs`, `test/identify-snapshot.test.mjs` (modify); `test/replay.test.mjs`, `test/replay-snapshot.test.mjs`, `test/api-local.test.mjs`, `test/ghost.test.mjs`, `test/timeline.test.mjs` (create) |

All commands run from the repo root (`C:\Users\mateusz\Projects\freestyle-tour`) in Git Bash. Work on a branch: `git checkout -b replays-ghosts`.

---

### Task 1: The `pose` part and reindexing

**Files:**
- Modify: `lib/snapshot.mjs`, `tools/snapshot.mjs`
- Test: `test/snapshot-lib.test.mjs`, `test/crawl.test.mjs`

- [ ] **Step 1: Update the tests**

In `test/snapshot-lib.test.mjs`, change the import line to:

```js
import { PART_MARKERS, fileFor, findParts, openSnapshot, reindexSnapshot, tryOpenSnapshot } from "../lib/snapshot.mjs";
```

and append this test at the end of the file:

```js
test("reindexSnapshot recomputes the parts from the snapshot's files", (t) => {
  const root = tempDir(t);
  const files = { "/": "<html><head></head></html>" };
  for (const [part, marker] of Object.entries(PART_MARKERS)) files[pathFor(part)] = `x${marker}y`;
  const snapshot = makeSnapshot(root, "s1", files, { engine: pathFor("engine") });
  const expected = Object.fromEntries(Object.keys(PART_MARKERS).map((part) => [part, pathFor(part)]));
  assert.deepEqual(reindexSnapshot(snapshot.dir).parts, expected);
  assert.deepEqual(openSnapshot(root).manifest.parts, expected);
});
```

In `test/crawl.test.mjs`, replace the `MARKERS` line with:

```js
const MARKERS = "attemptsPerTack:1;Math.sin(r*.17);syncAir(;areaArrow;Europe/Warsaw;Invalid rider pose.";
```

- [ ] **Step 2: Run them to see the new test fail**

Run: `node --test test/snapshot-lib.test.mjs`
Expected: FAIL with `SyntaxError: The requested module '../lib/snapshot.mjs' does not provide an export named 'reindexSnapshot'`.

- [ ] **Step 3: Update `lib/snapshot.mjs`**

Change the `node:fs` import to:

```js
import { existsSync, readFileSync, writeFileSync } from "node:fs";
```

Replace the `PART_MARKERS` object with:

```js
export const PART_MARKERS = {
  engine: "attemptsPerTack:", // physics, tricks and judging
  wind: "Math.sin(r*.17)", // conditions and the wind model
  controls: "syncAir(", // keyboard/touch handler and heat replay recorder
  scene: "areaArrow", // the three.js scene
  week: "Europe/Warsaw", // weekly challenge calendar and its wind
  pose: "Invalid rider pose.", // builds rider poses for the 1v1 opponent display
};
```

Append at the end of the file:

```js
// Recomputes the parts of an existing snapshot from its files and rewrites its
// manifest, for when a part is added after the snapshot was taken.
export function reindexSnapshot(dir) {
  const manifestFile = join(dir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const modules = new Map(
    manifest.files.filter((f) => /\.m?js$/.test(f.path)).map((f) => [f.path, readFileSync(join(dir, fileFor(f.path)), "utf8")]),
  );
  manifest.parts = findParts(modules);
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/snapshot-lib.test.mjs test/crawl.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Add `--reindex` to `tools/snapshot.mjs`**

Change the `../lib/snapshot.mjs` import to:

```js
import { fileFor, findParts, reindexSnapshot } from "../lib/snapshot.mjs";
```

Replace the whole `main` function with:

```js
async function main() {
  const { values } = parseArgs({
    options: {
      site: { type: "string", default: "https://fristajlo.ws" },
      name: { type: "string", default: new Date().toISOString().slice(0, 10) },
      reindex: { type: "string" },
    },
  });
  const root = fileURLToPath(new URL("..", import.meta.url));
  if (values.reindex) {
    const manifest = reindexSnapshot(join(root, "vendor", values.reindex));
    console.log(`Reindexed vendor/${values.reindex}`);
    for (const [part, path] of Object.entries(manifest.parts)) console.log(`  ${part.padEnd(8)} ${path}`);
    return;
  }
  const dir = join(root, "vendor", values.name);
  if (existsSync(dir)) throw new Error(`vendor/${values.name} already exists; choose another --name`);
  const result = await crawl(values.site, fetchFile);
  if (result.missing.length) throw new Error(`Could not download: ${result.missing.join(", ")}`);
  const manifest = await writeSnapshot(dir, values.site, result);
  await writeFile(join(root, "vendor", "current.json"), `${JSON.stringify({ snapshot: values.name })}\n`);
  console.log(`Saved ${manifest.files.length} files to vendor/${values.name}`);
  for (const [part, path] of Object.entries(manifest.parts)) console.log(`  ${part.padEnd(8)} ${path}`);
  if (manifest.skipped.length) console.log(`Not on the site (guessed names, ignored): ${manifest.skipped.join(", ")}`);
}
```

- [ ] **Step 6: Reindex the current snapshot**

Run: `npm run snapshot -- --reindex "$(node -p "require('./vendor/current.json').snapshot")"`
Expected:

```
Reindexed vendor/2026-10-24
  engine   /_next/static/chunks/useCompositeListItem-BIKKocPT.js
  wind     /_next/static/chunks/conditions-C2esDKY1.js
  controls /_next/static/chunks/heat-replay-DtwJcRdn.js
  scene    /_next/static/chunks/scene-BbDerLnh.js
  week     /_next/static/chunks/scoring-version-DZVDsYJt.js
  pose     /_next/static/chunks/visual-pose-B41fQicc.js
```

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS for every test (the integrity test now finds the `pose` part).

- [ ] **Step 8: Commit**

```bash
git add lib/snapshot.mjs tools/snapshot.mjs test/snapshot-lib.test.mjs test/crawl.test.mjs
git commit -m "Add the pose part and snapshot reindexing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Signatures for replaying

**Files:**
- Modify: `mods/lib/identify.js`
- Test: `test/identify.test.mjs`, `test/identify-snapshot.test.mjs`

- [ ] **Step 1: Update the tests**

In `test/identify.test.mjs`, replace the last test with:

```js
test("signatures cover the five parts the loader identifies", () => {
  assert.deepEqual(Object.keys(SIGNATURES), ["engine", "wind", "controls", "week", "pose"]);
});
```

In `test/identify-snapshot.test.mjs`, replace the first test with:

```js
test("every signature matches exactly once in the current snapshot", { skip }, async () => {
  const game = await loadGame(snapshot, ["engine", "wind", "controls", "week", "pose"]);
  for (const signatures of Object.values(SIGNATURES)) {
    for (const label of Object.keys(signatures)) assert.notEqual(game[label], undefined, `${label} not found`);
  }
  assert.equal(typeof game.step, "function");
  assert.equal(typeof game.heatRules.seconds, "number");
  assert.equal(game.keyCodes[0], "Space");
  assert.equal(typeof game.Recorder, "function");
  assert.equal(typeof game.riderPose, "function");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/identify.test.mjs test/identify-snapshot.test.mjs`
Expected: FAIL: the parts list lacks `pose`, and `game.keyCodes` is undefined.

- [ ] **Step 3: Update `mods/lib/identify.js`**

Replace the `controls` entry of `SIGNATURES` with the following, and add the `pose` entry after `week`:

```js
  controls: {
    Controls: (v) => isClass(v, ["setKey", "setStick", "read", "release"]),
    heatStart: (v) => /^function [\w$]+\(t,n\)\{let r=[\w$]+\(t\);return r\.heat\.enabled=!0,n\.release\(r\)/.test(src(v)),
    keyCodes: (v) => Array.isArray(v) && v[0] === "Space" && v.includes("SpeedDial"),
    Recorder: (v) => isClass(v, ["step", "replay"]),
  },
```

```js
  pose: {
    riderPose: (v) => /trickStartedAt=[\w$]+\.trick\?/.test(src(v)),
  },
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/identify.test.mjs test/identify-snapshot.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add mods/lib/identify.js test/identify.test.mjs test/identify-snapshot.test.mjs
git commit -m "Identify the key codes, recorder and pose builder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The replay runner (`mods/lib/replay.js`)

**Files:**
- Create: `mods/lib/replay.js`
- Test: `test/replay.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/replay.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRunner, decodeEvents } from "../mods/lib/replay.js";

const KEYS = ["Space", "KeyW"];
const encode = (bytes) => btoa(String.fromCharCode(...bytes));

// Builds a recording the way the game's recorder does.
function recording(totalSteps, events) {
  const bytes = [];
  let last = 0;
  for (const e of events) {
    let delta = e.step - last;
    last = e.step;
    while (delta >= 128) {
      bytes.push((delta & 127) | 128);
      delta >>>= 7;
    }
    bytes.push(delta);
    if (e.type === "release") bytes.push(254);
    else if (e.type === "stick") bytes.push(255, Math.round(e.x * 127) & 255, Math.round(e.y * 127) & 255);
    else bytes.push(KEYS.indexOf(e.code) * 2 + (e.down ? 0 : 1));
  }
  return { format: 1, steps: totalSteps, events: encode(bytes) };
}

// Stands in for the game: the state counts steps and sums what the controls report.
function fakeEngine() {
  const log = [];
  class Controls {
    constructor() {
      this.keys = new Set();
      this.stick = { x: 0, y: 0 };
    }
    setKey(state, code, down) {
      log.push(`${state.t}:${code}:${down}`);
      if (down) this.keys.add(code);
      else this.keys.delete(code);
    }
    setStick(state, x, y) {
      log.push(`${state.t}:stick`);
      this.stick = { x, y };
    }
    release(state) {
      log.push(`${state.t}:release`);
      this.keys.clear();
      this.stick = { x: 0, y: 0 };
    }
    read() {
      return { held: this.keys.size, x: this.stick.x };
    }
  }
  return {
    log,
    Controls,
    keyCodes: KEYS,
    heatStart: (conditions) => ({ t: 0, sum: 0, seed: conditions.seed }),
    step: (state, input) => {
      state.t += 1;
      state.sum += input.held * 10 + input.x;
    },
  };
}

test("decodeEvents reads key, stick and release events and two-byte step gaps", () => {
  const replay = { format: 1, steps: 300, events: encode([0, 254, 3, 2, 197, 1, 3, 0, 255, 64, 192]) };
  assert.deepEqual(decodeEvents(replay, KEYS), [
    { step: 0, type: "release" },
    { step: 3, type: "key", code: "KeyW", down: true },
    { step: 200, type: "key", code: "KeyW", down: false },
    { step: 200, type: "stick", x: 64 / 127, y: -64 / 127 },
  ]);
});

test("events are applied before the step whose count they carry", () => {
  const engine = fakeEngine();
  const replay = recording(10, [
    { step: 3, type: "key", code: "KeyW", down: true },
    { step: 5, type: "key", code: "KeyW", down: false },
  ]);
  const runner = createRunner(engine, { conditions: { seed: 1 }, replay });
  runner.advance(10);
  assert.deepEqual(engine.log, ["3:KeyW:true", "5:KeyW:false"]);
  assert.equal(runner.state.sum, 20);
  assert.equal(runner.stepCount, 10);
  assert.equal(runner.done, true);
});

test("advance stops at the end of the recording", () => {
  const runner = createRunner(fakeEngine(), { conditions: { seed: 1 }, replay: recording(5, []) });
  runner.advance(50);
  assert.equal(runner.stepCount, 5);
  assert.equal(runner.totalSteps, 5);
  assert.equal(runner.done, true);
});

test("seek matches stepping straight through, backwards and forwards across checkpoints", () => {
  const replay = recording(1500, [
    { step: 100, type: "stick", x: 0.5, y: 0 },
    { step: 700, type: "key", code: "KeyW", down: true },
    { step: 1300, type: "release" },
  ]);
  const straight = (n) => {
    const r = createRunner(fakeEngine(), { conditions: { seed: 1 }, replay });
    r.advance(n);
    return r.state;
  };
  const runner = createRunner(fakeEngine(), { conditions: { seed: 1 }, replay });
  runner.advance(1500);
  for (const target of [650, 1400, 50, 1250, 1500]) {
    runner.seek(target);
    assert.equal(runner.stepCount, target);
    assert.deepEqual(runner.state, straight(target), `state at step ${target}`);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/replay.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `mods/lib/replay.js`.

- [ ] **Step 3: Write `mods/lib/replay.js`**

```js
// Replays a recorded heat with the game's own engine and controls. A recording
// ({ format: 1, steps, events }) lists control events with the number of
// physics steps taken before each; feeding them into a fresh Controls from the
// heat's starting state reproduces the heat exactly. Shared by the ghosts and
// replay-viewer mods and by the tests; no browser or Node dependencies.
export const DT = 1 / 120;
const RELEASE = 254;
const STICK = 255;
const CHECKPOINT_EVERY = 600;

// Returns [{ step, type: "key", code, down } | { step, type: "stick", x, y } | { step, type: "release" }].
export function decodeEvents(replay, keyCodes) {
  const bytes = Uint8Array.from(atob(replay.events), (c) => c.charCodeAt(0));
  const toStick = (b) => (b > 127 ? b - 256 : b) / 127;
  const events = [];
  let step = 0;
  for (let i = 0; i < bytes.length; ) {
    let delta = 0;
    for (let shift = 0; ; shift += 7) {
      const b = bytes[i++];
      delta += (b & 127) * 2 ** shift;
      if (b < 128) break;
    }
    step += delta;
    const op = bytes[i++];
    if (op === RELEASE) events.push({ step, type: "release" });
    else if (op === STICK) {
      events.push({ step, type: "stick", x: toStick(bytes[i]), y: toStick(bytes[i + 1]) });
      i += 2;
    } else events.push({ step, type: "key", code: keyCodes[op >> 1], down: (op & 1) === 0 });
  }
  return events;
}

// engine needs Controls, heatStart, step and keyCodes (all identified by the
// mod layer). Read `state` after every call: seeking replaces the object.
export function createRunner(engine, { conditions, replay }) {
  const events = decodeEvents(replay, engine.keyCodes);
  const checkpoints = [];
  let controls;
  let state;
  let stepCount;
  let next;

  const cloneControls = (c) =>
    Object.assign(new engine.Controls(), structuredClone(Object.fromEntries(Object.entries(c).filter(([, v]) => typeof v !== "function"))));
  const save = () => ({ stepCount, next, state: structuredClone(state), controls: cloneControls(controls) });
  const restore = (checkpoint) => {
    stepCount = checkpoint.stepCount;
    next = checkpoint.next;
    state = structuredClone(checkpoint.state);
    controls = cloneControls(checkpoint.controls);
  };
  const reset = () => {
    controls = new engine.Controls();
    state = engine.heatStart(conditions, controls);
    stepCount = 0;
    next = 0;
  };
  const apply = (event) => {
    if (event.type === "key") controls.setKey(state, event.code, event.down);
    else if (event.type === "stick") controls.setStick(state, event.x, event.y);
    else controls.release(state);
  };
  const stepOnce = () => {
    while (next < events.length && events[next].step <= stepCount) apply(events[next++]);
    engine.step(state, controls.read(state), DT);
    stepCount++;
    if (stepCount % CHECKPOINT_EVERY === 0 && !checkpoints.some((c) => c.stepCount === stepCount)) checkpoints.push(save());
  };

  reset();
  return {
    get state() {
      return state;
    },
    get stepCount() {
      return stepCount;
    },
    totalSteps: replay.steps,
    get done() {
      return stepCount >= replay.steps;
    },
    advance(n = 1) {
      for (let i = 0; i < n && stepCount < replay.steps; i++) stepOnce();
    },
    seek(target) {
      target = Math.max(0, Math.min(replay.steps, target));
      const usable = checkpoints.filter((c) => c.stepCount <= target && (target < stepCount || c.stepCount > stepCount));
      const best = usable.reduce((found, c) => (!found || c.stepCount > found.stepCount ? c : found), null);
      if (best) restore(best);
      else if (target < stepCount) reset();
      while (stepCount < target) stepOnce();
    },
  };
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/replay.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add mods/lib/replay.js test/replay.test.mjs
git commit -m "Add the replay runner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Record and replay with the real engine

**Files:**
- Create: `sim/record.mjs`
- Test: `test/replay-snapshot.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/replay-snapshot.test.mjs`:

```js
// Recordings made with the game's own controls replay exactly. Skipped when no
// snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { createRunner, decodeEvents } from "../mods/lib/replay.js";
import { DEMO_STEPS, recordHeat } from "../sim/record.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";
const hash = (state) => createHash("sha256").update(JSON.stringify(state)).digest("hex");

async function setup() {
  const engine = await loadGame(snapshot, ["engine", "wind", "controls", "week"]);
  const conditions = engine.weekConditions(engine.weekStart(Date.parse("2026-10-24T12:00:00Z")));
  return { engine, conditions, live: recordHeat(engine, conditions) };
}

test("a recorded heat replays to the same state and attempts", { skip }, async () => {
  const { engine, conditions, live } = await setup();
  assert.ok(live.state.heat.attempts.some((a) => a.status === "landed" && a.score > 0), "the demo script should land a move");
  assert.ok(decodeEvents(live.replay, engine.keyCodes).some((e) => e.type === "stick"), "the recording should include stick events");
  const runner = createRunner(engine, { conditions, replay: live.replay });
  runner.advance(DEMO_STEPS);
  assert.equal(runner.done, true);
  assert.deepEqual(runner.state.heat.attempts, live.state.heat.attempts);
  assert.equal(hash(runner.state), hash(live.state));
});

test("seeking across checkpoints matches a straight run", { skip }, async () => {
  const { engine, conditions, live } = await setup();
  const straight = (n) => {
    const r = createRunner(engine, { conditions, replay: live.replay });
    r.advance(n);
    return hash(r.state);
  };
  const runner = createRunner(engine, { conditions, replay: live.replay });
  runner.advance(DEMO_STEPS);
  for (const target of [300, 1900, 700, DEMO_STEPS]) {
    runner.seek(target);
    assert.equal(hash(runner.state), straight(target), `state at step ${target}`);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/replay-snapshot.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `sim/record.mjs`.

- [ ] **Step 3: Write `sim/record.mjs`**

```js
// Records a scripted solo heat the way the game does: the game's own Controls
// with its Recorder attached, one physics step at a time. Used by the tests and
// by tools/demo-heat.mjs. On the 2026-10-24 snapshot, with that week's wind,
// the demo script lands a Forward loop and an Air Flaka.
import { DT } from "../mods/lib/replay.js";

export const DEMO_STEPS = 120 * 20;

// Control events by step: ["key", code, down], ["stick", x, y] or ["release"].
export const DEMO_SCRIPT = {
  0: [["key", "KeyW", true]],
  500: [["key", "KeyW", false]],
  600: [["key", "Space", true]],
  700: [["key", "Space", false]],
  715: [["key", "KeyW", true]],
  740: [["key", "KeyW", false]],
  900: [["stick", 0.5, -0.3]],
  1000: [["stick", 0, 0]],
  1100: [["release"]],
  1200: [["key", "KeyD", true]],
  1400: [["key", "KeyD", false], ["key", "KeyW", true]],
  1500: [["key", "Space", true]],
  1620: [["key", "Space", false]],
  1640: [["key", "KeyA", true]],
  1650: [["key", "KeyA", false]],
};

export function recordHeat(engine, conditions, { script = DEMO_SCRIPT, steps = DEMO_STEPS } = {}) {
  const controls = new engine.Controls();
  const recorder = new engine.Recorder();
  controls.recorder = recorder.record;
  const state = engine.heatStart(conditions, controls);
  for (let i = 0; i < steps; i++) {
    for (const [type, a, b] of script[i] ?? []) {
      if (type === "key") controls.setKey(state, a, b);
      else if (type === "stick") controls.setStick(state, a, b);
      else controls.release(state);
    }
    engine.step(state, controls.read(state), DT);
    recorder.step();
  }
  return { state, replay: recorder.replay() };
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/replay-snapshot.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add sim/record.mjs test/replay-snapshot.test.mjs
git commit -m "Record and replay heats with the real engine" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Heats store their wind; local endpoints

**Files:**
- Create: `server/api/local.mjs`
- Modify: `server/api/heats.mjs`, `server/api/index.mjs`
- Test: `test/api-local.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/api-local.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { createStore } from "../server/store.mjs";
import { WEEK, fakeGame, tempDir } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const WIND = { seed: 1, knots: 18, gustKnots: 4 };
const landed = (score) => ({ tack: "port", label: "Culo", score, status: "landed" });

function setup(t) {
  let now = NOW;
  const ctx = { store: createStore(join(tempDir(t), "db.json")), game: fakeGame, now: () => now };
  const call = (method, path, body = {}, query = new URLSearchParams()) => handleApi({ method, path, query, body }, ctx);
  const { profile } = call("POST", "/api/rider", { action: "create", nickname: "Tester", appearance: { sail: "teal" } }).body;
  const play = (score, at, scoringVersion = 2) => {
    now = at;
    const { heatId } = call("POST", "/api/heats", { playerKey: profile.key, scoringVersion }).body;
    now = at + 1000;
    call("POST", "/api/leaderboard", { heatId, playerKey: profile.key, attempts: score ? [landed(score)] : [], replay: { format: 1, steps: 10, events: "" } });
    return heatId;
  };
  const list = (query = {}) => call("GET", "/api/local/heats", undefined, new URLSearchParams(query)).body;
  return { ctx, call, play, list };
}

test("heats store the week's wind when they start", (t) => {
  const { ctx, play } = setup(t);
  play(5, NOW);
  assert.deepEqual(ctx.store.data.heats[0].conditions, WIND);
});

test("the list returns finished heats newest first, filtered by week and version", (t) => {
  const { play, list } = setup(t);
  const a = play(5, NOW);
  const b = play(7, NOW + 60_000);
  const old = play(9, NOW - WEEK);
  const v3 = play(4, NOW + 120_000, 3);
  const ids = (query) => list(query).map((h) => h.heatId);
  assert.deepEqual(ids({}), [v3, b, a, old]);
  assert.deepEqual(ids({ week: String(NOW) }), [v3, b, a]);
  assert.deepEqual(ids({ week: String(NOW), version: "2" }), [b, a]);
});

test("list entries carry what the mods need", (t) => {
  const { play, list } = setup(t);
  const id = play(5, NOW);
  assert.deepEqual(list()[0], {
    heatId: id,
    nickname: "Tester",
    appearance: { sail: "teal" },
    score: 5,
    weekStart: fakeGame.weekStart(NOW),
    finishedAt: NOW + 1000,
    conditions: WIND,
    scoringVersion: 2,
    hasReplay: true,
  });
});

test("the detail adds attempts, tricks and the recording; unknown IDs are 404", (t) => {
  const { call, play } = setup(t);
  const id = play(5, NOW);
  const { status, body } = call("GET", `/api/local/heats/${id}`);
  assert.equal(status, 200);
  assert.deepEqual(body.replay, { format: 1, steps: 10, events: "" });
  assert.deepEqual(body.attempts, [landed(5)]);
  assert.deepEqual(body.tricks, [{ tack: "port", label: "Culo", score: 5 }]);
  assert.equal(call("GET", "/api/local/heats/missing").status, 404);
});

test("heats saved before wind was stored get it from their week", (t) => {
  const { ctx, play, list } = setup(t);
  play(5, NOW);
  ctx.store.update((d) => {
    delete d.heats[0].conditions;
  });
  assert.deepEqual(list()[0].conditions, WIND);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/api-local.test.mjs`
Expected: FAIL. The wind test finds no `conditions`, and the list calls return 404.

- [ ] **Step 3: Replace `server/api/heats.mjs`**

```js
// Registers a solo heat before it starts, as the original server does. The
// heat ID lets the finished heat be submitted to the leaderboard. The heat's
// wind is stored too, so replays can rebuild its starting state.
import { randomUUID } from "node:crypto";
import { fail, ok } from "./reply.mjs";

export function startHeat(body, store, game, now) {
  if (!store.data.riders.some((r) => r.key === body.playerKey)) return fail(401, "Choose a rider nickname first.");
  const weekStart = game.weekStart(now);
  const heat = {
    heatId: randomUUID(),
    playerKey: body.playerKey,
    scoringVersion: body.scoringVersion ?? 2,
    weekStart,
    conditions: game.weekConditions(weekStart),
    startedAt: now,
  };
  store.update((d) => void d.heats.push(heat));
  return ok({ heatId: heat.heatId, weekStart: heat.weekStart });
}
```

- [ ] **Step 4: Write `server/api/local.mjs`**

```js
// Endpoints used only by our mods, never by the original client: list the
// heats stored on this computer and fetch one with its recording.
import { fail, ok } from "./reply.mjs";

function summary(heat, data, game) {
  const r = data.riders.find((x) => x.key === heat.playerKey);
  return {
    heatId: heat.heatId,
    nickname: r?.nickname ?? "Unknown rider",
    appearance: r?.appearance ?? {},
    score: heat.score,
    weekStart: heat.weekStart,
    finishedAt: heat.finishedAt,
    conditions: heat.conditions ?? game.weekConditions(heat.weekStart),
    scoringVersion: heat.scoringVersion,
    hasReplay: !!heat.replay,
  };
}

export function listHeats(query, store, game) {
  const week = query.has("week") ? game.weekStart(Number(query.get("week"))) : null;
  const version = query.has("version") ? Number(query.get("version")) : null;
  const heats = store.data.heats
    .filter((h) => h.finishedAt && (week === null || h.weekStart === week) && (version === null || h.scoringVersion === version))
    .sort((a, b) => b.finishedAt - a.finishedAt);
  return ok(heats.map((h) => summary(h, store.data, game)));
}

export function heatDetail(heatId, store, game) {
  const heat = store.data.heats.find((h) => h.heatId === heatId && h.finishedAt);
  if (!heat) return fail(404, "No finished heat with that ID on this computer.");
  return ok({ ...summary(heat, store.data, game), attempts: heat.attempts, tricks: heat.tricks, replay: heat.replay });
}
```

- [ ] **Step 5: Replace `server/api/index.mjs`**

```js
// Routes /api/* requests to the fake APIs, plus the /api/local/* endpoints our
// mods use. Anything else gets a 404 marked `unknown`, which the server logs.
import { feedback } from "./feedback.mjs";
import { startHeat } from "./heats.mjs";
import { lagoons } from "./lagoons.mjs";
import { board, submitHeat } from "./leaderboard.mjs";
import { heatDetail, listHeats } from "./local.mjs";
import { fail } from "./reply.mjs";
import { rider } from "./rider.mjs";

const HEAT_PATH = "/api/local/heats/";

// request: { method, path, query: URLSearchParams, body }; ctx: { store, game, now() }
export function handleApi({ method, path, query, body }, { store, game, now }) {
  const route = `${method} ${path}`;
  if (route === "POST /api/rider") return rider(body, store);
  if (route === "POST /api/heats") return startHeat(body, store, game, now());
  if (route === "GET /api/leaderboard") return board(query, store, game, now());
  if (route === "POST /api/leaderboard") return submitHeat(body, store, game, now());
  if (route === "POST /api/feedback") return feedback(body, store, now());
  if (path === "/api/lagoons" || path.startsWith("/api/lagoons/")) return lagoons(path, now());
  if (route === "GET /api/local/heats") return listHeats(query, store, game);
  if (method === "GET" && path.startsWith(HEAT_PATH)) return heatDetail(path.slice(HEAT_PATH.length), store, game);
  return { ...fail(404, "Not available in the local copy."), unknown: true };
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `node --test test/api-local.test.mjs test/api-router.test.mjs test/api-leaderboard.test.mjs`
Expected: PASS, 17 tests.

- [ ] **Step 7: Commit**

```bash
git add server/api/heats.mjs server/api/local.mjs server/api/index.mjs test/api-local.test.mjs
git commit -m "Store each heat's wind and add local heat endpoints" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Demo heat tool

**Files:**
- Create: `tools/demo-heat.mjs`

- [ ] **Step 1: Write `tools/demo-heat.mjs`**

```js
// Stores a short demo heat, recorded with the snapshot's own engine and
// controls, for the current week. Replays and ghosts can then be shown without
// playing a heat first. The demo rider borrows the first local rider's look.
//   node tools/demo-heat.mjs
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGame, openSnapshot } from "../lib/snapshot.mjs";
import { createStore } from "../server/store.mjs";
import { recordHeat } from "../sim/record.mjs";

const NICKNAME = "Demo rider";
const root = fileURLToPath(new URL("..", import.meta.url));

const engine = await loadGame(openSnapshot(root), ["engine", "wind", "controls", "week"]);
const now = Date.now();
const weekStart = engine.weekStart(now);
const conditions = engine.weekConditions(weekStart);
const { state, replay } = recordHeat(engine, conditions);
const totals = engine.heatTotals(state.heat);

const store = createStore(join(root, "data", "db.json"));
let rider = store.data.riders.find((r) => r.nickname === NICKNAME);
if (!rider) {
  rider = { key: randomUUID(), revision: 1, nickname: NICKNAME, appearance: store.data.riders[0]?.appearance ?? {} };
  store.update((d) => void d.riders.push(rider));
}
store.update((d) => void d.heats.push({
  heatId: randomUUID(),
  playerKey: rider.key,
  scoringVersion: 2,
  weekStart,
  conditions,
  startedAt: now,
  finishedAt: now,
  attempts: state.heat.attempts,
  replay,
  score: totals.total,
  tricks: totals.counting.map((a) => ({ tack: a.tack, label: a.label, score: a.score })),
}));
const moves = totals.counting.map((a) => a.label).join(", ") || "no scoring moves";
console.log(`Stored a demo heat for ${NICKNAME}: ${totals.total.toFixed(2)} points (${moves}), wind ${conditions.knots} kt`);
```

- [ ] **Step 2: Run it**

Run: `node tools/demo-heat.mjs`
Expected: `Stored a demo heat for Demo rider: <points> points (<moves>), wind <knots> kt`. In the week of 2026-10-19 that is `9.63 points (Forward loop, Air Flaka), wind 19 kt`. Other weeks have other wind, so the moves may differ.

- [ ] **Step 3: Check it replays**

Run: `node -e "const d=require('./data/db.json'); const h=d.heats.at(-1); console.log(h.score, h.replay.steps, !!h.conditions)"`
Expected: the score from Step 2, `2400`, `true`.

- [ ] **Step 4: Commit**

```bash
git add tools/demo-heat.mjs
git commit -m "Add a demo heat tool" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ghost helpers (`mods/ghosts/ghost.js`)

**Files:**
- Create: `mods/ghosts/ghost.js`
- Test: `test/ghost.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/ghost.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ghostLabel, isHeatStart, pickGhost, stepOf } from "../mods/ghosts/ghost.js";

const heat = (heatId, score, hasReplay = true) => ({ heatId, score, hasReplay, nickname: "Tester" });

test("pickGhost picks the best heat with a recording", () => {
  assert.equal(pickGhost([heat("a", 5), heat("b", 9, false), heat("c", 7)]).heatId, "c");
  assert.equal(pickGhost([heat("b", 9, false)]), null);
  assert.equal(pickGhost([]), null);
});

test("ghostLabel shows the rider and score", () => {
  assert.equal(ghostLabel(heat("a", 9.634)), "Ghost · Tester · 9.63");
});

test("stepOf turns the heat clock into a step count", () => {
  assert.equal(stepOf({ totalTime: 1.5 }), 180);
  assert.equal(stepOf({ totalTime: 0.9999999999 }), 120);
});

test("isHeatStart is true only for a solo heat at its first step", () => {
  const state = (enabled, totalTime) => ({ totalTime, heat: { enabled } });
  assert.equal(isHeatStart(state(true, 0), { competitionClock: null }), true);
  assert.equal(isHeatStart(state(false, 0), { competitionClock: null }), false);
  assert.equal(isHeatStart(state(true, 2), { competitionClock: null }), false);
  assert.equal(isHeatStart(state(true, 0), { competitionClock: () => 0 }), false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/ghost.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `mods/ghosts/ghost.js`.

- [ ] **Step 3: Write `mods/ghosts/ghost.js`**

```js
// Choosing and labelling the ghost. Pure helpers, shared with the tests.

// The best heat that has a usable recording, or null.
export const pickGhost = (heats) => heats.filter((h) => h.hasReplay).reduce((best, h) => (!best || h.score > best.score ? h : best), null);

export const ghostLabel = (heat) => `Ghost · ${heat.nickname} · ${heat.score.toFixed(2)}`;

export const stepOf = (state) => Math.round(state.totalTime * 120);

// A solo heat at its first step: practice has no heat, and 1v1 heats run on a
// competition clock.
export const isHeatStart = (state, game) => state.heat.enabled && state.totalTime === 0 && !game.competitionClock;
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/ghost.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add mods/ghosts/ghost.js test/ghost.test.mjs
git commit -m "Add ghost helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The ghosts mod

**Files:**
- Create: `mods/ghosts/index.js`
- Modify: `mods/enabled.json`

- [ ] **Step 1: Write `mods/ghosts/index.js`**

```js
// Sail against a ghost of the best heat stored this week. The ghost replays
// that heat's recording with the game's own engine, one step for every step you
// sail, and is drawn with the game's 1v1 opponent display. It never affects
// your physics or score.
import { createRunner } from "../lib/replay.js";
import { ghostLabel, isHeatStart, pickGhost, stepOf } from "./ghost.js";

const STORAGE_KEY = "freestyle-tour.ghosts";

const readEnabled = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};
const writeEnabled = (on) => {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
};
const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
};

export default {
  name: "ghosts",
  setup({ engine, overlay, whenGame, onStep, log }) {
    let enabled = readEnabled();
    let game = null;
    let session = null;
    let ghost = null;

    const box = overlay("ghosts");
    box.style.cssText = "font:12px/1.4 system-ui,sans-serif;background:rgba(10,40,40,.85);color:#e8f4f2;padding:4px 10px;border-radius:8px;pointer-events:auto";
    const checkbox = Object.assign(document.createElement("input"), { type: "checkbox", checked: enabled });
    const label = document.createElement("label");
    const status = document.createElement("span");
    label.append(checkbox, " Ghost");
    box.append(label, status);

    const stop = () => {
      if (ghost) game.clearOpponent();
      ghost = null;
    };
    checkbox.addEventListener("change", () => {
      enabled = checkbox.checked;
      writeEnabled(enabled);
      if (!enabled) {
        stop();
        status.textContent = "";
      }
    });

    async function start(state) {
      const heats = await getJson(`/api/local/heats?week=${engine.weekStart(Date.now())}`);
      const pick = pickGhost(heats);
      if (session !== state || !enabled) return;
      if (!pick) {
        status.textContent = " · No ghost yet this week";
        return;
      }
      const heat = await getJson(`/api/local/heats/${encodeURIComponent(pick.heatId)}`);
      if (session !== state || !enabled) return;
      const runner = createRunner(engine, { conditions: heat.conditions, replay: heat.replay });
      runner.seek(stepOf(state));
      const appearance = Object.keys(heat.appearance).length ? heat.appearance : undefined;
      game.showOpponent(ghostLabel(heat), () => Date.now(), appearance);
      ghost = runner;
      status.textContent = ` · ${ghostLabel(heat)}`;
      log(`racing ${ghostLabel(heat)}`);
    }

    whenGame().then((found) => {
      game = found;
      onStep((state) => {
        if (state !== session) {
          session = state;
          stop();
          status.textContent = "";
          if (enabled && isHeatStart(state, game)) start(state).catch((error) => log("could not load the ghost", error));
        }
        if (!ghost) return;
        ghost.advance(1);
        game.receiveOpponent({ ...engine.riderPose(ghost.state), updatedAt: performance.now(), streamId: "ghost" });
        if (ghost.done) stop();
      });
    });
  },
};
```

- [ ] **Step 2: Enable it**

`mods/enabled.json`:

```json
["local-badge", "ghosts"]
```

- [ ] **Step 3: Check syntax and the suite**

Run: `node --check mods/ghosts/index.js && npm test`
Expected: no syntax errors, and every test passes.

- [ ] **Step 4: Commit**

```bash
git add mods/ghosts/index.js mods/enabled.json
git commit -m "Add the ghosts mod" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Viewer helpers (`mods/replay-viewer/timeline.js`)

**Files:**
- Create: `mods/replay-viewer/timeline.js`
- Test: `test/timeline.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/timeline.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMERAS,
  MAX_CLIP_STEPS,
  SPEEDS,
  clipAround,
  clipFileName,
  createStepClock,
  extensionFor,
  formatTime,
  moveMarkers,
  normalizeClip,
  pickVideoType,
} from "../mods/replay-viewer/timeline.js";

test("formatTime shows minutes and seconds", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(120 * 75 + 119), "1:15");
});

test("the step clock turns frame times into whole steps and carries the rest", () => {
  const clock = createStepClock();
  assert.equal(clock(1, 1 / 60), 2);
  assert.equal(clock(0.25, 1 / 60), 0);
  assert.equal(clock(0.25, 1 / 60), 1);
  assert.equal(clock(4, 5), 48);
});

test("moveMarkers places each attempt at its start step", () => {
  const attempts = [{ id: 1, startedAt: 5.25, label: "Culo", tack: "port", score: 7.5, status: "landed" }];
  assert.deepEqual(moveMarkers(attempts), [{ id: 1, step: 630, label: "Culo", tack: "port", score: 7.5, status: "landed" }]);
});

test("clips are ordered, inside the heat and at most 60 seconds", () => {
  assert.deepEqual(normalizeClip(500, 100, 1000), { start: 100, end: 500 });
  assert.deepEqual(normalizeClip(-50, 200, 1000), { start: 0, end: 200 });
  assert.deepEqual(normalizeClip(100, 20000, 30000), { start: 100, end: 100 + MAX_CLIP_STEPS });
  assert.deepEqual(normalizeClip(900, 1500, 1000), { start: 900, end: 1000 });
});

test("clipAround runs from 2 s before a move to 8 s after", () => {
  assert.deepEqual(clipAround({ step: 1000 }, 21600), { start: 760, end: 1960 });
  assert.deepEqual(clipAround({ step: 100 }, 1000), { start: 0, end: 1000 });
});

test("clip file names use the rider, date and start time", () => {
  assert.equal(clipFileName("Local Tester!", Date.parse("2026-10-24T10:00:00Z"), 1260, "webm"), "freestyle-tour-local-tester-2026-10-24-11s.webm");
  assert.equal(clipFileName("??", Date.parse("2026-10-24T10:00:00Z"), 0, "mp4"), "freestyle-tour-rider-2026-10-24-0s.mp4");
});

test("the video type is the first one the browser supports", () => {
  assert.equal(pickVideoType((type) => type.startsWith("video/webm")), "video/webm;codecs=vp9");
  assert.equal(pickVideoType(() => false), null);
  assert.equal(extensionFor("video/mp4;codecs=avc1"), "mp4");
  assert.equal(extensionFor("video/webm;codecs=vp9"), "webm");
});

test("speeds and cameras", () => {
  assert.deepEqual(SPEEDS, [0.25, 0.5, 1, 2, 4]);
  assert.deepEqual(Object.keys(CAMERAS), ["Follow", "Side", "High"]);
  assert.deepEqual(CAMERAS.Follow, { distance: 1, azimuth: 0, elevation: 0 });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/timeline.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `mods/replay-viewer/timeline.js`.

- [ ] **Step 3: Write `mods/replay-viewer/timeline.js`**

```js
// Pure helpers for the replay viewer, shared with the tests.
export const STEPS_PER_SECOND = 120;
export const SPEEDS = [0.25, 0.5, 1, 2, 4];
export const MAX_CLIP_STEPS = 60 * STEPS_PER_SECOND;

// Offsets for the game's cameraView (distance 0.45-2.2, elevation -0.18-0.8).
export const CAMERAS = {
  Follow: { distance: 1, azimuth: 0, elevation: 0 },
  Side: { distance: 1.3, azimuth: Math.PI / 2, elevation: 0.05 },
  High: { distance: 1.8, azimuth: 0, elevation: 0.75 },
};

const VIDEO_TYPES = ["video/mp4;codecs=avc1.42E01F", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

export function formatTime(steps) {
  const seconds = Math.floor(steps / STEPS_PER_SECOND);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Turns frame times into whole steps at the chosen speed, carrying the
// remainder to the next frame. A long frame (say, after a tab switch) counts
// as 0.1 s so playback doesn't jump.
export function createStepClock() {
  let carry = 0;
  return (speed, seconds) => {
    carry += speed * Math.min(seconds, 0.1) * STEPS_PER_SECOND;
    const steps = Math.floor(carry);
    carry -= steps;
    return steps;
  };
}

export const moveMarkers = (attempts) =>
  attempts.map((a) => ({ id: a.id, step: Math.round(a.startedAt * STEPS_PER_SECOND), label: a.label, tack: a.tack, score: a.score, status: a.status }));

// Orders the ends, keeps them inside the heat and limits the clip to 60 s.
export function normalizeClip(a, b, totalSteps) {
  const start = Math.max(0, Math.min(a, b));
  const end = Math.min(totalSteps, Math.max(a, b), start + MAX_CLIP_STEPS);
  return { start, end };
}

// Attempts store only their start, so a move's clip runs from 2 s before it to 8 s after.
export const clipAround = (marker, totalSteps) => normalizeClip(marker.step - 2 * STEPS_PER_SECOND, marker.step + 8 * STEPS_PER_SECOND, totalSteps);

export function clipFileName(nickname, finishedAt, startStep, extension) {
  const slug = nickname.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "rider";
  const date = new Date(finishedAt).toISOString().slice(0, 10);
  return `freestyle-tour-${slug}-${date}-${Math.round(startStep / STEPS_PER_SECOND)}s.${extension}`;
}

export const pickVideoType = (isSupported) => VIDEO_TYPES.find((type) => isSupported(type)) ?? null;
export const extensionFor = (type) => (type.startsWith("video/mp4") ? "mp4" : "webm");
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/timeline.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add mods/replay-viewer/timeline.js test/timeline.test.mjs
git commit -m "Add replay viewer helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The replay viewer mod

**Files:**
- Create: `mods/replay-viewer/index.js`
- Modify: `mods/enabled.json`

- [ ] **Step 1: Write `mods/replay-viewer/index.js`**

```js
// Replay viewer: lists stored heats and plays any of them again in the game's
// own scene, with a timeline, speeds, camera views, the move list and the
// running score, and saves a stretch as a video file. It opens only from the
// menu, when the game isn't stepping physics, and swaps a replayed state into
// game.state while open.
import { createRunner } from "../lib/replay.js";
import {
  CAMERAS,
  SPEEDS,
  clipAround,
  clipFileName,
  createStepClock,
  extensionFor,
  formatTime,
  moveMarkers,
  normalizeClip,
  pickVideoType,
} from "./timeline.js";

const OPEN_CLASS = "freestyle-replay-open";
const PANEL_STYLE =
  "position:fixed;right:12px;bottom:12px;z-index:100000;width:380px;max-height:75vh;overflow:auto;" +
  "font:12px/1.5 system-ui,sans-serif;background:rgba(10,40,40,.94);color:#e8f4f2;padding:10px 12px;border-radius:10px";

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
};
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null));
  return node;
};
const windText = (c) => (c.gustKnots ? `${c.knots} kt, gusts to ${c.knots + c.gustKnots}` : `${c.knots} kt`);
const dateText = (ms) => new Date(ms).toLocaleString();
const videoType = () => pickVideoType((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));

export default {
  name: "replay-viewer",
  setup({ engine, overlay, whenGame, log }) {
    document.head.append(el("style", { textContent: `.${OPEN_CLASS} .menu-layer{display:none!important}` }));
    const holder = overlay("replay-viewer");
    holder.style.cssText = "pointer-events:auto";
    holder.hidden = true;
    holder.append(el("button", { type: "button", textContent: "Replays", onclick: () => showList().catch((e) => log("could not list heats", e)) }));
    const panel = el("div", { hidden: true });
    panel.style.cssText = PANEL_STYLE;
    document.body.append(panel);

    let game = null;
    let player = null; // the open replay, or null
    let ui = null; // the open replay's elements

    whenGame().then((found) => {
      game = found;
      setInterval(() => {
        holder.hidden = game.active || !panel.hidden;
      }, 500);
    });

    async function showList() {
      const heats = await getJson("/api/local/heats");
      const rows = heats.map((h) =>
        el(
          "li",
          {},
          `${dateText(h.finishedAt)} · ${h.nickname} · ${h.score.toFixed(2)} · ${windText(h.conditions)} `,
          h.hasReplay
            ? el("button", { type: "button", textContent: "Watch", onclick: () => watch(h.heatId).catch((e) => log("could not open the replay", e)) })
            : el("em", { textContent: "No recording" }),
        ),
      );
      panel.replaceChildren(
        el("strong", { textContent: "Replays " }),
        el("button", { type: "button", textContent: "Close", onclick: closePanel }),
        rows.length ? el("ol", {}, ...rows) : el("p", { textContent: "No heats stored yet. Sail a solo heat first." }),
      );
      panel.hidden = false;
    }

    async function watch(heatId) {
      const heat = await getJson(`/api/local/heats/${encodeURIComponent(heatId)}`);
      const check = createRunner(engine, { conditions: heat.conditions, replay: heat.replay });
      check.advance(check.totalSteps);
      const matches = Math.abs(engine.heatTotals(check.state.heat).total - heat.score) < 0.005;
      const runner = createRunner(engine, { conditions: heat.conditions, replay: heat.replay });
      const markers = moveMarkers(heat.attempts);
      player = {
        heat,
        runner,
        markers,
        saved: game.state,
        playing: false,
        speed: 1,
        clock: createStepClock(),
        last: 0,
        raf: 0,
        clip: markers.length ? clipAround(markers[0], runner.totalSteps) : normalizeClip(0, runner.totalSteps, runner.totalSteps),
        recording: null,
      };
      document.body.classList.add(OPEN_CLASS);
      game.wake?.clear?.();
      buildPlayer(matches);
      player.raf = requestAnimationFrame(frame);
    }

    function buildPlayer(matches) {
      const { heat, runner, markers } = player;
      const canRecord = !!videoType();
      ui = {
        play: el("button", { type: "button", textContent: "Play", onclick: () => setPlaying(!player.playing) }),
        timeline: el("input", { type: "range", min: 0, max: runner.totalSteps, step: 1, value: 0, style: "width:100%" }),
        time: el("span"),
        score: el("span"),
        lastMove: el("div"),
        clipText: el("span"),
        clipMessage: el("span", { textContent: canRecord ? "" : " This browser can't record video." }),
      };
      ui.timeline.addEventListener("input", () => seekTo(Number(ui.timeline.value)));
      const speed = el("select", { onchange: (e) => (player.speed = Number(e.target.value)) }, ...SPEEDS.map((s) => el("option", { value: s, textContent: `${s}×`, selected: s === 1 })));
      const cameras = Object.keys(CAMERAS).map((name) => el("button", { type: "button", textContent: name, onclick: () => Object.assign(game.cameraView, CAMERAS[name]) }));
      const moves = markers.map((m) =>
        el("li", {}, el("button", {
          type: "button",
          textContent: `${formatTime(m.step)} · ${m.tack} · ${m.label} · ${m.status === "landed" ? m.score.toFixed(2) : m.status}`,
          onclick: () => {
            player.clip = clipAround(m, runner.totalSteps);
            seekTo(Math.max(0, m.step - 240));
            updateClipText();
          },
        })),
      );
      panel.replaceChildren(
        el("strong", { textContent: `${heat.nickname} · ${dateText(heat.finishedAt)} · ${heat.score.toFixed(2)} · ${windText(heat.conditions)}` }),
        el("p", { textContent: matches ? "" : "This replay doesn't match the saved score." }),
        el("div", {}, ui.play, " ", ui.time, " · ", ui.score, " ", speed),
        ui.timeline,
        ui.lastMove,
        el("div", {}, "Camera: ", ...cameras),
        moves.length ? el("ol", {}, ...moves) : el("p", { textContent: "No moves in this heat." }),
        el("div", {},
          el("button", { type: "button", textContent: "Clip start", onclick: () => ((player.clip.start = player.runner.stepCount), updateClipText()) }),
          el("button", { type: "button", textContent: "Clip end", onclick: () => ((player.clip.end = player.runner.stepCount), updateClipText()) }),
          el("button", { type: "button", textContent: "Save clip", disabled: !canRecord, onclick: saveClip }),
          " ", ui.clipText, ui.clipMessage),
        el("div", {},
          el("button", { type: "button", textContent: "Back", onclick: () => (closeReplay(), showList().catch((e) => log("could not list heats", e))) }),
          el("button", { type: "button", textContent: "Close", onclick: closePanel })),
      );
      updateClipText();
      updateStatus();
    }

    function frame(now) {
      if (!player) return;
      player.raf = requestAnimationFrame(frame);
      const seconds = player.last ? (now - player.last) / 1000 : 0;
      player.last = now;
      const { runner } = player;
      if (player.playing) {
        runner.advance(player.clock(player.speed, seconds));
        if (player.recording && runner.stepCount >= player.recording.end) stopRecording();
        if (runner.done) setPlaying(false);
      }
      game.state = runner.state;
      updateStatus();
    }

    function updateStatus() {
      const { runner } = player;
      const state = runner.state;
      ui.timeline.value = runner.stepCount;
      ui.time.textContent = `${formatTime(runner.stepCount)} / ${formatTime(runner.totalSteps)}`;
      ui.score.textContent = `Heat ${engine.heatTotals(state.heat).total.toFixed(2)}`;
      const last = state.heat.attempts.filter((a) => a.status !== "pending").at(-1);
      ui.lastMove.textContent = last ? `Last move: ${last.label} · ${last.status === "landed" ? last.score.toFixed(2) : last.status}` : "";
    }

    function updateClipText() {
      const { start, end } = normalizeClip(player.clip.start, player.clip.end, player.runner.totalSteps);
      ui.clipText.textContent = `${formatTime(start)}–${formatTime(end)}`;
    }

    function setPlaying(on) {
      if (on && player.runner.done) seekTo(0);
      player.playing = on;
      player.last = 0;
      ui.play.textContent = on ? "Pause" : "Play";
    }

    function seekTo(step) {
      player.runner.seek(step);
      game.wake?.clear?.();
      game.state = player.runner.state;
      updateStatus();
    }

    function saveClip() {
      const type = videoType();
      const { start, end } = normalizeClip(player.clip.start, player.clip.end, player.runner.totalSteps);
      if (!type || end <= start || player.recording) return;
      const name = clipFileName(player.heat.nickname, player.heat.finishedAt, start, extensionFor(type));
      seekTo(start);
      const stream = game.renderer.domElement.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        download(new Blob(chunks, { type }), name);
      };
      player.recording = { recorder, end };
      recorder.start();
      ui.clipMessage.textContent = " Recording…";
      setPlaying(true);
    }

    function stopRecording() {
      const { recorder } = player.recording;
      player.recording = null;
      setPlaying(false);
      recorder.stop();
      ui.clipMessage.textContent = " Clip saved.";
    }

    function download(blob, name) {
      const url = URL.createObjectURL(blob);
      const link = el("a", { href: url, download: name });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }

    function closeReplay() {
      if (!player) return;
      if (player.recording) stopRecording();
      cancelAnimationFrame(player.raf);
      game.state = player.saved;
      game.cameraView.reset();
      game.wake?.clear?.();
      document.body.classList.remove(OPEN_CLASS);
      player = null;
      ui = null;
    }

    function closePanel() {
      closeReplay();
      panel.hidden = true;
    }
  },
};
```

- [ ] **Step 2: Enable it**

`mods/enabled.json`:

```json
["local-badge", "ghosts", "replay-viewer"]
```

- [ ] **Step 3: Check syntax and the suite**

Run: `node --check mods/replay-viewer/index.js && npm test`
Expected: no syntax errors, and every test passes.

- [ ] **Step 4: Commit**

```bash
git add mods/replay-viewer/index.js mods/enabled.json
git commit -m "Add the replay viewer mod" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: README and the browser check

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the mods in `README.md`**

Insert this section right before `## Writing a mod`:

```markdown
## Mods

- `local-badge`: proof that the mod layer works (a badge and a key-guide label).
- `ghosts`: in a solo heat, sail against a ghost of the best heat stored this
  week. The "Ghost" switch in the overlay turns it off.
- `replay-viewer`: the "Replays" button in the menu plays stored heats again,
  with a timeline, speeds, cameras, the move list and video clips.

`node tools/demo-heat.mjs` stores a short demo heat with real moves for the
current week, so replays and ghosts can be shown without playing first.

Our mods also use two local endpoints that the original client never calls:
`GET /api/local/heats?week=&version=` and `GET /api/local/heats/<heatId>`.
```

- [ ] **Step 2: Store a demo heat and start the server**

Run `node tools/demo-heat.mjs`, then use `preview_start` with name `local-copy`.

The app's preview tool may report that it found no `launch.json` in another folder. If so, create a temporary `.claude/launch.json` there with `runtimeArgs` set to the absolute path of this repo's `server/index.mjs`, start it, and delete that file when the check is done.

Expected: the overlay shows the badge, the "Ghost" switch and, in the menu, a "Replays" button.

- [ ] **Step 3: Check the viewer**

1. Click "Replays". Expected: the list shows the Demo rider heat with its score and wind, newest first.
2. Click "Watch". Expected:
   - the menu disappears and the demo heat plays in the scene after pressing Play;
   - no "doesn't match" notice appears;
   - at the end, the "Heat" score equals the listed score.
3. Drag the timeline back and forth, switch speeds (0.25× and 4×), click each camera, and click each move in the list. Expected: playback jumps to just before the move, and the "Last move" line updates as it lands.
4. Click a move, then "Save clip". Expected: "Recording…", then " Clip saved." and a `.mp4` or `.webm` download named `freestyle-tour-demo-rider-<date>-<n>s.<ext>`. Open the file to confirm it plays.
5. Click "Close". Expected: the menu comes back and the camera is reset.

- [ ] **Step 4: Check the ghost**

1. Start a Solo heat. Expected:
   - the overlay shows "· Ghost · Demo rider · <score>";
   - a second rider labelled with the same text sails from the start, its moves matching the replay;
   - it disappears after 20 seconds, when its recording ends.
2. Return to the menu, untick "Ghost", and start another solo heat. Expected: no ghost.
3. Tick "Ghost" again for later use.

- [ ] **Step 5: Check isolation and the original**

- `read_network_requests`: every request is to localhost.
- `read_console_messages` with `onlyErrors: true`: no new errors from the mods.
- Restart with `--mods=`. Expected: no badge, no Ghost switch and no Replays button. Then restore the normal start.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: every test passes.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "Document the replay and ghost mods" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
