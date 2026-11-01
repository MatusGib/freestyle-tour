# Dolphins and a whale for a rider who sails along doing nothing

A practice-only mod, `mods/sealife`. Sail along without touching anything and
dolphins come to swim beside you; keep it up and a whale belly-flops in front
of you and knocks you over, unless you jump over the splash.

## Decisions

| Topic | Decision |
|---|---|
| Where | Practice only: no heat, no tutorial, no 1v1 clock, the game on the water (not behind its menu). Solo heats, 1v1 and the Champion's challenge are unchanged |
| Doing nothing | No key held and the touch stick at rest, while sailing: on the water, upright, not jumping, crashed or body dragging. With no input the rider sails straight |
| Dolphins | After 10 s of doing nothing. They stay while you steer or change power; loading a jump (Space held) or a crash sends them away: each finishes the leap it is in and doesn't come back up |
| Whale | After 20 s of doing nothing (10 s more after the dolphins came). Any input restarts the count; the dolphins stay |
| Whale's aim | It lands where you will be: your position plus your velocity times the time left, until it lands |
| Dodge | Only a jump: in the air when it lands, you sail on and it dives away. Steering doesn't help once it has started |
| Crash | The game's own wipe-out (the one a failed landing uses), handed to mods by a serve-time patch; its notice is replaced by "Wipeout · a whale!" |
| Fish | The fish mod comes after a whale crash too, as for any wipe-out |

## What you see

- Dolphins: three, grey-blue with pale bellies, a beak, a curved back fin and
  horizontal tail flukes. Two swim 4-6 m to one side of you, one on the other,
  keeping pace, their fins showing; in turn they leap ahead in arcs about
  1.5 m high every couple of seconds. They swim in from behind and below.
  Leaving, they keep the speed they had and dive away behind you.
- Whale: about 10 m long, dark slate with a white belly and long white
  flippers. Its back surfaces 8 m to the side of where it will land; it leaps
  about 6 m up, flattens out and lands on its belly across your path with a
  big splash, then sinks away. Landing about 2.6 s after it surfaces puts it
  about 25 m ahead at your speed.

## Parts

- `mods/sealife/sealife.js`, pure and tested: practice, doing nothing and
  sailing from the game's state and controls; the visit's state (the quiet
  count, the dolphins' arrival and leaving, the whale's start and outcome);
  each dolphin's place beside the rider; the whale's leap; the splashes.
- `mods/sealife/model.js`: the dolphin and whale models from three.js shapes.
- `mods/sealife/index.js`: each frame, reads the game, updates the visit,
  moves the models at the water height, and makes the rider wipe out when
  the whale lands on them.
- `mods/sealife/patches.mjs`: adds the game's wipe-out function to the engine
  part's exports as `__seaWipeOut`. Tested against the snapshot like the
  venues and champion patches.
- Shared with the fish: the water height lookup moves to `mods/lib/water.js`
  and the mesh baking to `mods/lib/shapes.js`.

## Success criteria

1. In practice, 10 s with nothing pressed brings the dolphins; they swim
   alongside and leap.
2. Steering keeps them; loading a jump sends them off after their leaps.
3. 20 s with nothing pressed brings the whale; on the water when it lands, you
   wipe out ("Wipeout · a whale!") and the fish come.
4. In the air from a jump when it lands, you sail on.
5. Solo heats, 1v1, the tutorial and replays are unchanged; `npm test` passes.

## Not in this

Tunables in the developer panel; sounds; a whale spout.
