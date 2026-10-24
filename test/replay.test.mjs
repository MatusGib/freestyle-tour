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
