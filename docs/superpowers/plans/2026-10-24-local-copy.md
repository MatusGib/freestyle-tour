# Local Copy and Mod Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the original fristajlo.ws game entirely from this machine, unchanged, with a mod layer that can change it.

**Architecture:** A snapshot tool downloads the live site into a git-ignored `vendor/<date>/` folder. A dependency-free Node server serves that snapshot on 127.0.0.1, answers the game's six server APIs from a local JSON file, applies mods' serve-time patches, and injects a mod loader into the page. The loader imports the game's own modules by URL (sharing the instances the game uses), finds functions by code signature, and runs each mod. A headless harness loads the same modules in Node for tests.

**Tech Stack:** Node 22+ (built-ins only: `node:http`, `node:test`, `node:crypto`, `node:fs`, `fetch`), plain browser ES modules, Git Bash on Windows.

**Spec:** `docs/superpowers/specs/2026-10-24-local-copy-design.md`

---

## Facts this plan relies on (verified 2026-10-24)

- Served from local files, the downloaded page boots: menu, 3D water and a practice session all run, with no requests for server-rendered data.
- The page injects a Cloudflare bot-check script (`/cdn-cgi/challenge-platform/scripts/jsd/main.js`) that only exists on fristajlo.ws. The browser also asks for `/favicon.ico`, which may not exist.
- The client polls `POST /api/lagoons` and `POST /api/lagoons/lobby-connect` in the background even during practice. `{ "relay": null }` from lobby-connect makes the client switch its lobby socket off.
- The engine, wind, controls and week modules import cleanly in Node, and two runs with the same seed and inputs end in identical states.
- Every signature in Task 2 matched exactly one export in the 2026-10-23 build.
- Part markers, each in exactly one module: `attemptsPerTack:` (engine), `Math.sin(r*.17)` (wind), `syncAir(` (controls), `areaArrow` (scene), `Europe/Warsaw` (week).
- "Same keys in the air" appears once in the game modules and not in the server-rendered HTML. Menu text such as "Unlimited attempts · No time limit" *is* in the HTML, so patching it would cause a hydration mismatch.
- The running game object is found through React exactly as the Freestajlo bot does. It has `controls.read(state)`, which the game calls every physics step and which returns that step's input.
- Client data shapes (from the client code):
  - **Profile:** `{ key: <v4 UUID>, revision: <integer ≥ 1>, protected: <boolean>, nickname, appearance }`
  - **Lookup:** `{ rider: { nickname, appearance, protected } | null }`
  - **Heat start:** `{ heatId: <v4 UUID>, weekStart: <ms> }`
  - **Heat submit response:** `{ best, weekly?: { rank, best }, review? }`
  - **Board:** `{ scoringVersionStarts: {}, rows, elo, weekly: { weekStart, weekEnd, currentWeekStart, firstWeekStart, conditions, rows } }`, with rows shaped `{ rank, nickname, appearance, score, achievedAt, scoringVersion, conditions, tricks: [{ tack, label, score }] }`
  - **Errors:** `{ error: "<message>" }` with an HTTP status; the client shows the message.

## File structure

| File | Responsibility |
|---|---|
| `package.json` | Scripts (`snapshot`, `start`, `test`), Node version, ES modules |
| `mods/lib/identify.js` | Code signatures for game functions and `identify()`; shared by browser and Node |
| `lib/snapshot.mjs` | Part markers, `findParts`, `fileFor`, `openSnapshot`, `tryOpenSnapshot`, `loadGame` |
| `tools/refs.mjs` | Finds hard and soft references in HTML, modules and stylesheets |
| `tools/snapshot.mjs` | `crawl`, `writeSnapshot`, and the `npm run snapshot` command |
| `sim/load.mjs` | `loadEngine()` for the harness |
| `sim/run.mjs` | `runHeat()`: headless fixed-step heat with a state hash |
| `server/store.mjs` | `createStore(file)`: atomic JSON store |
| `server/api/reply.mjs` | `ok` / `fail` response helpers |
| `server/api/rider.mjs` | Rider profiles |
| `server/api/heats.mjs` | Heat registration |
| `server/api/leaderboard.mjs` | Heat submission and boards |
| `server/api/lagoons.mjs` | Quiet, empty 1v1 lobby |
| `server/api/feedback.mjs` | Local feedback storage |
| `server/api/index.mjs` | `handleApi()` router |
| `server/html.mjs` | `prepareHtml()`: drop the bot check, add the loader |
| `server/patches.mjs` | `loadPatches`, `applyPatches`, `patchSnapshot` |
| `server/app.mjs` | `createApp()`: the HTTP server |
| `server/index.mjs` | `npm start` command |
| `mods/lib/game.js` | `findGame`, `whenGame`, `onStep` (browser) |
| `mods/loader.js` | Browser mod loader |
| `mods/enabled.json` | Default mod list |
| `mods/local-badge/index.js`, `mods/local-badge/patches.mjs` | Proof mod |
| `test/helpers.mjs` | `ROOT`, `tempDir`, `makeSnapshot`, `fakeGame`, `WEEK` |
| `test/*.test.mjs` | One test file per unit, plus snapshot tests that skip without a snapshot |
| `.claude/launch.json` | Starts the server in the app's browser pane |
| `README.md` | How to use and how to write a mod |

All commands run from the repo root (`C:\Users\mateusz\Projects\freestyle-tour`) in Git Bash.

---

### Task 1: Project setup

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "freestyle-tour",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "snapshot": "node tools/snapshot.mjs",
    "start": "node server/index.mjs",
    "test": "node --test test/*.test.mjs"
  }
}
```

- [ ] **Step 2: Check Node**

Run: `node --version`
Expected: `v22.x` or later (this machine has v24.16.0).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Add package.json" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Code signatures (`mods/lib/identify.js`)

**Files:**
- Create: `mods/lib/identify.js`
- Test: `test/identify.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/identify.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNATURES, identify } from "../mods/lib/identify.js";

const signatures = {
  demo: {
    answer: (v) => v === 42,
    pick: (v) => typeof v === "function" && v.name === "pick",
  },
};
function pick() {}

test("identify returns the one export matching each signature", () => {
  assert.deepEqual(identify({ demo: { a: 1, b: 42, c: pick } }, signatures), { answer: 42, pick });
});

test("identify fails when a signature matches nothing", () => {
  assert.throws(() => identify({ demo: { a: 1, c: pick } }, signatures), /Could not locate demo\.answer \(0 matches\)/);
});

test("identify fails when a signature matches more than once", () => {
  assert.throws(() => identify({ demo: { a: 42, b: 42, c: pick } }, signatures), /Could not locate demo\.answer \(2 matches\)/);
});

test("a signature that throws counts as no match", () => {
  const throwing = { demo: { boom: () => { throw new Error("bad export"); } } };
  assert.throws(() => identify({ demo: { a: 1 } }, throwing), /demo\.boom \(0 matches\)/);
});

test("parts without signatures are ignored", () => {
  assert.deepEqual(identify({ scene: { anything: 1 } }, signatures), {});
});

