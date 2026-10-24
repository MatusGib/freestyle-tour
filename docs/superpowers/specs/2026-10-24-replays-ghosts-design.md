# Sub-project 2: replays and ghosts

Part of the roadmap in `docs/roadmap.md`. Builds on the local copy and mod layer
from sub-project 1. The base game stays unchanged: both features are mods that
only add things on top.

## Goal

Two mods:

- **`ghosts`:** in a solo heat, you sail against a ghost of your best heat of the
  week.
- **`replay-viewer`:** watch any stored heat again, with a timeline, slow motion,
  camera views, the move list and the running score, and save a stretch of it as a
  video file.

## Decisions

| Topic | Decision |
|---|---|
| Which ghost | Your best heat of the current week, on by default; a toggle turns ghosts off |
| Where ghosts appear | Solo heats only. The ghost's heat sailed the same weekly wind, so the comparison is fair |
| Effect on play | None. The ghost is drawn but never affects your physics, attempts or score |
| Viewer | Play and pause, a timeline to drag, speeds from 0.25× to 4×, three camera views, the move list (click to jump), the running score and each move's score as it lands |
| Video | Save a stretch of a replay, up to 60 seconds, as a video file of the game view |
| Which heats are recorded | Solo heats only, as in the original |
| Approach | Re-simulate stored recordings with the game's own engine and controls; draw ghosts with the game's 1v1 opponent display; show replays in the game's own scene |

## Success criteria

1. Any stored solo heat re-simulates to exactly the attempts and score that were
   saved for it.
2. In a solo heat, with a best heat already stored this week, a labelled ghost
   ("Ghost · <nickname> · <score>") starts with you, sails its heat in step with
   your clock, and is gone when its heat ends. Turning the toggle off hides it.
3. The replay viewer lists stored heats and plays any of them in the game's own
   scene. Dragging the timeline, changing speed, switching cameras and clicking a
   move all work. The score shown matches the score saved for the heat.
4. "Save clip" produces a playable video file of the chosen stretch.
5. With both mods off, the game behaves exactly as before, and `npm test` passes.

## Out of scope

- Ghosts in practice or in tournament heats.
- Recording practice sessions.
- Online ghosts or sharing replays with other people.
- Drawing the move list, score or other overlays into the saved video. The video
  shows the 3D game view only.

## How the original works

Found in the 2026-10-24 snapshot:

- **Recording.** During a solo heat the game attaches a recorder to its controls.
  The recorder logs every control event (key down or up, stick position, release
  of all controls) with the number of physics steps taken so far. It encodes the
  steps as variable-length deltas and returns `{ format: 1, steps, events }`, with
  the events base64-encoded. Our local server already stores this with each heat.
- **Starting state.** A solo heat starts from `heatStart(conditions, controls)`
  (already identified by the mod layer). For the weekly challenge, `conditions`
  come from `weekConditions(weekStart)`, also identified.
- **The game loop.** For each physics step the game calls
  `controls.read(state)` and passes the input to `step(state, input, 1/120)`.
  Control events change the controls between steps. Nothing else outside the
  engine changes the state in a solo heat, so a recording plus its starting state
  reproduces the heat exactly.
- **Opponent display.** The game object has `showOpponent(name, now, appearance)`,
  `receiveOpponent(pose)` and `clearOpponent()`. The scene draws the opponent
  every frame once it has been shown, solo heats included, and smoothly blends
  between the poses it receives. A pose is built from a state by a function in the
  game's pose module.
- **Drawing outside a session.** When no session is running, the game doesn't
  step physics but still draws `game.state` every frame, with the rider at the
  state's position once its clock is past 0. `game.paused` would also freeze the
  water animation, so the viewer doesn't use it. The camera's offset comes from
  `game.cameraView` (distance 0.45–2.2, azimuth, elevation −0.18–0.8).
- **Video.** The original's trick-video feature already records a canvas with
  `captureStream` and `MediaRecorder`.

## Approach

**Ghosts:** a second copy of the game state replays the stored heat, one step for
every step you sail, and its pose goes to the opponent display.

