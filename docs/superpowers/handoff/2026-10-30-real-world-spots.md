# Handoff: real-world spots (written 2026-10-30)

Everything a new session needs to carry on with realistic venues. Read this,
then the spec and the plan named below.

## Where things stand

| What | Where | State |
|---|---|---|
| Event winds, the developer panel, the challenge-heat fix | `main` at `2ba6444` (pushed) | Done |
| Spec: real-world spots from map data, Bonaire first | `docs/superpowers/specs/2026-10-30-real-world-spots-design.md` | Done, updated by PR #2 |
| Plan 1: the spot data tool, and Sorobon's files | PR MatusGib/freestyle-tour#2, branch `claude/spot-data-tool-plan-b4efc7` | Built, **open, not merged** |
| Plan 2: Sorobon in the game | `docs/superpowers/plans/2026-10-30-spot-in-game.md` | Written, not started |
| This handoff and plan 2 | Branch `claude/unfinished-work-next-steps-27d77b` (local; its worktree is `.claude/worktrees/unfinished-work-next-steps-27d77b`) | Committed, not pushed |

## Next steps, in order

1. **Review and merge PR #2.** Open `mods/venues/spots/sorobon-bonaire/compare.png`: the red shoreline, yellow reef line and cyan course box should sit right over the satellite image.
2. **Bring plan 2 and this file onto main.** For example, cherry-pick this branch's commit "Plan Sorobon in the game, and hand off the real-world spots work" onto a branch from main.
3. **Build plan 2** task by task. The user prefers building inline in one session, test-first, with a commit per task. Task 1 is a spike in the browser (the camera, sky dome, water mesh and which three.js classes the game bundle has); write its findings into the plan before Task 2.
4. **Then brainstorm and spec the venue rendering pipeline** (spec 2):
   - see-through water over the real seabed, reflections of the shore, bloom and tone mapping;
   - draws on [WaterThreeJS](https://github.com/achrefelouafi/WaterThreeJS) (MIT; credit it if code is reused);
   - follows the game's own quality setting.
5. **Then Pozo and Podersdorf** on the same tools.
   - Pozo: a boulder bay, big swell, needs breaking waves.
   - Podersdorf: a lake, so OpenStreetMap water polygons rather than coastline.
6. **Later:** flip Sotavento and Sylt to the true orientation (they're mirrored today), possibly rebuilding them from map data.

## What the user wants (decided, don't re-ask)

- **Realistic, accurate spots are the main priority.** As realistic as possible, even richer than the game's own stylised look; the riders, buoys and HUD stay the game's.
- **Real map data:** OpenStreetMap, Terrain Tiles elevation, EOX Sentinel-2 cloudless colour, depth estimated from colour. Landmarks are modelled from photos.
- **True orientation:** the map turned so the real wind blows along +x, never mirrored.
- **CC0 assets** (ambientCG, Poly Haven) are fine. **Every download needs the user's OK first**, listing source, files and size: data, textures and models alike.
- **Tunable values go in the developer panel** (the `dev` mod), not in prompts.
- **Explain in plain words**, for someone who isn't a programmer. Keep to `CLAUDE.md` (Karpathy guidelines): surgical changes, tests first, state assumptions.
- **The repo stays private** (Red Bull logo, real names, the NC licence on the imagery). Ask before anything public.

## Facts about Sorobon (from PR #2)

- **Centre and wind:** the centre is 12.0960, −68.2342, in the lagoon inside the reef. `windFrom` 90 (east trades).
- **Layout in game coordinates:** +x is downwind (west), +z is north. The open sea and reef are upwind (−x). Sorobon beach and its buildings are at about x 200–260, z −280…−420, about 117 m beyond the heat area. Mangroves ring the bay's south and west.
- **Depth:** the colour method can't resolve the lagoon floor, so treat water inside the reef as at least 0.8 m and draw the surf from the reef line.
- **No wet sand:** at 9.8 m pixels, ground types never show it. Draw the beach band from the shoreline and the beach polygons.
- **Files:** `mods/venues/spots/sorobon-bonaire/`, 5.8 MB; plan 2 lists each one. Credits are in `CREDITS.md` there.
- **Download cache:** `cache/spots/sorobon-bonaire/` (git-ignored) in the checkout where PR #2 was built. Rebuild with `node tools/spot.mjs sorobon-bonaire`; `--download` only after the user OKs it.

## The game's limits that matter

- **Camera:** `PerspectiveCamera(43, …, 0.1, 1800)`. Nothing beyond 1800 m is drawn unless a venue raises `camera.far`.
- **Fog:** `FogExp2`, density 0.0035 (about 95% at 500 m); venues set their own haze (`look.landHaze` in `mods/venues/water.js`).
- **three.js classes:** the game's own are reachable only through the `Game` hand-over patch in `mods/venues/patches.mjs` (`ve.three={CanvasTexture:f}`), or from existing objects' constructors. The venues also vendor three.js r185's core in `mods/venues/lib` for geometry helpers.
- **Rendering:** one `renderer.render(scene, camera)` per frame, an adaptive quality setting and a GPU timer (`this.gpuTimer`). Spec 2 replaces that draw at venues.
- **The game object:** in the page, `const { findGame } = await import("/__mods/lib/game.js"); findGame()`.

## Working in this repo: things that bit us

- **Windows, Git Bash.** Many files are CRLF.
  - **Prefer the Edit tool.** In scripts, match the file's line endings.
  - **`$` in replacement text:** never pass a string containing `$` as `String.replace`'s replacement (`` $` `` and `$'` are special); pass a function: `s.replace(a, () => b)`.
  - **Regexes in template literals:** inside a JS template literal, write `\\|` for a regex `\|`.
- **Port 5180** is often held by another `node server/index.mjs`, probably from the main checkout. For a preview, add a temporary entry to `.claude/launch.json`:

  ```json
  { "name": "local-copy-5181", "runtimeExecutable": "node", "runtimeArgs": ["server/index.mjs", "--port", "5181"], "port": 5181 }
  ```

  Use `preview_start` with that name, and restore the file afterwards (it's tracked).
- **Worktrees have no `vendor/`.** Without it the snapshot tests are skipped and the preview can't run. Link the main checkout's snapshot in PowerShell:

  ```powershell
  New-Item -ItemType Junction -Path <worktree>\vendor -Target C:\Users\mateusz\Projects\freestyle-tour\vendor
  ```

- **Screenshots** in the browser pane time out while the app window is hidden; read the page with JavaScript or `find` instead.
- **A fresh browser profile** asks for a nickname ("Tester" was used) and offers the game's tutorial. The tutorial no longer eats a planned challenge heat (fixed on main).
- **Tests:** `npm test` (about 295 on main, more with PR #2). Snapshot tests are skipped without `vendor/`.

## Commands

```bash
npm test
node tools/spot.mjs sorobon-bonaire            # build from the cache, or list what it would download
node tools/spot.mjs sorobon-bonaire --where=-120,40   # game point → latitude/longitude
node tools/ai-check.mjs --weeks 2 --targets 40 --winds 12,16,20,24,28
```