test("signatures cover the four parts the loader identifies", () => {
  assert.deepEqual(Object.keys(SIGNATURES), ["engine", "wind", "controls", "week"]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/identify.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `mods/lib/identify.js`.

- [ ] **Step 3: Write `mods/lib/identify.js`**

```js
// Finds the game's functions and objects by their code, whatever names the
// minifier gave them in this build. Used by the browser mod loader and by the
// Node server and harness. Every signature must match exactly one export of
// its part, so a game update that changes the code fails loudly.
const src = (v) => (typeof v === "function" ? v.toString() : "");
const isClass = (v, methods) => typeof v === "function" && methods.every((m) => typeof v.prototype?.[m] === "function");

export const SIGNATURES = {
  engine: {
    step: (v) => /^function [\w$]+\(e,t,n\)\{e\.beastMode&&/.test(src(v)),
    initState: (v) => /^function [\w$]+\(e=[\w$]+\)\{return\{heat:/.test(src(v)),
    startTrick: (v) => /^function [\w$]+\(e,t\)\{if\(!Object\.hasOwn\([\w$]+,t\)/.test(src(v)),
    slots: (v) => /^function [\w$]+\(e\)\{if\(e\.landing\)return/.test(src(v)),
    pump: (v) => /^function [\w$]+\(e\)\{if\(e\.heat\.done\|\|e\.ducked\|\|e\.ducking/.test(src(v)),
    switchStance: (v) => src(v).includes("Settle on the board before switching stance"),
    duck: (v) => src(v).includes("Finish your move before ducking"),
    heatTotals: (v) => /^function [\w$]+\(e\)\{let [^{]*new Map;for\(let r of e\.attempts\)/.test(src(v)),
    heatInit: (v) => /^function [\w$]+\(e=!1\)\{return\{enabled:e,warmup:/.test(src(v)),
    isAir: (v) => /^function [\w$]+\(e\)\{return e\.air\|\|[\w$]+\(e\)\}$/.test(src(v)),
    inArea: (v) => /\{let r=[\w$]+\(n,e,t\);return Math\.abs\(r\.downwind\)<=n\.depth\/2/.test(src(v)),
    tricks: (v) => !!v?.flaka?.scoring && !!v?.culo?.scoring,
    heatRules: (v) => typeof v?.attemptsPerTack === "number" && typeof v?.seconds === "number",
  },
  wind: {
    conditions: (v) => /\{if\(!([\w$]+)\)return\{\.\.\.[\w$]+\};let [\w$]+=[\w$]+\(\1\);return\{seed:\1,knots:/.test(src(v)),
    wind: (v) => /return e\.knots\+Math\.sin\(r\*\.17\)/.test(src(v)),
  },
  controls: {
    Controls: (v) => isClass(v, ["setKey", "setStick", "read", "release"]),
    heatStart: (v) => /^function [\w$]+\(t,n\)\{let r=[\w$]+\(t\);return r\.heat\.enabled=!0,n\.release\(r\)/.test(src(v)),
  },
  week: {
    weekStart: (v) => /^function [\w$]+\(e\)\{let t=e\+[\w$]+\(e\),n=\(new Date\(t\)\.getUTCDay\(\)\+6\)%7/.test(src(v)),
    nextWeekStart: (v) => /^e=>[\w$]+\(e\+7\.5\*[\w$]+\)$/.test(src(v)),
    weekConditions: (v) => /^function [\w$]+\([\w$]+\)\{return\{\.\.\.[\w$]+\([\w$]+\(`week:\$\{[\w$]+\}`\)\),/.test(src(v)),
  },
};

// modules: { part: module namespace }. Returns { label: export } for every
// signature of every part given; parts without signatures are skipped.
export function identify(modules, signatures = SIGNATURES) {
  const found = {};
  for (const [part, namespace] of Object.entries(modules)) {
    for (const [label, test] of Object.entries(signatures[part] ?? {})) {
      const hits = Object.values(namespace).filter((v) => {
        try {
          return test(v);
        } catch {
          return false;
        }
      });
      if (hits.length !== 1) throw new Error(`Could not locate ${part}.${label} (${hits.length} matches); the game was probably updated`);
      found[label] = hits[0];
    }
  }
  return found;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/identify.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add mods/lib/identify.js test/identify.test.mjs
git commit -m "Add code signatures for the game's functions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Snapshot helpers (`lib/snapshot.mjs`) and test helpers

**Files:**
- Create: `lib/snapshot.mjs`, `test/helpers.mjs`
- Test: `test/snapshot-lib.test.mjs`

- [ ] **Step 1: Write the test helpers**

`test/helpers.mjs` (shared by later tasks; `fakeGame` is first used in Task 11):

```js
// Shared test helpers: temporary folders, a tiny fixture snapshot and a
// stand-in for the game's functions, so most tests run without a real snapshot.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileFor, openSnapshot } from "../lib/snapshot.mjs";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "freestyle-tour-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Writes files ({ urlPath: text }) as snapshot root/vendor/<name>, makes it
// current and returns it opened.
export function makeSnapshot(root, name, files, parts) {
  const dir = join(root, "vendor", name);
  const entries = Object.entries(files).map(([path, text]) => {
    const out = join(dir, fileFor(path));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
    return { path, bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") };
  });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ source: "https://game.test", fetchedAt: "2026-10-24T00:00:00.000Z", parts, files: entries, skipped: [] }));
  writeFileSync(join(root, "vendor", "current.json"), JSON.stringify({ snapshot: name }));
  return openSnapshot(root, name);
}

export const WEEK = 7 * 24 * 3600 * 1000;

// Close enough to the game's functions for the fake APIs: weeks are plain
// 7-day blocks, every landed attempt counts, and the wind is fixed.
export const fakeGame = {
  weekStart: (ms) => Math.floor(ms / WEEK) * WEEK,
  nextWeekStart: (ms) => Math.floor(ms / WEEK) * WEEK + WEEK,
  weekConditions: () => ({ seed: 1, knots: 18, gustKnots: 4 }),
  heatTotals: ({ attempts }) => {
    const counting = attempts.filter((a) => a.status === "landed" && a.score > 0);
    return { total: Math.round(counting.reduce((sum, a) => sum + a.score, 0) * 100) / 100, counting };
  },
};
```

- [ ] **Step 2: Write the failing test**

`test/snapshot-lib.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { PART_MARKERS, fileFor, findParts, openSnapshot, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { makeSnapshot, tempDir } from "./helpers.mjs";

const pathFor = (part) => `/_next/static/chunks/${part}.js`;
const moduleSet = () => new Map(Object.entries(PART_MARKERS).map(([part, marker]) => [pathFor(part), `x${marker}y`]));

test("findParts maps each part to the one module holding its marker", () => {
  const modules = moduleSet();
  modules.set("/_next/static/chunks/other.js", "nothing here");
  assert.deepEqual(findParts(modules), Object.fromEntries(Object.keys(PART_MARKERS).map((part) => [part, pathFor(part)])));
});

test("findParts fails when a marker is missing", () => {
  const modules = moduleSet();
  modules.delete(pathFor("week"));
  assert.throws(() => findParts(modules), /"Europe\/Warsaw" \(week\), found 0/);
});

test("findParts fails when a marker is in two modules", () => {
  const modules = moduleSet();
  modules.set("/_next/static/chunks/copy.js", PART_MARKERS.engine);
  assert.throws(() => findParts(modules), /\(engine\), found 2/);
});

test("fileFor stores the page as index.html and other paths as they are", () => {
  assert.equal(fileFor("/"), "index.html");
  assert.equal(fileFor("/_next/static/chunks/a.js"), "_next/static/chunks/a.js");
});

test("openSnapshot opens the current snapshot, or a named one", (t) => {
  const root = tempDir(t);
  makeSnapshot(root, "s1", { "/": "<html><head></head></html>" }, {});
  assert.equal(openSnapshot(root).name, "s1");
  assert.equal(openSnapshot(root, "s1").dir, join(root, "vendor", "s1"));
  assert.equal(openSnapshot(root).manifest.files[0].path, "/");
});

test("without a snapshot, openSnapshot explains what to run and tryOpenSnapshot returns null", (t) => {
  const root = tempDir(t);
  assert.throws(() => openSnapshot(root), /run `npm run snapshot` first/);
  assert.equal(tryOpenSnapshot(root), null);
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --test test/snapshot-lib.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/snapshot.mjs`.

- [ ] **Step 4: Write `lib/snapshot.mjs`**

```js
// Shared helpers for the dated snapshots of the original game under vendor/.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { identify } from "../mods/lib/identify.js";

// Text that picks out the game modules we rely on. Each marker must appear in
// exactly one module of a snapshot.
export const PART_MARKERS = {
  engine: "attemptsPerTack:", // physics, tricks and judging
  wind: "Math.sin(r*.17)", // conditions and the wind model
  controls: "syncAir(", // keyboard/touch handler and heat replay recorder
  scene: "areaArrow", // the three.js scene
  week: "Europe/Warsaw", // weekly challenge calendar and its wind
};

// modules: Map of URL path -> module text. Returns { part: URL path }.
export function findParts(modules) {
  const parts = {};
  for (const [part, marker] of Object.entries(PART_MARKERS)) {
    const hits = [...modules].filter(([, text]) => text.includes(marker)).map(([path]) => path);
    if (hits.length !== 1) throw new Error(`Expected one module containing ${JSON.stringify(marker)} (${part}), found ${hits.length}`);
    parts[part] = hits[0];
  }
  return parts;
}

// Where a URL path is stored inside a snapshot folder.
export const fileFor = (urlPath) => (urlPath === "/" ? "index.html" : urlPath.slice(1));

// Opens vendor/<name>, or the snapshot vendor/current.json points at.
export function openSnapshot(root, name) {
  const vendor = join(root, "vendor");
  if (!name) {
    const pointer = join(vendor, "current.json");
    if (!existsSync(pointer)) throw new Error("No snapshot yet: run `npm run snapshot` first");
    name = JSON.parse(readFileSync(pointer, "utf8")).snapshot;
  }
  const dir = join(vendor, name);
  const manifest = join(dir, "manifest.json");
  if (!existsSync(manifest)) throw new Error(`vendor/${name} has no manifest.json`);
  return { name, dir, manifest: JSON.parse(readFileSync(manifest, "utf8")) };
}

export function tryOpenSnapshot(root) {
  try {
    return openSnapshot(root);
  } catch {
    return null;
  }
}

// Imports the given parts of a snapshot in Node and identifies their functions.
export async function loadGame(snapshot, partNames) {
  const modules = {};
  for (const part of partNames) {
    const file = join(snapshot.dir, fileFor(snapshot.manifest.parts[part]));
    modules[part] = await import(pathToFileURL(file).href);
  }
  return identify(modules);
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `node --test test/snapshot-lib.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/snapshot.mjs test/helpers.mjs test/snapshot-lib.test.mjs
git commit -m "Add snapshot helpers and test helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reference extraction (`tools/refs.mjs`)

**Files:**
- Create: `tools/refs.mjs`
- Test: `test/refs.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/refs.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRefs, resolvePath } from "../tools/refs.mjs";

const sorted = (refs) => [...refs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

test("resolvePath resolves relative paths and rejects other hosts", () => {
  assert.equal(resolvePath("/_next/static/chunks/a.js", "./b.js"), "/_next/static/chunks/b.js");
  assert.equal(resolvePath("/x/y.css", "../f.ttf"), "/f.ttf");
  assert.equal(resolvePath("/a.js", "https://example.com/x.js"), null);
});

test("HTML: src and href attributes are hard references; the page itself and other hosts are skipped", () => {
  const html = `<link rel="stylesheet" href="/_next/static/css/a.css" data-rsc-css-href="/x.css"/><script src="/_next/static/chunks/b.js"></script><a href="/">home</a><a href="https://example.com/">x</a><img src="/wordmark.svg">`;
  assert.deepEqual(sorted(extractRefs("/", html)), [
    { path: "/_next/static/chunks/b.js", hard: true },
    { path: "/_next/static/css/a.css", hard: true },
    { path: "/wordmark.svg", hard: true },
  ]);
});

test("modules: imports and _next paths are hard; guessed chunk names and root files are soft", () => {
  const js = `import{a as b}from"./dep-AAAAAAAA.js";const m=["_next/static/chunks/lazy-BBBBBBBB.js"];import("./scene-CCCCCCCC.js");x="named-DDDDDDDD.js";y="/fonts/f.ttf";z="//other.example/p.png";`;
  assert.deepEqual(sorted(extractRefs("/_next/static/chunks/page-XXXXXXXX.js", js)), [
    { path: "/_next/static/chunks/dep-AAAAAAAA.js", hard: true },
    { path: "/_next/static/chunks/lazy-BBBBBBBB.js", hard: true },
    { path: "/_next/static/chunks/named-DDDDDDDD.js", hard: false },
    { path: "/_next/static/chunks/scene-CCCCCCCC.js", hard: true },
    { path: "/fonts/f.ttf", hard: false },
  ]);
});

test("stylesheets: url() references are hard; data URLs are skipped", () => {
  const css = `@font-face{src:url(/fonts/oswald.ttf)}.a{background:url("img/bg.png")}.b{background:url(data:image/png;base64,AAA)}`;
  assert.deepEqual(sorted(extractRefs("/_next/static/css/a.css", css)), [
    { path: "/_next/static/css/img/bg.png", hard: true },
    { path: "/fonts/oswald.ttf", hard: true },
  ]);
});

test("other files have no references", () => {
  assert.deepEqual(extractRefs("/fonts/f.ttf", `url(/x.png) "/y.svg"`), []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/refs.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `tools/refs.mjs`.

- [ ] **Step 3: Write `tools/refs.mjs`**

```js
// Finds the files a page, module or stylesheet refers to, so the snapshot tool
// can follow them. Hard references must exist on the site. Soft ones are
// guesses from names in module text and may legitimately be missing.
const ORIGIN = "http://snapshot.local";

// Resolves ref against the file at fromPath; null if it points to another host.
export function resolvePath(fromPath, ref) {
  const url = new URL(ref, ORIGIN + fromPath);
  return url.origin === ORIGIN ? url.pathname : null;
}

function kindOf(path) {
  if (path === "/" || path.endsWith(".html")) return "html";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "js";
  if (path.endsWith(".css")) return "css";
  return "other";
}

// Returns [{ path, hard }] for the references in text, the content of fromPath.
export function extractRefs(fromPath, text) {
  const found = new Map();
  const add = (ref, hard) => {
    if (!ref || ref.startsWith("//") || /^[a-z]+:/i.test(ref)) return;
    const path = resolvePath(fromPath, ref);
    if (!path || path === "/") return;
    found.set(path, found.get(path) || hard);
  };
  const kind = kindOf(fromPath);
  if (kind === "html") {
    for (const m of text.matchAll(/\s(?:src|href)="([^"]+)"/g)) add(m[1], true);
  }
  if (kind === "js") {
    for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'`](\.{1,2}\/[^"'`]+)["'`]/g)) add(m[1], true);
    for (const m of text.matchAll(/["'`](_next\/static\/[^"'`]+)["'`]/g)) add(`/${m[1]}`, true);
    for (const m of text.matchAll(/[\w-]+-[\w-]{8}\.js\b/g)) add(`./${m[0]}`, false);
    for (const m of text.matchAll(/["'`](\/[\w./-]+\.(?:svg|png|jpe?g|webp|ico|ttf|woff2?|json|webmanifest))["'`]/g)) add(m[1], false);
  }
  if (kind === "css") {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(m[1], true);
  }
  return [...found].map(([path, hard]) => ({ path, hard }));
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/refs.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/refs.mjs test/refs.test.mjs
git commit -m "Add reference extraction for the snapshot tool" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Snapshot tool (`tools/snapshot.mjs`)

**Files:**
- Create: `tools/snapshot.mjs`
- Test: `test/crawl.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/crawl.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { crawl, writeSnapshot } from "../tools/snapshot.mjs";
import { tempDir } from "./helpers.mjs";

const SITE = "https://game.test";
const MARKERS = "attemptsPerTack:1;Math.sin(r*.17);syncAir(;areaArrow;Europe/Warsaw";
const PAGES = {
  "/": `<html><head><link rel="stylesheet" href="/_next/static/css/a.css"/><script src="/_next/static/chunks/page-AAAAAAAA.js"></script></head></html>`,
  "/_next/static/css/a.css": `@font-face{src:url(/fonts/f.ttf)}`,
  "/fonts/f.ttf": "font",
  "/_next/static/chunks/page-AAAAAAAA.js": `import{x}from"./dep-BBBBBBBB.js";const d=["_next/static/chunks/lazy-CCCCCCCC.js"];const g="guess-DDDDDDDD.js";`,
  "/_next/static/chunks/dep-BBBBBBBB.js": `export const x=1;${MARKERS}`,
  "/_next/static/chunks/lazy-CCCCCCCC.js": "export{}",
};
const siteWith = (pages) => async (url) => {
  const path = new URL(url).pathname;
  return path in pages ? { status: 200, body: Buffer.from(pages[path]) } : { status: 404, body: Buffer.alloc(0) };
};

test("crawl follows every reference and separates missing guesses from missing files", async () => {
  const { files, missing, skipped } = await crawl(SITE, siteWith(PAGES));
  assert.deepEqual([...files.keys()].sort(), Object.keys(PAGES).sort());
  assert.deepEqual(missing, []);
  assert.deepEqual(skipped.sort(), ["/_next/static/chunks/guess-DDDDDDDD.js (404)", "/favicon.ico (404)"]);
});

test("crawl reports a hard reference that could not be downloaded", async () => {
  const pages = { ...PAGES };
  delete pages["/_next/static/chunks/lazy-CCCCCCCC.js"];
  const { missing } = await crawl(SITE, siteWith(pages));
  assert.deepEqual(missing, ["/_next/static/chunks/lazy-CCCCCCCC.js (404)"]);
});

test("writeSnapshot writes the files and a manifest with hashes and parts", async (t) => {
  const dir = join(tempDir(t), "snap");
  const result = await crawl(SITE, siteWith(PAGES));
  const manifest = await writeSnapshot(dir, SITE, result);
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), PAGES["/"]);
  assert.equal(manifest.files.length, 6);
  const page = manifest.files.find((f) => f.path === "/");
  assert.equal(page.sha256, createHash("sha256").update(PAGES["/"]).digest("hex"));
  assert.equal(manifest.parts.engine, "/_next/static/chunks/dep-BBBBBBBB.js");
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).skipped, result.skipped);
});

test("writeSnapshot writes nothing when a part is missing", async (t) => {
  const dir = join(tempDir(t), "snap");
  const pages = { ...PAGES, "/_next/static/chunks/dep-BBBBBBBB.js": "export const x=1;" };
  const result = await crawl(SITE, siteWith(pages));
  await assert.rejects(writeSnapshot(dir, SITE, result), /Expected one module containing/);
  assert.equal(existsSync(dir), false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/crawl.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `tools/snapshot.mjs`.

- [ ] **Step 3: Write `tools/snapshot.mjs`**

```js
// Downloads a dated snapshot of the live game into vendor/<name>/. Snapshots
// are never committed.
//   npm run snapshot -- [--site https://fristajlo.ws] [--name 2026-10-24]
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { fileFor, findParts } from "../lib/snapshot.mjs";
import { extractRefs } from "./refs.mjs";

const followsRefs = (path) => path === "/" || /\.(m?js|css)$/.test(path);

// fetchFile(url) resolves to { status, body: Buffer }. Returns the downloaded
// files, the hard references that failed (missing) and the soft ones (skipped).
export async function crawl(site, fetchFile) {
  const files = new Map();
  const failed = new Map();
  const hard = new Set(["/"]);
  const queue = ["/", "/favicon.ico"];
  const seen = new Set(queue);
  while (queue.length) {
    const path = queue.shift();
    const res = await fetchFile(new URL(path, site).href);
    if (res.status !== 200) {
      failed.set(path, res.status);
      continue;
    }
    files.set(path, res.body);
    if (!followsRefs(path)) continue;
    for (const ref of extractRefs(path, res.body.toString("utf8"))) {
      if (ref.hard) hard.add(ref.path);
      if (!seen.has(ref.path)) {
        seen.add(ref.path);
        queue.push(ref.path);
      }
    }
  }
  const list = (wantHard) => [...failed].filter(([path]) => hard.has(path) === wantHard).map(([path, status]) => `${path} (${status})`);
  return { files, missing: list(true), skipped: list(false) };
}

// Writes the crawled files and manifest.json into dir. Finds the parts first,
// so nothing is written when the game's layout has changed.
export async function writeSnapshot(dir, site, { files, skipped }) {
  const modules = new Map([...files].filter(([path]) => /\.m?js$/.test(path)).map(([path, body]) => [path, body.toString("utf8")]));
  const parts = findParts(modules);
  const entries = [];
  for (const [path, body] of files) {
    const out = join(dir, fileFor(path));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, body);
    entries.push({ path, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { source: site, fetchedAt: new Date().toISOString(), parts, files: entries, skipped };
  await writeFile(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function fetchFile(url) {
  const res = await fetch(url);
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
}

async function main() {
  const { values } = parseArgs({
    options: {
      site: { type: "string", default: "https://fristajlo.ws" },
      name: { type: "string", default: new Date().toISOString().slice(0, 10) },
    },
  });
  const root = fileURLToPath(new URL("..", import.meta.url));
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/crawl.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/snapshot.mjs test/crawl.test.mjs
git commit -m "Add the snapshot tool" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Take the real snapshot and check its integrity

**Files:**
- Create: `vendor/<today>/…` (git-ignored, produced by the tool)
- Test: `test/snapshot-integrity.test.mjs`

- [ ] **Step 1: Write the integrity test**

`test/snapshot-integrity.test.mjs`:

```js
// Checks the current snapshot on disk against its manifest. Skipped when no
// snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PART_MARKERS, fileFor, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("every manifest entry exists with a matching SHA-256", { skip }, () => {
  for (const entry of snapshot.manifest.files) {
    const file = join(snapshot.dir, fileFor(entry.path));
    assert.ok(existsSync(file), `${entry.path} is missing`);
    const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
    assert.equal(sha, entry.sha256, `${entry.path} changed since the snapshot was taken`);
  }
});

test("the manifest names a listed module for every part", { skip }, () => {
  assert.deepEqual(Object.keys(snapshot.manifest.parts).sort(), Object.keys(PART_MARKERS).sort());
  const listed = new Set(snapshot.manifest.files.map((f) => f.path));
  for (const path of Object.values(snapshot.manifest.parts)) assert.ok(listed.has(path), `${path} is not in the manifest`);
});

test("the page has the head tags the server relies on", { skip }, () => {
  const html = readFileSync(join(snapshot.dir, "index.html"), "utf8");
  assert.ok(html.includes("<head>"), "no <head>");
  assert.ok(html.includes("</head>"), "no </head>");
});
```

- [ ] **Step 2: Run it before the snapshot exists**

Run: `node --test test/snapshot-integrity.test.mjs`
Expected: 3 tests reported as skipped ("no snapshot yet: run npm run snapshot").

- [ ] **Step 3: Take the snapshot**

Run: `npm run snapshot`
Expected output: roughly 50–60 files. File names will differ if the game has been updated since 2026-10-23:

```
Saved <n> files to vendor/<today>
  engine   /_next/static/chunks/useCompositeListItem-….js
  wind     /_next/static/chunks/conditions-….js
  controls /_next/static/chunks/heat-replay-….js
  scene    /_next/static/chunks/scene-….js
  week     /_next/static/chunks/scoring-version-….js
Not on the site (guessed names, ignored): …
```

If it fails with "Expected one module containing …", the game's code has changed: find the module that now holds that part (grep the downloaded chunks) and update the marker in `lib/snapshot.mjs`, keeping the rule that it appears in exactly one module.

- [ ] **Step 4: Run the integrity test**

Run: `node --test test/snapshot-integrity.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Confirm the snapshot is not tracked**

Run: `git status --short`
Expected: only `test/snapshot-integrity.test.mjs` is listed; nothing under `vendor/`.

- [ ] **Step 6: Commit**

```bash
git add test/snapshot-integrity.test.mjs
git commit -m "Add snapshot integrity tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Check every signature against the real snapshot

**Files:**
- Test: `test/identify-snapshot.test.mjs`

- [ ] **Step 1: Write the test**

`test/identify-snapshot.test.mjs`:

```js
// Every code signature must match exactly once in the current snapshot.
// Skipped when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, tryOpenSnapshot } from "../lib/snapshot.mjs";
import { SIGNATURES } from "../mods/lib/identify.js";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("every signature matches exactly once in the current snapshot", { skip }, async () => {
  const game = await loadGame(snapshot, ["engine", "wind", "controls", "week"]);
  for (const signatures of Object.values(SIGNATURES)) {
    for (const label of Object.keys(signatures)) assert.notEqual(game[label], undefined, `${label} not found`);
  }
  assert.equal(typeof game.step, "function");
  assert.equal(typeof game.heatRules.seconds, "number");
});

test("the weekly calendar starts weeks on Monday at midnight in Warsaw", { skip }, async () => {
  const { weekStart, nextWeekStart, weekConditions } = await loadGame(snapshot, ["week"]);
  const start = weekStart(Date.parse("2026-10-24T12:00:00Z"));
  assert.equal(new Date(start).toISOString(), "2026-10-18T22:00:00.000Z");
  assert.equal(new Date(nextWeekStart(start)).toISOString(), "2026-10-25T23:00:00.000Z");
  assert.deepEqual(Object.keys(weekConditions(start)).sort(), ["gustKnots", "knots", "seed"]);
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/identify-snapshot.test.mjs`
Expected: PASS, 2 tests.

If a signature reports "0 matches" or "2 matches", the game's code changed. Pretty-print the part's module (`npx --yes esbuild@0.23.1 <file> --format=esm`), find the function by what it does, and update its regex in `mods/lib/identify.js` against the minified text. Re-run until it passes.

- [ ] **Step 3: Commit**

```bash
git add test/identify-snapshot.test.mjs
git commit -m "Check code signatures against the current snapshot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Headless harness (`sim/`)

**Files:**
- Create: `sim/load.mjs`, `sim/run.mjs`
- Test: `test/sim.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/sim.test.mjs`:

```js
// The engine is deterministic in Node. Skipped when no snapshot has been taken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tryOpenSnapshot } from "../lib/snapshot.mjs";
import { loadEngine } from "../sim/load.mjs";
import { runHeat } from "../sim/run.mjs";
import { ROOT } from "./helpers.mjs";

const skip = !tryOpenSnapshot(ROOT) && "no snapshot yet: run npm run snapshot";
const weave = (i) => ({ steer: Math.sin(i / 200) * 0.5, power: 0.9, charge: i % 400 > 300 });

test("the same seed and inputs end in the same state", { skip }, async () => {
  const engine = await loadEngine();
  const a = runHeat(engine, { seed: 7, steps: 120 * 60, input: weave });
  const b = runHeat(engine, { seed: 7, steps: 120 * 60, input: weave });
  assert.equal(a.hash, b.hash);
  assert.ok(a.state.totalTime > 59, `only ${a.state.totalTime} s simulated`);
  assert.equal(typeof a.totals.total, "number");
});

test("a different seed gives a different run", { skip }, async () => {
  const engine = await loadEngine();
  const a = runHeat(engine, { seed: 7, steps: 2400, input: weave });
  const b = runHeat(engine, { seed: 8, steps: 2400, input: weave });
  assert.notEqual(a.hash, b.hash);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/sim.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `sim/load.mjs`.

- [ ] **Step 3: Write `sim/load.mjs`**

```js
// Loads the current snapshot's engine in Node, for headless runs and tests.
import { fileURLToPath } from "node:url";
import { loadGame, openSnapshot } from "../lib/snapshot.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function loadEngine({ root = ROOT, snapshot } = {}) {
  return loadGame(openSnapshot(root, snapshot), ["engine", "wind", "controls"]);
}
```

- [ ] **Step 4: Write `sim/run.mjs`**

```js
// Runs a heat headlessly in fixed 1/120 s steps, like the game's own loop.
// input(step, state) returns { steer, power, charge } for each step.
import { createHash } from "node:crypto";

export const DT = 1 / 120;

export function runHeat(engine, { seed, steps, input, heat = true }) {
  const state = engine.initState(engine.conditions(seed));
  state.heat.enabled = heat;
  for (let i = 0; i < steps && !state.heat.done; i++) engine.step(state, input(i, state), DT);
  const hash = createHash("sha256").update(JSON.stringify(state)).digest("hex");
  return { state, totals: engine.heatTotals(state.heat), hash };
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `node --test test/sim.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add sim/load.mjs sim/run.mjs test/sim.test.mjs
git commit -m "Add the headless harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: JSON store (`server/store.mjs`)

**Files:**
- Create: `server/store.mjs`
- Test: `test/store.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/store.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createStore } from "../server/store.mjs";
import { tempDir } from "./helpers.mjs";

test("a new store starts empty", (t) => {
  const store = createStore(join(tempDir(t), "data", "db.json"));
  assert.deepEqual(store.data, { riders: [], heats: [], feedback: [] });
});

test("updates are saved to the file and survive a reload", (t) => {
  const file = join(tempDir(t), "data", "db.json");
  const store = createStore(file);
  const result = store.update((data) => {
    data.riders.push({ key: "k1" });
    return "done";
  });
  assert.equal(result, "done");
  assert.deepEqual(store.data.riders, [{ key: "k1" }]);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).riders, [{ key: "k1" }]);
  assert.deepEqual(createStore(file).data.riders, [{ key: "k1" }]);
  assert.equal(existsSync(`${file}.tmp`), false);
});

test("a failed update leaves the data unchanged", (t) => {
  const store = createStore(join(tempDir(t), "db.json"));
  assert.throws(() => store.update((data) => {
    data.riders.push({ key: "half" });
    throw new Error("boom");
  }), /boom/);
  assert.deepEqual(store.data.riders, []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/store.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/store.mjs`.

- [ ] **Step 3: Write `server/store.mjs`**

```js
// The fake server's data: one JSON file, replaced atomically on every change so
// a crash can't leave it half-written.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const EMPTY = { riders: [], heats: [], feedback: [] };

export function createStore(file) {
  let data = existsSync(file) ? { ...EMPTY, ...JSON.parse(readFileSync(file, "utf8")) } : structuredClone(EMPTY);
  return {
    get data() {
      return data;
    },
    // fn changes a copy of the data; the copy is saved and becomes current.
    update(fn) {
      const next = structuredClone(data);
      const result = fn(next);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
      renameSync(`${file}.tmp`, file);
      data = next;
      return result;
    },
  };
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/store.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/store.mjs test/store.test.mjs
git commit -m "Add the fake server's JSON store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Rider API (`server/api/rider.mjs`)

**Files:**
- Create: `server/api/reply.mjs`, `server/api/rider.mjs`
- Test: `test/api-rider.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/api-rider.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { rider } from "../server/api/rider.mjs";
import { createStore } from "../server/store.mjs";
import { tempDir } from "./helpers.mjs";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const appearance = { hair: "short", sail: "teal" };
const newStore = (t) => createStore(join(tempDir(t), "db.json"));
const create = (store, nickname = "Tester") => rider({ action: "create", nickname, appearance, password: "", device: {} }, store);

test("create returns a profile the client accepts", (t) => {
  const { status, body } = create(newStore(t));
  assert.equal(status, 200);
  assert.match(body.profile.key, UUID_V4);
  assert.deepEqual({ ...body.profile, key: "k" }, { key: "k", revision: 1, protected: false, nickname: "Tester", appearance });
});

test("create refuses a nickname that is taken, ignoring case", (t) => {
  const store = newStore(t);
  create(store);
  const { status, body } = create(store, "tester");
  assert.equal(status, 409);
  assert.match(body.error, /taken/);
});

test("lookup finds a rider by nickname, or returns null", (t) => {
  const store = newStore(t);
  create(store);
  assert.deepEqual(rider({ action: "lookup", nickname: "TESTER" }, store).body, { rider: { nickname: "Tester", appearance, protected: false } });
  assert.deepEqual(rider({ action: "lookup", nickname: "Nobody" }, store).body, { rider: null });
});

test("login returns the existing profile; unknown nicknames are 404", (t) => {
  const store = newStore(t);
  const { profile } = create(store).body;
  assert.deepEqual(rider({ action: "login", nickname: "Tester", password: "anything" }, store).body, { profile });
  assert.equal(rider({ action: "login", nickname: "Nobody" }, store).status, 404);
});

test("load returns the profile by key; unknown keys are 401", (t) => {
  const store = newStore(t);
  const { profile } = create(store).body;
  assert.deepEqual(rider({ action: "load", playerKey: profile.key }, store).body, { profile });
  assert.equal(rider({ action: "load", playerKey: "00000000-0000-4000-8000-000000000000" }, store).status, 401);
});

test("save bumps the revision and stores the changes", (t) => {
  const store = newStore(t);
  const { profile } = create(store).body;
  const look = { hair: "long", sail: "red" };
  const saved = rider({ action: "save", playerKey: profile.key, revision: 1, nickname: "Tester", appearance: look }, store).body.profile;
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.appearance, look);
  assert.deepEqual(rider({ action: "load", playerKey: profile.key }, store).body.profile, saved);
  assert.equal(rider({ action: "save", playerKey: "missing" }, store).status, 401);
});

test("logout succeeds and unknown actions are 400", (t) => {
  const store = newStore(t);
  assert.deepEqual(rider({ action: "logout", playerKey: "k" }, store), { status: 200, body: {} });
  assert.equal(rider({ action: "explode" }, store).status, 400);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/api-rider.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/api/rider.mjs`.

- [ ] **Step 3: Write `server/api/reply.mjs`**

```js
// Response helpers for the fake APIs. Errors carry an `error` message, which
// the client shows to the player.
export const ok = (body) => ({ status: 200, body });
export const fail = (status, error) => ({ status, body: { error } });
```

- [ ] **Step 4: Write `server/api/rider.mjs`**

```js
// Rider profiles. The copy has one local user, so passwords are never checked.
// Profiles have the shape the client validates: a v4 UUID key, a revision from
// 1, a protected flag, a nickname and an appearance object.
import { randomUUID } from "node:crypto";
import { fail, ok } from "./reply.mjs";

const NOT_FOUND = "This rider is not on this computer. Choose a nickname again.";
const profile = (r) => ({ key: r.key, revision: r.revision, protected: false, nickname: r.nickname, appearance: r.appearance });
const byKey = (data, key) => data.riders.find((r) => r.key === key);
const byName = (data, nickname) => data.riders.find((r) => r.nickname.toLowerCase() === String(nickname ?? "").toLowerCase());

export function rider(body, store) {
  const { data } = store;
  switch (body.action) {
    case "create": {
      if (byName(data, body.nickname)) return fail(409, "That nickname is taken. Log in instead.");
      const r = { key: randomUUID(), revision: 1, nickname: body.nickname, appearance: body.appearance ?? {} };
      store.update((d) => void d.riders.push(r));
      return ok({ profile: profile(r) });
    }
    case "login": {
      const r = byName(data, body.nickname);
      return r ? ok({ profile: profile(r) }) : fail(404, "No rider with that nickname.");
    }
    case "lookup": {
      const r = byName(data, body.nickname);
      return ok({ rider: r ? { nickname: r.nickname, appearance: r.appearance, protected: false } : null });
    }
    case "load": {
      const r = byKey(data, body.playerKey);
      return r ? ok({ profile: profile(r) }) : fail(401, NOT_FOUND);
    }
    case "save": {
      const r = byKey(data, body.playerKey);
      if (!r) return fail(401, NOT_FOUND);
      const next = { ...r, nickname: body.nickname ?? r.nickname, appearance: body.appearance ?? r.appearance, revision: r.revision + 1 };
      store.update((d) => {
        d.riders[d.riders.findIndex((x) => x.key === r.key)] = next;
      });
      return ok({ profile: profile(next) });
    }
    case "logout":
      return ok({});
    default:
      return fail(400, `Unknown rider action: ${body.action}`);
  }
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `node --test test/api-rider.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add server/api/reply.mjs server/api/rider.mjs test/api-rider.test.mjs
git commit -m "Add the fake rider API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Heats and leaderboard APIs

**Files:**
- Create: `server/api/heats.mjs`, `server/api/leaderboard.mjs`
- Test: `test/api-leaderboard.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/api-leaderboard.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { startHeat } from "../server/api/heats.mjs";
import { board, submitHeat } from "../server/api/leaderboard.mjs";
import { rider } from "../server/api/rider.mjs";
import { createStore } from "../server/store.mjs";
import { WEEK, fakeGame, tempDir } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const landed = (tack, label, score) => ({ tack, label, score, status: "landed" });
const TWO_MOVES = [landed("port", "Culo", 8.5), landed("starboard", "Spock", 7.25)];

function setup(t) {
  const store = createStore(join(tempDir(t), "db.json"));
  const { profile } = rider({ action: "create", nickname: "Tester", appearance: { sail: "teal" } }, store).body;
  return { store, key: profile.key };
}

function playHeat(store, key, attempts, at) {
  const { heatId } = startHeat({ playerKey: key, scoringVersion: 2 }, store, fakeGame, at).body;
  return { heatId, res: submitHeat({ heatId, playerKey: key, attempts, replay: { format: 1, data: "abc" } }, store, fakeGame, at + 1000) };
}

test("registering a heat needs a known rider and returns its week", (t) => {
  const { store, key } = setup(t);
  assert.equal(startHeat({ playerKey: "missing" }, store, fakeGame, NOW).status, 401);
  const { status, body } = startHeat({ playerKey: key, scoringVersion: 2 }, store, fakeGame, NOW);
  assert.equal(status, 200);
  assert.match(body.heatId, UUID_V4);
  assert.equal(body.weekStart, fakeGame.weekStart(NOW));
});

test("submitting a heat scores it, keeps its replay and ranks it for the week", (t) => {
  const { store, key } = setup(t);
  const { res } = playHeat(store, key, TWO_MOVES, NOW);
  assert.deepEqual(res, { status: 200, body: { best: 15.75, weekly: { rank: 1, best: 15.75 } } });
  assert.deepEqual(store.data.heats[0].replay, { format: 1, data: "abc" });
  assert.equal(store.data.heats[0].score, 15.75);
});

test("a heat can be submitted once, and only if it was started here", (t) => {
  const { store, key } = setup(t);
  const { heatId } = playHeat(store, key, TWO_MOVES, NOW);
  assert.equal(submitHeat({ heatId, playerKey: key, attempts: TWO_MOVES }, store, fakeGame, NOW).status, 410);
  assert.equal(submitHeat({ heatId: "nope", playerKey: key, attempts: [] }, store, fakeGame, NOW).status, 404);
});

test("a heat without a scoring move is saved but not ranked", (t) => {
  const { store, key } = setup(t);
  const { res } = playHeat(store, key, [], NOW);
  assert.deepEqual(res.body, { best: 0 });
});

test("the board shows the week, its wind and each rider's best heat", (t) => {
  const { store, key } = setup(t);
  playHeat(store, key, TWO_MOVES, NOW);
  playHeat(store, key, [landed("port", "Kono", 10)], NOW + 60_000);
  const { status, body } = board(new URLSearchParams({ version: "2" }), store, fakeGame, NOW + 120_000);
  assert.equal(status, 200);
  const row = {
    rank: 1,
    nickname: "Tester",
    appearance: { sail: "teal" },
    score: 15.75,
    achievedAt: NOW + 1000,
    scoringVersion: 2,
    conditions: { seed: 1, knots: 18, gustKnots: 4 },
    tricks: [{ tack: "port", label: "Culo", score: 8.5 }, { tack: "starboard", label: "Spock", score: 7.25 }],
  };
  assert.deepEqual(body, {
    scoringVersionStarts: {},
    rows: [row],
    elo: [],
    weekly: {
      weekStart: fakeGame.weekStart(NOW),
      weekEnd: fakeGame.nextWeekStart(NOW),
      currentWeekStart: fakeGame.weekStart(NOW),
      firstWeekStart: fakeGame.weekStart(NOW),
      conditions: { seed: 1, knots: 18, gustKnots: 4 },
      rows: [row],
    },
  });
});

test("the board can show an earlier week and other scoring versions", (t) => {
  const { store, key } = setup(t);
  playHeat(store, key, TWO_MOVES, NOW);
  const earlier = fakeGame.weekStart(NOW) - WEEK;
  const { body } = board(new URLSearchParams({ version: "1", week: String(earlier) }), store, fakeGame, NOW);
  assert.equal(body.weekly.weekStart, earlier);
  assert.deepEqual(body.weekly.rows, []);
  assert.deepEqual(body.rows, []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/api-leaderboard.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/api/heats.mjs`.

- [ ] **Step 3: Write `server/api/heats.mjs`**

```js
// Registers a solo heat before it starts, as the original server does. The
// heat ID lets the finished heat be submitted to the leaderboard.
import { randomUUID } from "node:crypto";
import { fail, ok } from "./reply.mjs";

export function startHeat(body, store, game, now) {
  if (!store.data.riders.some((r) => r.key === body.playerKey)) return fail(401, "Choose a rider nickname first.");
  const heat = { heatId: randomUUID(), playerKey: body.playerKey, scoringVersion: body.scoringVersion ?? 2, weekStart: game.weekStart(now), startedAt: now };
  store.update((d) => void d.heats.push(heat));
  return ok({ heatId: heat.heatId, weekStart: heat.weekStart });
}
```

- [ ] **Step 4: Write `server/api/leaderboard.mjs`**

```js
// Leaderboards built from heats played on this computer. Heats are scored with
// the game's own heat totals and weeks come from the game's own calendar, so
// the numbers match what the player saw at the end of the heat.
import { fail, ok } from "./reply.mjs";

const ranked = (data) => data.heats.filter((h) => h.finishedAt && h.score > 0);

// Each rider's best heat, best first; the earlier heat wins a tie.
function bestPerRider(heats) {
  const best = new Map();
  for (const h of heats) {
    const current = best.get(h.playerKey);
    if (!current || h.score > current.score || (h.score === current.score && h.finishedAt < current.finishedAt)) best.set(h.playerKey, h);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.finishedAt - b.finishedAt);
}

function rows(heats, data, game) {
  return bestPerRider(heats).map((h, i) => {
    const r = data.riders.find((x) => x.key === h.playerKey);
    return {
      rank: i + 1,
      nickname: r?.nickname ?? "Unknown rider",
      appearance: r?.appearance ?? {},
      score: h.score,
      achievedAt: h.finishedAt,
      scoringVersion: h.scoringVersion,
      conditions: game.weekConditions(h.weekStart),
      tricks: h.tricks,
    };
  });
}

export function submitHeat(body, store, game, now) {
  const heat = store.data.heats.find((h) => h.heatId === body.heatId && h.playerKey === body.playerKey);
  if (!heat) return fail(404, "That heat was not started on this computer.");
  if (heat.finishedAt) return fail(410, "That heat has already been saved.");
  const attempts = Array.isArray(body.attempts) ? body.attempts : [];
  const totals = game.heatTotals({ attempts });
  const finished = {
    ...heat,
    finishedAt: now,
    attempts,
    replay: body.replay ?? null,
    score: totals.total,
    tricks: totals.counting.map((a) => ({ tack: a.tack, label: a.label, score: a.score })),
  };
  store.update((d) => {
    d.heats[d.heats.findIndex((h) => h.heatId === heat.heatId)] = finished;
  });
  const mine = ranked(store.data).filter((h) => h.playerKey === heat.playerKey);
  const best = Math.max(0, ...mine.map((h) => h.score));
  if (finished.score <= 0) return ok({ best });
  const week = bestPerRider(ranked(store.data).filter((h) => h.weekStart === heat.weekStart));
  const rank = week.findIndex((h) => h.playerKey === heat.playerKey) + 1;
  return ok({ best, weekly: { rank, best: week[rank - 1].score } });
}

export function board(query, store, game, now) {
  const version = Number(query.get("version") ?? 2);
  const currentWeekStart = game.weekStart(now);
  const weekStart = query.has("week") ? game.weekStart(Number(query.get("week"))) : currentWeekStart;
  const heats = ranked(store.data);
  return ok({
    scoringVersionStarts: {},
    rows: rows(heats.filter((h) => h.scoringVersion === version), store.data, game),
    elo: [],
    weekly: {
      weekStart,
      weekEnd: game.nextWeekStart(weekStart),
      currentWeekStart,
      firstWeekStart: Math.min(currentWeekStart, ...heats.map((h) => h.weekStart)),
      conditions: game.weekConditions(weekStart),
      rows: rows(heats.filter((h) => h.weekStart === weekStart), store.data, game),
    },
  });
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `node --test test/api-leaderboard.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add server/api/heats.mjs server/api/leaderboard.mjs test/api-leaderboard.test.mjs
git commit -m "Add the fake heats and leaderboard APIs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Lobby, feedback and the API router

**Files:**
- Create: `server/api/lagoons.mjs`, `server/api/feedback.mjs`, `server/api/index.mjs`
- Test: `test/api-router.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/api-router.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { handleApi } from "../server/api/index.mjs";
import { createStore } from "../server/store.mjs";
import { fakeGame, tempDir } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const context = (t) => ({ store: createStore(join(tempDir(t), "db.json")), game: fakeGame, now: () => NOW });
const call = (ctx, method, path, body = {}, query = new URLSearchParams()) => handleApi({ method, path, query, body }, ctx);

test("the lobby socket is told there is no relay", (t) => {
  assert.deepEqual(call(context(t), "POST", "/api/lagoons/lobby-connect"), { status: 200, body: { relay: null } });
});

test("lobby polls get an empty lobby with the server time", (t) => {
  const { status, body } = call(context(t), "POST", "/api/lagoons", { action: "sync" });
  assert.equal(status, 200);
  assert.deepEqual(body, { serverTime: NOW, room: null, riders: [], challenges: [], rankings: [] });
});

test("other 1v1 endpoints are unavailable", (t) => {
  const { status, body } = call(context(t), "POST", "/api/lagoons/signaling");
  assert.equal(status, 404);
  assert.match(body.error, /1v1 is unavailable/);
});

test("feedback is kept locally", (t) => {
  const ctx = context(t);
  assert.deepEqual(call(ctx, "POST", "/api/feedback", { id: "f1", message: "Great", contact: "" }), { status: 200, body: { ok: true } });
  assert.deepEqual(ctx.store.data.feedback, [{ id: "f1", message: "Great", contact: "", at: NOW }]);
});

test("rider, heats and leaderboard calls reach their handlers", (t) => {
  const ctx = context(t);
  const { profile } = call(ctx, "POST", "/api/rider", { action: "create", nickname: "Tester", appearance: {} }).body;
  assert.equal(profile.nickname, "Tester");
  const { heatId } = call(ctx, "POST", "/api/heats", { playerKey: profile.key, scoringVersion: 2 }).body;
  assert.equal(call(ctx, "POST", "/api/leaderboard", { heatId, playerKey: profile.key, attempts: [] }).status, 200);
  assert.equal(call(ctx, "GET", "/api/leaderboard", undefined, new URLSearchParams({ version: "2" })).status, 200);
});

test("unknown endpoints are 404 and marked unknown", (t) => {
  const result = call(context(t), "POST", "/api/admin");
  assert.equal(result.status, 404);
  assert.equal(result.unknown, true);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/api-router.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/api/index.mjs`.

- [ ] **Step 3: Write `server/api/lagoons.mjs`**

```js
// 1v1 needs other riders online, which a private copy never has. The lobby
// socket is told there is no relay, which makes the client switch it off, and
// lobby polls get an empty lobby so the client stays quiet.
import { fail, ok } from "./reply.mjs";

export function lagoons(path, now) {
  if (path === "/api/lagoons/lobby-connect") return ok({ relay: null });
  if (path === "/api/lagoons") return ok({ serverTime: now, room: null, riders: [], challenges: [], rankings: [] });
  return fail(404, "1v1 is unavailable in the local copy.");
}
```

- [ ] **Step 4: Write `server/api/feedback.mjs`**

```js
// Keeps feedback-form messages on this computer instead of sending them.
import { ok } from "./reply.mjs";

export function feedback(body, store, now) {
  store.update((d) => void d.feedback.push({ id: body.id ?? null, message: String(body.message ?? ""), contact: String(body.contact ?? ""), at: now }));
  return ok({ ok: true });
}
```

- [ ] **Step 5: Write `server/api/index.mjs`**

```js
// Routes /api/* requests to the fake APIs. Anything else gets a 404 marked
// `unknown`, which the server logs.
import { feedback } from "./feedback.mjs";
import { startHeat } from "./heats.mjs";
import { lagoons } from "./lagoons.mjs";
import { board, submitHeat } from "./leaderboard.mjs";
import { fail } from "./reply.mjs";
import { rider } from "./rider.mjs";

// request: { method, path, query: URLSearchParams, body }; ctx: { store, game, now() }
export function handleApi({ method, path, query, body }, { store, game, now }) {
  const route = `${method} ${path}`;
  if (route === "POST /api/rider") return rider(body, store);
  if (route === "POST /api/heats") return startHeat(body, store, game, now());
  if (route === "GET /api/leaderboard") return board(query, store, game, now());
  if (route === "POST /api/leaderboard") return submitHeat(body, store, game, now());
  if (route === "POST /api/feedback") return feedback(body, store, now());
  if (path === "/api/lagoons" || path.startsWith("/api/lagoons/")) return lagoons(path, now());
  return { ...fail(404, "Not available in the local copy."), unknown: true };
}
```

- [ ] **Step 6: Run the test to see it pass**

Run: `node --test test/api-router.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add server/api/lagoons.mjs server/api/feedback.mjs server/api/index.mjs test/api-router.test.mjs
git commit -m "Add the quiet lobby, local feedback and the API router" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Page preparation (`server/html.mjs`)

**Files:**
- Create: `server/html.mjs`
- Test: `test/html.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/html.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOADER_TAG, prepareHtml } from "../server/html.mjs";

const PAGE = `<!doctype html><html><head><script src="/_next/static/chunks/a.js"></script></head><body><header class="topbar"></header><script>self.__x=1</script><script>(function(){var s='/cdn-cgi/challenge-platform/scripts/jsd/main.js'})()</script></body></html>`;

test("the loader goes right after <head>, once", () => {
  const html = prepareHtml(PAGE);
  assert.ok(html.startsWith(`<!doctype html><html><head>${LOADER_TAG}<script src="/_next/static/chunks/a.js">`));
  assert.equal(html.split(LOADER_TAG).length - 1, 1);
  assert.ok(html.includes(`<header class="topbar"></header>`));
});

test("Cloudflare's bot check is removed and other scripts stay", () => {
  const html = prepareHtml(PAGE);
  assert.ok(!html.includes("/cdn-cgi/"));
  assert.ok(html.includes("<script>self.__x=1</script>"));
});

test("a page without <head> is refused", () => {
  assert.throws(() => prepareHtml("<html><body></body></html>"), /no <head> tag/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/html.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/html.mjs`.

- [ ] **Step 3: Write `server/html.mjs`**

```js
// Prepares the snapshot's page for local use. Cloudflare's bot-check script is
// removed (it only exists on fristajlo.ws) and the mod loader is added right
// after <head>, so it runs before the game's own modules.
export const LOADER_TAG = '<script type="module" src="/__mods/loader.js"></script>';

export function prepareHtml(html) {
  if (!html.includes("<head>")) throw new Error("The snapshot page has no <head> tag");
  const withoutBotCheck = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (tag) => (tag.includes("/cdn-cgi/challenge-platform/") ? "" : tag));
  return withoutBotCheck.replace("<head>", `<head>${LOADER_TAG}`);
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/html.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/html.mjs test/html.test.mjs
git commit -m "Prepare the snapshot page for local use" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Serve-time patches (`server/patches.mjs`)

**Files:**
- Create: `server/patches.mjs`
- Test: `test/patches.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/patches.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPatches, loadPatches, patchSnapshot } from "../server/patches.mjs";
import { makeSnapshot, tempDir } from "./helpers.mjs";

const parts = { engine: "/e.js" };
const rule = (fields) => ({ mod: "m", replace: "B", expect: 1, ...fields });

test("a part rule changes only that part's module", () => {
  const rules = [rule({ part: "engine", find: "a", expect: 2 })];
  assert.equal(applyPatches("/e.js", "aXa", parts, rules), "BXB");
  assert.equal(applyPatches("/other.js", "aXa", parts, rules), "aXa");
});

test("a marker rule changes only modules containing the marker", () => {
  const rules = [rule({ marker: "MARK", find: "a" })];
  assert.equal(applyPatches("/x.js", "MARK a", parts, rules), "MARK B");
  assert.equal(applyPatches("/y.js", "plain a", parts, rules), "plain a");
});

test("find can be a global pattern", () => {
  const rules = [rule({ part: "engine", find: /a\d/g, expect: 2 })];
  assert.equal(applyPatches("/e.js", "a1 a2 b3", parts, rules), "B B b3");
});

test("a wrong match count fails with the mod's name", () => {
  const rules = [rule({ part: "engine", find: "zzz" })];
  assert.throws(() => applyPatches("/e.js", "abc", parts, rules), /Patch from mod "m" expected 1 match\(es\) of "zzz" in \/e\.js, found 0/);
});

test("loadPatches reads patches.mjs from enabled mods and checks each rule", async (t) => {
  const mods = tempDir(t);
  mkdirSync(join(mods, "a"));
  writeFileSync(join(mods, "a", "patches.mjs"), `export const patches = [{ part: "engine", find: "x", replace: "y", expect: 1 }];`);
  mkdirSync(join(mods, "b"));
  assert.deepEqual(await loadPatches(mods, ["a", "b"]), [{ part: "engine", find: "x", replace: "y", expect: 1, mod: "a" }]);
  mkdirSync(join(mods, "bad"));
  writeFileSync(join(mods, "bad", "patches.mjs"), `export const patches = [{ part: "engine", marker: "m", find: "x", replace: "y", expect: 1 }];`);
  await assert.rejects(loadPatches(mods, ["bad"]), /needs exactly one of part or marker/);
});

test("patchSnapshot patches a snapshot, recording failures and rules that target nothing", (t) => {
  const snapshot = makeSnapshot(tempDir(t), "s", {
    "/": "<html><head></head></html>",
    "/_next/static/chunks/e.js": "engine a",
    "/_next/static/chunks/p.js": "page MARK",
  }, { engine: "/_next/static/chunks/e.js" });
  const logs = [];
  const result = patchSnapshot(snapshot, [
    rule({ mod: "good", part: "engine", find: "a" }),
    rule({ mod: "bad", marker: "MARK", find: "missing" }),
    rule({ mod: "lost", marker: "NOWHERE", find: "x" }),
  ], (message) => logs.push(message));
  assert.deepEqual(result.get("/_next/static/chunks/e.js"), { text: "engine B" });
  assert.match(result.get("/_next/static/chunks/p.js").error, /mod "bad"/);
  assert.equal(result.size, 2);
  assert.ok(logs.some((m) => /mod "lost" targets 0 modules/.test(m)));
  assert.ok(logs.some((m) => /mod "bad" expected 1/.test(m)));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/patches.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/patches.mjs`.

- [ ] **Step 3: Write `server/patches.mjs`**

```js
// Serve-time patches: mods can rewrite a game module's text before it is
// served. A rule targets a module by part or by a marker text only that module
// contains, and states how many matches it expects, so a game update that
// breaks a patch fails loudly instead of silently doing nothing.
//   { part: "engine" } or { marker: "text" }, plus
//   { find: "text" or /pattern/g, replace: "text", expect: 1 }
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileFor } from "../lib/snapshot.mjs";

export async function loadPatches(modsDir, modNames) {
  const rules = [];
  for (const mod of modNames) {
    const file = join(modsDir, mod, "patches.mjs");
    if (!existsSync(file)) continue;
    const { patches } = await import(pathToFileURL(file).href);
    for (const rule of patches) {
      if (!rule.part === !rule.marker) throw new Error(`Patch from mod "${mod}" needs exactly one of part or marker`);
      if (!(typeof rule.find === "string" || rule.find?.global) || !Number.isInteger(rule.expect)) {
        throw new Error(`Patch from mod "${mod}" needs find (a string or a global pattern) and an integer expect`);
      }
      rules.push({ ...rule, mod });
    }
  }
  return rules;
}

const describe = (value) => (typeof value === "string" ? JSON.stringify(value) : String(value));
const countMatches = (text, find) => (typeof find === "string" ? text.split(find).length - 1 : [...text.matchAll(find)].length);
const targets = (rule, path, text, parts) => (rule.part ? parts[rule.part] === path : text.includes(rule.marker));

// Applies every rule that targets this module. Throws on a wrong match count.
export function applyPatches(path, text, parts, rules) {
  let out = text;
  for (const rule of rules) {
    if (!targets(rule, path, text, parts)) continue;
    const count = countMatches(out, rule.find);
    if (count !== rule.expect) {
      throw new Error(`Patch from mod "${rule.mod}" expected ${rule.expect} match(es) of ${describe(rule.find)} in ${path}, found ${count}`);
    }
    out = out.replaceAll(rule.find, rule.replace);
  }
  return out;
}

// Patches a whole snapshot at startup. Returns a Map of URL path to { text }
// for patched modules or { error } for modules a patch failed on.
export function patchSnapshot(snapshot, rules, log = console.error) {
  const result = new Map();
  if (!rules.length) return result;
  const modules = snapshot.manifest.files.map((f) => f.path).filter((path) => /\.m?js$/.test(path));
  const texts = new Map(modules.map((path) => [path, readFileSync(join(snapshot.dir, fileFor(path)), "utf8")]));
  for (const rule of rules) {
    const hits = modules.filter((path) => targets(rule, path, texts.get(path), snapshot.manifest.parts));
    if (hits.length !== 1) log(`Patch from mod "${rule.mod}" targets ${hits.length} modules (${describe(rule.part ?? rule.marker)}); it needs exactly one`);
  }
  for (const path of modules) {
    const text = texts.get(path);
    try {
      const patched = applyPatches(path, text, snapshot.manifest.parts, rules);
      if (patched !== text) result.set(path, { text: patched });
    } catch (error) {
      log(error.message);
      result.set(path, { error: error.message });
    }
  }
  return result;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/patches.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/patches.mjs test/patches.test.mjs
git commit -m "Add serve-time patches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The server (`server/app.mjs`, `server/index.mjs`)

**Files:**
- Create: `server/app.mjs`, `server/index.mjs`
- Test: `test/server.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/server.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CSP, createApp } from "../server/app.mjs";
import { LOADER_TAG } from "../server/html.mjs";
import { fakeGame, makeSnapshot, tempDir } from "./helpers.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const FILES = {
  "/": `<!doctype html><html><head><script src="/_next/static/chunks/main.js"></script></head><body><script>(function(){var a='/cdn-cgi/challenge-platform/scripts/jsd/main.js'})()</script></body></html>`,
  "/_next/static/chunks/main.js": `console.log("Same keys in the air");`,
  "/_next/static/chunks/engine.js": `export const rules={attemptsPerTack:8};`,
  "/wordmark.svg": `<svg xmlns="http://www.w3.org/2000/svg"></svg>`,
};

async function startServer(t, { mods = [], modFiles = {} } = {}) {
  const root = tempDir(t);
  makeSnapshot(root, "fixture", FILES, { engine: "/_next/static/chunks/engine.js" });
  for (const [path, text] of Object.entries(modFiles)) {
    const out = join(root, "mods", path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
  }
  const logs = [];
  const server = await createApp({ root, mods, dataFile: join(root, "data", "db.json"), game: fakeGame, now: () => NOW, log: (m) => logs.push(m) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { get: (path, init) => fetch(base + path, init), logs };
}

const post = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("the page drops the bot check, adds the loader and carries the CSP", async (t) => {
  const { get } = await startServer(t);
  const res = await get("/");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-security-policy"), CSP);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const html = await res.text();
  assert.ok(html.includes(`<head>${LOADER_TAG}`));
  assert.ok(!html.includes("/cdn-cgi/"));
});

test("snapshot files are served with their content type; anything else is 404", async (t) => {
  const { get } = await startServer(t);
  const svg = await get("/wordmark.svg");
  assert.equal(svg.status, 200);
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  const js = await get("/_next/static/chunks/engine.js");
  assert.equal(js.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal((await get("/nope.js")).status, 404);
  assert.equal((await get("/favicon.ico")).status, 204);
  assert.equal((await get("/vendor/current.json")).status, 404);
});

test("mods: the config, mod files, and no way out of the mods folder", async (t) => {
  const { get } = await startServer(t, { mods: ["demo"], modFiles: { "demo/index.js": "export default { name: 'demo', setup() {} };" } });
  assert.deepEqual(await (await get("/__mods/config.json")).json(), { snapshot: "fixture", parts: { engine: "/_next/static/chunks/engine.js" }, mods: ["demo"] });
  const mod = await get("/__mods/demo/index.js");
  assert.equal(mod.status, 200);
  assert.equal(mod.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal((await get("/__mods/..%2F..%2Fpackage.json")).status, 404);
  assert.equal((await get("/__mods/missing.js")).status, 404);
});

test("patches change modules; a broken patch answers 500 naming the mod", async (t) => {
  const { get, logs } = await startServer(t, {
    mods: ["good", "bad"],
    modFiles: {
      "good/patches.mjs": `export const patches = [{ marker: "Same keys in the air", find: "Same keys in the air", replace: "Same keys in the air · local", expect: 1 }];`,
      "bad/patches.mjs": `export const patches = [{ part: "engine", find: "missing text", replace: "x", expect: 1 }];`,
    },
  });
  assert.ok((await (await get("/_next/static/chunks/main.js")).text()).includes("Same keys in the air · local"));
  const broken = await get("/_next/static/chunks/engine.js");
  assert.equal(broken.status, 500);
  assert.match(await broken.text(), /mod "bad"/);
  assert.ok(logs.some((m) => /mod "bad"/.test(m)));
});

test("API calls reach the fake APIs; unknown ones are 404 and logged", async (t) => {
  const { get, logs } = await startServer(t);
  const created = await get("/api/rider", post({ action: "create", nickname: "Tester", appearance: {} }));
  assert.equal(created.status, 200);
  assert.equal((await created.json()).profile.nickname, "Tester");
  assert.deepEqual(await (await get("/api/lagoons/lobby-connect", post({}))).json(), { relay: null });
  assert.equal((await get("/api/admin")).status, 404);
  assert.ok(logs.includes("Unknown API call: GET /api/admin"));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/server.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/app.mjs`.

- [ ] **Step 3: Write `server/app.mjs`**

```js
// The local server: the snapshot's files, the mod loader and its config,
// serve-time patches and the fake APIs. It never forwards anything to the
// internet, and the CSP header makes the browser refuse other hosts too.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileFor, loadGame, openSnapshot } from "../lib/snapshot.mjs";
import { handleApi } from "./api/index.mjs";
import { prepareHtml } from "./html.mjs";
import { loadPatches, patchSnapshot } from "./patches.mjs";
import { createStore } from "./store.mjs";

export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
].join("; ");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};
const typeOf = (path) => TYPES[extname(path)] ?? "application/octet-stream";

// Returns an http.Server that isn't listening yet. `game` and `now` can be
// replaced in tests; by default the snapshot's engine and calendar are loaded.
export async function createApp({ root, snapshot: name, mods, dataFile, modsDir = join(root, "mods"), game, now = Date.now, log = console.log }) {
  const snapshot = openSnapshot(root, name);
  game ??= await loadGame(snapshot, ["engine", "week"]);
  const store = createStore(dataFile);
  const patched = patchSnapshot(snapshot, await loadPatches(modsDir, mods), log);
  const page = prepareHtml(readFileSync(join(snapshot.dir, "index.html"), "utf8"));
  const config = JSON.stringify({ snapshot: snapshot.name, parts: snapshot.manifest.parts, mods });
  const files = new Set(snapshot.manifest.files.map((f) => f.path));
  const modsRoot = resolve(modsDir) + sep;
  const ctx = { store, game, now };

  const send = (res, status, type, body) => {
    res.writeHead(status, { "content-type": type, "content-security-policy": CSP, "cache-control": "no-store" });
    res.end(body);
  };

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith("/api/")) {
      const body = req.method === "POST" ? await readJson(req) : undefined;
      const result = handleApi({ method: req.method, path, query: url.searchParams, body }, ctx);
      if (result.unknown) log(`Unknown API call: ${req.method} ${path}`);
      return send(res, result.status, TYPES[".json"], JSON.stringify(result.body));
    }
    if (path === "/") return send(res, 200, TYPES[".html"], page);
    if (path === "/__mods/config.json") return send(res, 200, TYPES[".json"], config);
    if (path.startsWith("/__mods/")) {
      const file = resolve(modsDir, path.slice("/__mods/".length));
      if (!file.startsWith(modsRoot)) return send(res, 404, "text/plain", "Not found");
      try {
        return send(res, 200, typeOf(file), readFileSync(file));
      } catch {
        return send(res, 404, "text/plain", "Not found");
      }
    }
    const patch = patched.get(path);
    if (patch?.error) return send(res, 500, "text/plain; charset=utf-8", patch.error);
    if (patch) return send(res, 200, TYPES[".js"], patch.text);
    if (files.has(path)) return send(res, 200, typeOf(path), readFileSync(join(snapshot.dir, fileFor(path))));
    if (path === "/favicon.ico") return send(res, 204, "text/plain", "");
    return send(res, 404, "text/plain", "Not found");
  }

  return createServer((req, res) => {
    handle(req, res).catch((error) => {
      log(error.stack ?? String(error));
      send(res, 500, "text/plain", "Local server error");
    });
  });
}

async function readJson(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}
```

- [ ] **Step 4: Write `server/index.mjs`**

```js
// Starts the local copy of the game on 127.0.0.1.
//   npm start -- [--port 5180] [--snapshot <name>] [--mods a,b]
//   npm start -- --mods=      runs the original with no mods
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createApp } from "./app.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const { values } = parseArgs({
  options: {
    port: { type: "string", default: "5180" },
    snapshot: { type: "string" },
    mods: { type: "string" },
  },
});
const mods = values.mods !== undefined ? values.mods.split(",").filter(Boolean) : JSON.parse(readFileSync(join(root, "mods", "enabled.json"), "utf8"));

try {
  const server = await createApp({ root, snapshot: values.snapshot, mods, dataFile: join(root, "data", "db.json") });
  server.listen(Number(values.port), "127.0.0.1", () => {
    console.log(`Local copy running at http://localhost:${values.port}`);
    console.log(`Mods: ${mods.length ? mods.join(", ") : "none"}`);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `node --test test/server.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS for every file. If a snapshot exists, the snapshot tests run too; otherwise they are reported as skipped.

- [ ] **Step 7: Commit**

```bash
git add server/app.mjs server/index.mjs test/server.test.mjs
git commit -m "Add the local server" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Mod loader, game hooks and the proof mod

**Files:**
- Create: `mods/lib/game.js`, `mods/loader.js`, `mods/enabled.json`, `mods/local-badge/index.js`, `mods/local-badge/patches.mjs`
- Test: `test/game-hooks.test.mjs`, `test/badge-patch.test.mjs`

- [ ] **Step 1: Write the failing tests**

`test/game-hooks.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { onStep } from "../mods/lib/game.js";

test("onStep runs every hook on each read and keeps the game's input", () => {
  let reads = 0;
  const controls = { read(state) { reads++; return { steer: state.x }; } };
  const game = { controls };
  const seen = [];
  onStep(game, (state, input) => seen.push(["a", state.x, input.steer]));
  onStep(game, (state, input) => seen.push(["b", state.x, input.steer]));
  assert.deepEqual(game.controls.read({ x: 0.5 }), { steer: 0.5 });
  assert.equal(reads, 1);
  assert.deepEqual(seen, [["a", 0.5, 0.5], ["b", 0.5, 0.5]]);
});
```

`test/badge-patch.test.mjs`:

```js
// The proof mod's patch must apply cleanly to the current snapshot. Skipped
// when no snapshot has been taken yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tryOpenSnapshot } from "../lib/snapshot.mjs";
import { loadPatches, patchSnapshot } from "../server/patches.mjs";
import { ROOT } from "./helpers.mjs";

const snapshot = tryOpenSnapshot(ROOT);
const skip = !snapshot && "no snapshot yet: run npm run snapshot";

test("the local-badge patch changes exactly one module", { skip }, async () => {
  const logs = [];
  const patched = patchSnapshot(snapshot, await loadPatches(join(ROOT, "mods"), ["local-badge"]), (m) => logs.push(m));
  assert.deepEqual(logs, []);
  const changed = [...patched.values()];
  assert.equal(changed.length, 1);
  assert.ok(changed[0].text.includes("Same keys in the air · local"));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/game-hooks.test.mjs test/badge-patch.test.mjs`
Expected: FAIL. `game-hooks` with `ERR_MODULE_NOT_FOUND` for `mods/lib/game.js`; `badge-patch` with 0 changed modules (no patches.mjs yet).

- [ ] **Step 3: Write `mods/lib/game.js`**

```js
// Finds the running game object (kept in a React ref next to the canvas, as
// the Freestajlo bot found it) and lets mods run code on every physics step.

export function findGame() {
  for (const canvas of document.querySelectorAll("canvas")) {
    for (let el = canvas, depth = 0; el && depth < 6; el = el.parentElement, depth++) {
      const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
      for (let f = key && el[key], up = 0; f && up < 40; f = f.return, up++) {
        for (let h = f.memoizedState, i = 0; h && i < 80; h = h.next, i++) {
          const cur = h.memoizedState?.current;
          if (cur?.controls && cur.state && typeof cur.setKey === "function") return cur;
        }
      }
    }
  }
  return null;
}

export function whenGame(interval = 250) {
  return new Promise((resolve) => {
    const check = () => {
      const game = findGame();
      if (game) resolve(game);
      else setTimeout(check, interval);
    };
    check();
  });
}

// The game calls controls.read(state) once per physics step and uses the input
// it returns. Wrapping it once lets any number of hooks see each step.
const hooks = [];
let wrapped = null;

export function onStep(game, fn) {
  hooks.push(fn);
  if (wrapped === game.controls) return;
  wrapped = game.controls;
  const read = game.controls.read;
  game.controls.read = function (state) {
    const input = read.call(this, state);
    for (const hook of hooks) hook(state, input);
    return input;
  };
}
```

- [ ] **Step 4: Write `mods/loader.js`**

```js
// Mod loader, injected into the page by the local server right after <head>.
// It imports the game's own modules by URL (the browser shares the instances
// the game uses), finds the functions mods need, then runs each enabled mod.
import { onStep, whenGame } from "./lib/game.js";
import { identify } from "./lib/identify.js";

const config = await (await fetch("/__mods/config.json")).json();
const parts = {};
for (const [part, url] of Object.entries(config.parts)) parts[part] = await import(url);
const engine = identify(parts);

const stack = document.createElement("div");
stack.style.cssText = "position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none";
document.body.append(stack);

const loaded = [];
for (const name of config.mods) {
  const log = (...args) => console.log(`[mod ${name}]`, ...args);
  try {
    const { default: mod } = await import(`/__mods/${name}/index.js`);
    await mod.setup({
      snapshot: config.snapshot,
      mods: config.mods,
      engine,
      parts,
      log,
      whenGame,
      onStep: async (fn) => onStep(await whenGame(), fn),
      overlay(id) {
        const el = document.createElement("div");
        el.dataset.mod = id;
        stack.append(el);
        return el;
      },
    });
    loaded.push(name);
  } catch (error) {
    console.error(`[mod ${name}] failed during setup and was skipped`, error);
  }
}
console.log(`[mods] ${loaded.length} of ${config.mods.length} loaded${loaded.length ? `: ${loaded.join(", ")}` : ""}`);
window.__freestyleMods = { config, engine, parts, loaded };
```

- [ ] **Step 5: Write `mods/enabled.json`**

```json
["local-badge"]
```

- [ ] **Step 6: Write `mods/local-badge/index.js`**

```js
// Proof that the mod layer works: a badge that reads the heat rules through
// the identified engine and shows the physics clock through the step hook.
export default {
  name: "local-badge",
  setup({ snapshot, mods, engine, overlay, onStep }) {
    const badge = overlay("local-badge");
    badge.style.cssText = "font:12px/1.4 system-ui,sans-serif;background:rgba(10,40,40,.85);color:#e8f4f2;padding:4px 10px;border-radius:8px";
    const { seconds, attemptsPerTack } = engine.heatRules;
    const text = `Local copy · snapshot ${snapshot} · ${mods.length} mod${mods.length === 1 ? "" : "s"} · heat ${seconds} s, ${attemptsPerTack} attempts per tack`;
    badge.textContent = text;
    let steps = 0;
    onStep((state) => {
      if (++steps % 30 === 0) badge.textContent = `${text} · t ${state.totalTime.toFixed(1)} s`;
    });
  },
};
```

- [ ] **Step 7: Write `mods/local-badge/patches.mjs`**

```js
// Marks the in-game key guide, proving serve-time patches reach the game.
// Menu text isn't used: it is also in the server-rendered page, and changing
// it only in the module would cause a hydration mismatch.
export const patches = [
  {
    marker: "Same keys in the air",
    find: "Same keys in the air",
    replace: "Same keys in the air · local",
    expect: 1,
  },
];
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `node --test test/game-hooks.test.mjs test/badge-patch.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 9: Commit**

```bash
git add mods/lib/game.js mods/loader.js mods/enabled.json mods/local-badge test/game-hooks.test.mjs test/badge-patch.test.mjs
git commit -m "Add the mod loader, step hook and proof mod" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Launch config, README and the browser check

**Files:**
- Create: `.claude/launch.json`, `README.md`

- [ ] **Step 1: Write `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "local-copy",
      "runtimeExecutable": "node",
      "runtimeArgs": ["server/index.mjs"],
      "port": 5180
    }
  ]
}
```

- [ ] **Step 2: Write `README.md`**

````markdown
# freestyle-tour

A private copy of the fristajlo.ws windsurf freestyle game, with mods that show
the game's developer ideas for making it play like the PWA freestyle World Cup.
Never published. See `docs/roadmap.md`.

## Use it

Requires Node 22 or later. No dependencies.

```bash
npm run snapshot     # download a dated copy of the live game into vendor/ (never committed)
npm start            # play it at http://localhost:5180
npm test
```

- `npm start -- --mods=` runs the original with no mods.
- `npm start -- --mods=a,b` runs only the mods listed.
- `npm run snapshot -- --name 2026-11-01` takes a new snapshot after a game update
  and makes it current; run `npm test` to see which mods need updating.

The copy never contacts fristajlo.ws. Riders, heats and feedback are stored in
`data/db.json` (never committed). The 1v1 lobby stays empty.

## Writing a mod

A mod is a folder in `mods/` that you add to `mods/enabled.json`.

- `index.js` exports `default { name, setup(ctx) }`, which runs in the browser.
  `ctx` gives you:
  - `engine`: the game's functions and objects, found by code signature
    (see `mods/lib/identify.js`)
  - `parts`: the raw game modules
  - `whenGame()`: resolves to the running game object
  - `onStep(fn)`: runs `fn(state, input)` every physics step
  - `overlay(id)`: an element for your own UI
  - `log(...)`, `snapshot`, `mods`
- `patches.mjs` (optional) exports `patches`, find-and-replace rules the server
  applies to a game module before serving it:
  `{ part: "engine" | marker: "text", find: "text" | /pattern/g, replace, expect }`.
  `expect` is the number of matches; a wrong count makes that module answer 500
  and names your mod in the server log.

`mods/local-badge` is a small example of both.
````

- [ ] **Step 3: Start the local copy in the browser pane**

Use `preview_start` with name `local-copy`.
Expected: the server log shows `Local copy running at http://localhost:5180` and `Mods: local-badge`, and the pane shows the fristajlo menu with the "Meet your rider" dialog.
If the pane cannot connect, add `"url": "http://127.0.0.1:5180"` to the configuration and start it again.

- [ ] **Step 4: Check isolation**

- `read_network_requests`: every request is to `http://localhost:5180`.
- `read_console_messages` with `onlyErrors: true`: no "Content Security Policy" messages, and no 503s.
- `preview_logs`: no "Unknown API call" lines and no "Patch from mod" lines.

- [ ] **Step 5: Check the game end to end**

In the pane:

1. **Create a rider:** type "Local tester" in "Meet your rider" and continue. Expected: the menu shows the rider, and `data/db.json` contains it.
2. **Badge:** "Local copy · snapshot <name> · 1 mod · heat 180 s, 8 attempts per tack" appears near the top.
3. **Tutorial:** accept the tutorial prompt, play a step, and leave it.
4. **Practice:** start it. Expected: the key guide heading reads "Same keys in the air · local", and the badge shows a running clock ("· t 12.3 s").
5. **Solo heat:** start it and sail until the heat ends (3 minutes). Expected: no error banner; the results show the heat; `data/db.json` has a heat with `finishedAt`, `score` and `replay`.
6. **Leaderboard:** open it. Expected: "This week" shows the week's wind and your heat, if it scored. "All-time bests" shows the same row.
7. **Look studio:** open "Edit rider", change a colour and save. Expected: in `data/db.json` the rider's `revision` went up by one.
8. **1v1 lobby:** open it. Expected: an empty lobby, and no stream of console errors.
9. **Reload the page.** Expected: the rider is still signed in.

- [ ] **Step 6: Check the original runs with no mods**

Stop the server (`preview_stop`), change `runtimeArgs` to `["server/index.mjs", "--mods="]`, start it again, and confirm the badge is gone and the key guide reads "Same keys in the air". Then restore `runtimeArgs` to `["server/index.mjs"]` and stop the server.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: every test passes, including the snapshot tests.

- [ ] **Step 8: Commit**

```bash
git add .claude/launch.json README.md
git commit -m "Add launch config and README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