**Replay viewer:** the viewer opens from the menu, when the game isn't stepping
physics, puts a replayed state in `game.state` and steps it at the chosen speed.
The game draws it with its own graphics and camera.

We considered playing replays as the opponent rider while your own rider idles
(simpler, but the camera follows the wrong rider), and adapting the original's
trick-video renderer to whole heats (it is built for short vertical clips, so more
code to duplicate and patch). No serve-time patches are needed.

## Components

### Mod layer additions (`mods/lib/identify.js`, `lib/snapshot.mjs`)

- **New part:** `pose`, the game's pose module, marked by `Invalid rider pose.`.
- **New signatures:**
  - `controls.keyCodes`: the list of control codes the recorder indexes into (an
    array starting with `Space` that contains `SpeedDial`)
  - `controls.Recorder`: the recorder class (has `step` and `replay` methods); used
    by tests to record heats in Node
  - `pose.riderPose`: builds an opponent pose from a state (sets `trickStartedAt`)
- **Reindexing:** `npm run snapshot -- --reindex <name>` recomputes the parts of
  an existing snapshot from its files and rewrites its manifest, without
  downloading. It's needed because the current snapshot was taken before the
  `pose` part existed.

### Replay runner (`mods/lib/replay.js`)

A plain module with no browser or Node dependencies, shared by both mods and by
the tests.

- `decodeEvents(replay, keyCodes)`: turns a recording into
  `[{ step, type: "key", code, down } | { step, type: "stick", x, y } | { step, type: "release" }]`.
  Stick values are decoded back to the recorded −1 to 1 range.
- `createRunner(engine, { conditions, replay })`: starts from
  `heatStart(conditions, controls)` with a fresh `Controls`. Before each step it
  applies every event recorded at that step count, then steps the engine with
  `controls.read(state)`. It offers:
  - `state`, `stepCount`, `totalSteps`, `done`
  - `advance(n)`: run up to `n` more steps
  - `seek(stepCount)`: jump to any step. The runner saves a checkpoint (state and
    controls) every 600 steps (5 seconds) as it goes, restores the nearest one
    before the target, and simulates the rest.

### Ghosts mod (`mods/ghosts/`)

- **Toggle:** a small "Ghost" switch in the mod overlay, remembered in browser
  storage, on by default.
- **Start:** when a solo heat starts (a new state with the heat enabled, the clock
  at 0 and no 1v1 competition clock), it asks the local server for this week's
  heats. The week comes from `weekStart(Date.now())`, the game's own calendar. It
  picks the best one with a usable recording. If there is none, the overlay says
  "No ghost yet this week". Otherwise it creates a runner and calls
  `showOpponent("Ghost · <nickname> · <score>", now, <rider's appearance>)`. If the
  fetch finished after the heat began, it first steps the runner to your current
  step count (`Math.round(state.totalTime * 120)`).
- **Each step:** through `ctx.onStep`, it advances the runner by one step and
  sends `receiveOpponent({ ...riderPose(state), updatedAt: performance.now(), streamId: "ghost" })`.
- **End:** when the runner is done, it calls `clearOpponent()`.

### Replay viewer mod (`mods/replay-viewer/`)

- **Entry:** a "Replays" button in the mod overlay, shown only while no session is
  running. It opens a list of stored heats, newest first: date, rider, score, wind,
  and whether a recording exists.
- **Watching:** picking a heat fetches it and replays it to the end once, to check
  it matches the saved score (a full heat takes about 50 ms). Then it creates a
  runner for playback, hides the game's menu (`.menu-layer`) and puts the runner's
  state in `game.state` every frame. Closing the viewer puts the previous state
  back, resets the camera and shows the menu again.
