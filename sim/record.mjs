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
