# Dolphins and a whale: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the practice-only `sealife` mod of
`docs/superpowers/specs/2026-10-31-dolphins-whale-design.md`.

**Architecture:** as the fish mod: pure timing and paths in
`mods/sealife/sealife.js` (tested with `node:test`), models in `model.js`, a
frame loop in `index.js` reading `game.state`, `game.controls` and
`game.visualTime`. A serve-time patch (`patches.mjs`) exports the engine's
wipe-out function as `__seaWipeOut`, which `index.js` gets from `parts.engine`.

**Tech stack:** plain ES modules, three.js r185 (`mods/venues/lib/three.core.min.js`), `node:test`.

Kept brief on purpose (the repo's CLAUDE.md asks for brief plans): each task
lists its tests; the code follows them.

---

### Task 1: Share the fish's helpers

**Files:** create `mods/lib/water.js`, `mods/lib/shapes.js`,
`test/water.test.mjs`; modify `mods/fish/fish.js`, `mods/fish/index.js`,
`mods/fish/model.js`, `test/fish.test.mjs`.

- [ ] Move the `isWaterHeight` test from `test/fish.test.mjs` to `test/water.test.mjs`, importing from `../mods/lib/water.js`; run it: fails (no module).
- [ ] Move `isWaterHeight` and `findWaterHeight` to `mods/lib/water.js`, and `bake` and `makeDroplets` to `mods/lib/shapes.js`; the fish import them.
- [ ] `npm test` passes; reload the game and wipe out: the fish still come.
- [ ] Commit.

### Task 2: When the sea life comes and goes

**Files:** create `mods/sealife/sealife.js`, `test/sealife.test.mjs`.

Tests first, then the code:

- [ ] `isPractice(game)`: true on the water with no heat, tutorial or 1v1 clock; false for each of those and behind the menu.
- [ ] `isCalm(controls)`: no key held and the stick at rest; a key or a moved stick isn't.
- [ ] `isSailing(state)`: false in the air, sliding, landing, crashed or body dragging.
- [ ] `sense(game)`: those plus `loading` (Space held), `airborne`, `crashed`.
- [ ] `nextSea(sea, sense, time)` → `{ sea, hit }`, from `START`:
  - dolphins 10 s after calm sailing starts, not at 9.9 s;
  - an input restarts the count but the dolphins stay;
  - loading a jump or a crash sets their `leave`; gone `DOLPHINS_LEAVE` later;
  - whale 20 s after calm sailing starts; with an input at 15 s, at 35 s;
  - at `start + LAND`: `hit` once if on the water, a miss if in the air or already crashed;
  - whale gone `WHALE_GONE` after its start; out of practice, everything goes at once.
- [ ] `npm test` passes; commit.

### Task 3: Where the dolphins and the whale swim

**Files:** modify `mods/sealife/sealife.js`, `test/sealife.test.mjs`.

- [ ] `dolphinPose(dolphin, t, leave, speed)` → `{ forward, side, lift, pitch }` in the rider's frame, or null: swims in from 14 m behind and 2 m down; beside the rider at its side offset; leaps every `EVERY` s, at least 1.2 m high; nose up leaving the water and down coming back; smooth; with `leave`, no new leaps, the current one finishes, then it dives and is gone by `leave + DOLPHINS_LEAVE`.
- [ ] `whalePose(t)` → `{ across, lift, pitch }` from the landing point, or null: surfaces 8 m to the side; over 4 m high mid-leap; at `LAND` on the landing point, at the surface and flat; sinks and is gone at `WHALE_GONE`; smooth.
- [ ] `aim(rider, whale, time)`: the rider's position plus velocity times the time left to `LAND`.
- [ ] `whaleSplash(i, count, age)`: droplets up and out in a ring, falling back, shrinking to nothing.
- [ ] `npm test` passes; commit.

### Task 4: The game's wipe-out for mods

**Files:** create `mods/sealife/patches.mjs`, `test/sealife-patch-snapshot.test.mjs`.

- [ ] Test (skipped without a snapshot): with the sealife patches loaded through `patchImports`, the engine module exports `__seaWipeOut`; on `initState()` with some speed, `__seaWipeOut(state, false)` sets `crashTime` 4.8, slows the rider and leaves the wipe-out notice. The engine part still identifies.
- [ ] Patch: in the engine part, `export{ti as $,` → `export{Xt as __seaWipeOut,ti as $,` (2026-10-24 names).
- [ ] `npm test` passes; commit.

### Task 5: Draw them

**Files:** create `mods/sealife/model.js`, `mods/sealife/index.js`; modify `mods/enabled.json`, `README.md`.

- [ ] `model.js`: a dolphin (2.2 m, grey-blue, pale belly, beak, back fin, flippers, horizontal flukes apart to beat) and a whale (about 12 m, slate with a white belly and long white flippers, a hump, flukes apart), from `bake`.
- [ ] `index.js`: each frame, `nextSea`; on `hit`, `__seaWipeOut(state, false)` and the notice "Wipeout · a whale!"; dolphins in the rider's frame (moving on at their last speed once leaving); the whale across the rider's path at `aim`, its splash at the landing point; all at the water height. Without the patch, log once and keep the whale away.
- [ ] Enable `sealife` in `mods/enabled.json`, add it to the README's mods list.
- [ ] Commit.

### Task 6: Check it in the game

- [ ] Preview on port 5181 (temporary `.claude/launch.json` entry, restored after).
- [ ] Practice, nothing pressed: dolphins at 10 s; steer: they stay; hold Space: they leave after their leaps.
- [ ] Nothing pressed for 20 s: the whale; on the water: "Wipeout · a whale!" and the fish; jumping as it lands: sail on.
- [ ] A solo heat with nothing pressed: no dolphins.
- [ ] Screenshots to the shared notes folder; hand-over note.