- **Controls:**
  - play and pause; a timeline from 0 to the heat's length that seeks when dragged
  - speeds 0.25×, 0.5×, 1×, 2× and 4× (steps per frame = speed × frame time × 120)
  - cameras: Follow (the game's default view), Side and High, set through
    `game.cameraView`
  - the move list: each attempt with its label, tack and score; clicking one jumps
    to 2 seconds before it started
  - the running heat total and, as each move lands, its label and score
- **Seeking** clears the game's wake trail so it doesn't streak across the jump.
- **Save clip:** mark a start and an end on the timeline, up to 60 seconds. By
  default it runs from 2 seconds before the selected move starts to 8 seconds
  after, because attempts store only their start time. The viewer
  plays that stretch at the chosen speed while recording the game canvas with
  `captureStream(30)` and `MediaRecorder`, using the first format the browser
  supports (MP4, then WebM). It then downloads the file as
  `freestyle-tour-<nickname>-<date>-<start>s.<ext>`.

### Local server

- **Heats store their wind.** `POST /api/heats` saves
  `conditions: weekConditions(weekStart)` with the heat. Heats saved before this
  change get it computed from their `weekStart` when read.
- **Two endpoints, used only by these mods:**

  | Endpoint | Returns |
  |---|---|
  | `GET /api/local/heats?week=<ms>&version=<n>` | Finished heats (all weeks if `week` is missing; all versions if `version` is missing), newest first: `heatId`, `nickname`, `appearance`, `score`, `weekStart`, `finishedAt`, `conditions`, `scoringVersion`, `hasReplay` |
  | `GET /api/local/heats/<heatId>` | One heat: the fields above plus `attempts`, `tricks` and `replay`; `404` if unknown |

### Demo heat (`tools/demo-heat.mjs`)

`node tools/demo-heat.mjs` records a short scripted heat (20 seconds, landing
moves) with the snapshot's engine and controls, for the current week's wind. It
stores the heat under a "Demo rider" in `data/db.json`. Replays and ghosts can
then be shown without playing a heat first, and the browser check can use a heat
with real moves. The recording script lives in `sim/record.mjs` and is shared
with the tests.

## Errors

- **A heat without a usable recording** (the original's recorder gives up on very
  long or unusual input) is listed without a play button and is never used as a
  ghost.
- **A replay that doesn't match its saved score** is still playable. The viewer
  shows "This replay doesn't match the saved score" next to the score, which would
  mean the snapshot changed since the heat was played.
- **The video format is unsupported** (no `MediaRecorder`): "Save clip" is
  disabled with a short explanation.

## Testing

- **`decodeEvents`:** a hand-built recording with key, stick and release events,
  and a step gap above 127 (two-byte delta), decodes to the expected events.
- **Runner with stand-ins:** events are applied before the step whose count they
  carry, and `seek` gives the same result as stepping straight through.
- **Record and replay in Node** (snapshot test): a scripted heat is played with the
  game's own `Controls`, with a `Recorder` attached as the game does. Re-simulating
  its recording with the runner ends in the same state hash and the same attempts.
  The script presses and releases keys, moves the stick and jumps.
- **Seeking in Node** (snapshot test): seeking backwards and forwards across
  checkpoints ends in the same state hash as a straight run.
- **Mod layer:** the new signatures match exactly once in the reindexed snapshot,
  and reindexing adds `pose` without changing the other parts.
- **Server:** heats store their wind; the list filters by week and version and is
  newest first; the detail returns the recording; unknown IDs are `404`.
- **In the browser:**
  1. Sail a solo heat with some tricks. Open the replay viewer: the heat is listed,
     plays, and ends with the saved score.
  2. Drag the timeline, change speed, switch cameras and click a move.
  3. Save a clip and confirm the file plays.
  4. Start another solo heat: the ghost appears at the start, sails your previous
     heat in step, and disappears when its heat ends.
  5. Turn the ghost off: no ghost in the next heat.
  6. With `--mods=`, neither feature appears.

## Risks

- **Swapping `game.state` may confuse parts of the game that keep their own
  history,** such as the wake trail. The viewer clears the wake on seek and hides
  the game's menu while open; the browser check covers the rest.
- **The opponent display blends poses with a small delay** (it buffers at least
  100 ms), so the ghost appears slightly behind its true position. This is
  acceptable for a visual comparison.
- **Hiding the game's menu relies on its page structure.** If a game update
  changes it, the menu may show behind the viewer, which is cosmetic.
