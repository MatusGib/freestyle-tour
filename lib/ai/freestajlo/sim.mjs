// Copied unchanged from Freestajlo (bot/sim.mjs, 2026-10-23 version) for freestyle-tour's AI riders.
// How bot actions map onto the game. Used both for the bot's own look-ahead
// simulations and for the headless harness, so plans replay exactly in-game.
//
// Every input goes through the game's own controls handler, the way a touch
// player's would: the sailing stick (inside its circle) steers and sheets, Space
// charges the jump, and key taps do the rest. The game records exactly these
// events for its heat replay, so the replay reproduces the heat.
export const DT = 1 / 120;
const SLOT_KEYS = ["KeyA", "KeyW", "KeyD", "KeyS"];

// The stick position that gives a steer (-1..1) and sheet power (0.08..1),
// inverting the game's dead zone (0.12) and sheet curve. The game rounds the
// stick to 1/127ths; the sheet is rounded down so a requested power is never
// exceeded (above 0.95 drains energy). Power wins when both don't fit in the
// stick's circle.
export function stickFor({ steer, power }) {
  const out = (v) => (Math.abs(v) < 1e-3 ? 0 : Math.sign(v) * (0.12 + 0.88 * Math.min(1, Math.abs(v))));
  const y = Math.ceil(out(power >= 0.82 ? (0.82 - power) / 0.18 : (0.82 - power) / 0.74) * 127 - 1e-9) / 127;
  const room = Math.sqrt(Math.max(0, 1 - y * y));
  return { x: Math.max(-room, Math.min(room, out(steer))), y };
}

// The game ignores steering and sheet while airborne, sliding or landing, and
// moving the stick in the air can start a trick, so it stays put then.
const holdStick = (E, state) => state.air || state.sliding || state.landing || E.isAir(state);

// Sends one step's input. `send` reaches the game: stick(x, y), key(code, down).
export function sendInput(E, state, controls, send, input) {
  if (!holdStick(E, state)) {
    const { x, y } = stickFor(input);
    send.stick(x, y);
  }
  if (controls.keys.has("Space") !== !!input.charge) send.key("Space", !!input.charge);
}

// Key taps: in the air A/W/D/S (slots 0/1/2/3) start tricks, on the water W
// pumps, Q switches stance and E ducks the sail.
export function actions(send) {
  const tap = (code) => (send.key(code, true), send.key(code, false), true);
  return {
    trick: (slot) => tap(SLOT_KEYS[slot]),
    pump: () => tap("KeyW"),
    stance: () => tap("KeyQ"),
    duck: () => tap("KeyE"),
  };
}

// A copy of a controls handler's state (held keys, stick, trick arming).
export function cloneControls(E, c) {
  return Object.assign(new E.Controls(), {
    keys: new Set(c.keys),
    stick: { ...c.stick },
    airborne: c.airborne,
    armed: c.armed,
    direction: c.direction,
  });
}

export function wrap(E, state, controls = new E.Controls()) {
  const send = {
    stick: (x, y) => controls.setStick(state, x, y),
    key: (code, down) => controls.setKey(state, code, down),
  };
  return {
    state,
    controls,
    act: actions(send),
    step(input) {
      sendInput(E, state, controls, send, input);
      E.step(state, controls.read(state), DT);
    },
  };
}

// An independent copy of a game state and its controls, for look-ahead.
export const fork = (E, state, controls) => wrap(E, structuredClone(state), cloneControls(E, controls));
