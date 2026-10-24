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
