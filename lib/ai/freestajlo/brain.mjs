// Copied unchanged from Freestajlo (bot/brain.mjs, 2026-10-23 version) for freestyle-tour's AI riders.
// The bot's decision making. It reads the same state the game renders and acts
// only through the game's own controls (steer / sheet / charge, key taps).
//
// Sailing is a simple heading controller. Jumps are planned by model-predictive
// control: from the exact current state the bot simulates each candidate trick
// program with the game's own engine, refines its timing, and then replays the
// best plan input-for-input. Physics is deterministic, so the replay matches.
import { fork } from "./sim.mjs";
import { PROGRAMS } from "./programs.mjs";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const tackName = (side) => (side > 0 ? "port" : "starboard");
const CHARGES = [60, 80, 100, 115, 125, 134]; // jump charge steps tried per program
const DELAYS = [0, 45, 90, 150, 240, 360]; // steps to sail on before setting up
const PUMP_PRE = [0, 60, 120, 240, 360]; // steps of pumping before the setup
const PUMP_EVERY = [25, 32, 40]; // steps between pumps (0.2 s is the minimum)

export const DEFAULTS = {
  cruisePower: 0.95, // just under the 0.95 threshold where full power drains energy
  burstPower: 1, // sheet while pumping before a jump
  goEnergy: 0.7, // minimum energy before a jump, unless time is running out
  courseX: -25, // preferred downwind position (area is |x| <= 110)
  courseZ: 165, // jibe before passing |z| > this (area is |z| <= 210)
  refineTop: 3, // programs that get timing refinement after the coarse pass
  refineEvals: 30, // timing refinements per refined program
  minGain: 0.05, // skip jumps that would not raise the heat total
  pumpBelow: 7, // pump when slower than this (m/s)
  freePump: 0.97, // also pump while cruising with at least this much energy
  freePumpEvery: 0.9, // seconds between those pumps (1.1 s is the longest that counts)
  jibePower: 0.95, // sheet while jibing
  gustLook: 10, // wind samples ahead (0.8 s apart) when choosing a course
  courseWeight: 0.6, // how strongly to hold courseX versus chase gusts
  coursePeak: 0.5, // 0 steers for the best average wind ahead, 1 for the strongest gust
  waitCost: 0.04, // points per second of waiting, so equal plans go sooner
  energyCost: 0.6, // points per full energy bar spent on a jump
  coarsePump: 120, // pre-jump pumping (steps) assumed when first comparing programs
  thinkSteps: 150, // planning is spread over this many physics steps
  idleReplan: 1, // seconds to wait before planning again after finding nothing worth doing
  waitHorizon: 16, // seconds of wind forecast checked before jumping
  waitMargin: 0.5, // knots of extra wind ahead that are worth waiting for
  lateSeconds: 9, // within this many seconds of the course end, jump without waiting
  lateEnergy: 0.45, // ... as long as there's this much energy
  goodTrick: 8.5, // the score a counting trick should reach (for choosing a tack)
  otherTackRoom: 150, // metres of room needed before jibing over to the needier tack
  target: null, // heat score to aim for; null goes for the highest possible
  overshoot: 1, // with a target: points a trick loses per point it scores above its share
};

export function createBrain(E, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const rules = E.heatRules;
  // With a target, each counting trick aims for an even share of it.
  const share = cfg.target ? cfg.target / rules.counting : Infinity;
  let plan = null; // { frames, i }
  let jibing = 0; // tack side we are turning away from, or 0
  const log = options.log ?? (() => {});

  // --- sailing ---------------------------------------------------------------

  // The course is the downwind component of the heading (sine of the angle
  // off a beam reach). Pick the one that meets the most drive over the next few
  // seconds: gusts drift downwind and are known in advance, as is how hard each
  // heading pulls. Stay near courseX so the jumps happen inside the area.
  let sigma = 0.25;
  let sigmaAt = -99;
  const drive = (a) => {
    const s = Math.sqrt(1 - a * a);
    return a < -0.7 ? Math.max(0.025, (a + 1) * 0.8) : 0.74 + 0.26 * s + 0.24 * a * s;
  };
  function chooseCourse(state) {
    const v = Math.max(8, state.speed);
    let best = -Infinity;
    let pick = sigma;
    for (let c = -0.5; c <= 0.61; c += 0.1) {
      const h = state.tackSide > 0 ? Math.asin(c) : Math.PI - Math.asin(c);
      const vx = Math.sin(h) * v;
      const vz = -Math.cos(h) * v;
      let mean = 0;
      let peak = 0;
      for (let k = 1; k <= cfg.gustLook; k++) {
        const t = k * 0.8;
        const wk = E.wind(state.conditions, state.x + vx * t, state.z + vz * t, state.totalTime + t);
        mean += wk / cfg.gustLook;
        peak = Math.max(peak, wk);
      }
      const w = mean + cfg.coursePeak * (peak - mean);
      const xEnd = state.x + vx * 4;
      const score =
        (w / 18) ** 2 * drive(c) -
        cfg.courseWeight * Math.max(0, Math.abs(xEnd - cfg.courseX) - 25) / 50 -
        (Math.abs(c - sigma) < 0.05 ? 0 : 0.02);
      if (score > best) (best = score), (pick = c);
    }
    return pick;
  }

  function steerFor(state, sigma) {
    const s = state.tackSide;
    const target = s > 0 ? Math.asin(sigma) : Math.PI - Math.asin(sigma);
    return clamp(3 * wrapAngle(target - state.heading) - 0.4 * state.turn, -1, 1);
  }

  // Default sailing input; deterministic in the state so plans can include it.
  function sailInput(state, power = cfg.cruisePower) {
    // Easing through a jibe turns tighter and recovers energy faster.
    if (jibing && state.tackSide === jibing)
      return { steer: jibing > 0 ? 1 : -1, power: cfg.jibePower, charge: false };
    return { steer: steerFor(state, sigma), power, charge: false };
  }

  // Attempt bookkeeping, mirroring the game's heat rules.
  function scoringBlock(state) {
    const h = state.heat;
    if (!h.enabled) return null;
    if (h.done || state.totalTime >= rules.seconds) return "time";
    const tack = tackName(state.tackSide);
    if (h.attempts.filter((a) => a.tack === tack).length >= rules.attemptsPerTack) return "limit";
    if (h.lastAttemptTack && h.readyTack !== tack) return "turn";
    return null;
  }

  // Metres left before the course end forces a jibe (port sails toward -z,
  // starboard toward +z), on this tack or on the other one.
  const room = (state, side = state.tackSide) => (side > 0 ? state.z + cfg.courseZ : cfg.courseZ - state.z);

  // Points still missing from a tack's three counting tricks, measured against
  // a good trick (cfg.goodTrick, or the target's share); an empty slot counts
  // as a whole one.
  function tackNeed(state, side) {
    const counting = E.heatTotals(state.heat).counting.filter((a) => a.tack === tackName(side));
    let need = 0;
    for (let i = 0; i < 3; i++) need += Math.max(0, Math.min(cfg.goodTrick, share) - (counting[i]?.score ?? 0));
    return need;
  }

  function needJibe(state) {
    if (jibing) return false;
    const block = scoringBlock(state);
    if (block === "turn" || block === "limit") return true;
    if (room(state) < 0) return true;
    // This tack is well covered but the other one isn't: head over there.
    return (
      state.heat.enabled &&
      tackNeed(state, state.tackSide) < 1 &&
      tackNeed(state, -state.tackSide) >= 3 &&
      room(state, -state.tackSide) > cfg.otherTackRoom
    );
  }

  // --- planning --------------------------------------------------------------

  // The judges' identity of a combo: what counts as "the same trick" in a heat
  // (air/wet don't matter, and any combo that starts with a Culo or holds two in
  // a row, such as a Double Air Culo, is just a Culo).
  function trickKey(raw) {
    const moves = raw.split(">").flatMap((m) => {
      const kind = m.replace(/^(air|wet):/, "");
      return kind === "double_air_culo" ? ["culo", "culo"] : [kind];
    });
    if (moves[0] === "culo" || moves.some((k, i) => k === "culo" && moves[i + 1] === "culo")) return "culo";
    return moves.map((k) => (Object.hasOwn(E.tricks, k) ? E.tricks[k].scoring.identity : k)).join(">");
  }

  function total(heat) {
    return E.heatTotals(heat).total;
  }

  // What a heat is worth to the planner: its total, or with a target, each
  // counting trick up to its share of the target, minus what it scores above.
  function worth(heat) {
    const totals = E.heatTotals(heat);
    if (!cfg.target) return totals.total;
    return totals.counting.reduce((sum, a) => sum + Math.min(a.score, share) - cfg.overshoot * Math.max(0, a.score - share), 0);
  }

  // Simulates a program from a copy of the state and returns the frames to
  // replay. params: charge (steps holding Jump), taps ([steps after takeoff,
  // slot]), delay (steps to sail on first, e.g. into a gust), pumpPre (steps of
  // pumping before the setup; pumping carries on through an upright charge)
  // and pumpEvery (steps between pumps).
  function simulate(from, prog, params) {
    const { charge, taps, delay = 0, pumpPre = 0, pumpEvery = 25 } = params;
    const sim = fork(E, from.state, from.controls);
    const s = sim.state;
    const energy = s.energy;
    const frames = [];
    let pumping = false;
    let sincePump = 1e9;
    const run = (input, acts = []) => {
      if (pumping && ++sincePump >= pumpEvery && !s.ducked && !s.ducking) (acts = [...acts, ["pump"]]), (sincePump = 0);
      for (const a of acts) a[0] === "trick" ? sim.act.trick(a[1]) : sim.act[a[0]]();
      sim.step(input);
      frames.push({ input, acts, x: s.x, z: s.z, t: s.totalTime });
    };
    // Full sheet while pumping: a little more speed for very little energy.
    const burst = () => sailInput(s, pumping && !s.ducked && !s.ducking ? cfg.burstPower : cfg.cruisePower);
    for (let i = 0; i < delay; i++) run(sailInput(s));
    pumping = pumpPre > 0;
    for (let i = 0; i < pumpPre; i++) run(burst());
    // Setup: stance and sail position, then charge, then release.
    let guard = 0;
    while (guard++ < 240) {
      const acts = [];
      if (!!prog.switch !== s.switchStance && s.stanceProgress >= 1 && !s.ducking && !s.ducked) acts.push(["stance"]);
      else if (!!prog.ducked !== s.ducked && !s.ducking && s.stanceProgress >= 1 && (!!prog.switch === s.switchStance)) acts.push(["duck"]);
      if (!acts.length && s.stanceProgress >= 1 && !s.ducking && s.ducked === !!prog.ducked && s.switchStance === !!prog.switch && s.rigTransition >= 0.98) break;
      run(burst(), acts);
    }
    for (let i = 0; i < charge; i++) run({ ...burst(), charge: true });
    const before = worth(s.heat);
    const pointsBefore = total(s.heat);
    run({ ...burst(), charge: false });
    pumping = false;
    if (!s.air) return null;
    const takeoff = frames.length;
    let k = 0;
    for (let i = 0; i < 120 * 9; i++) {
      const acts = [];
      while (k < taps.length && taps[k][0] <= i) acts.push(["trick", taps[k++][1]]);
      run(sailInput(s), acts);
      if (!s.air && !s.sliding && !s.landing && !s.heat.activeId) break;
    }
    const attempt = s.heat.attempts.at(-1);
    const scored = attempt && attempt.startedAt >= from.state.totalTime ? attempt : null;
    const gain = worth(s.heat) - before;
    return {
      frames,
      takeoff,
      gain,
      points: total(s.heat) - pointsBefore,
      score: scored?.status === "landed" ? scored.score : 0,
      label: scored?.label ?? "no attempt",
      key: scored?.status === "landed" ? trickKey(scored.key) : "",
      value:
        gain +
        0.02 * Math.min(scored?.score ?? 0, share) -
        (s.crashTime ? 1 : 0) -
        (cfg.waitCost * delay) / 120 -
        cfg.energyCost * Math.max(0, energy - s.energy),
    };
  }

  function attempt(from, prog, params) {
    const r = simulate(from, prog, params);
    return r && { ...r, prog, params };
  }
  // The planner is a generator that yields after every simulation, so its work
  // is spread over many physics steps instead of freezing the game.
  function* evaluate(from, prog, params) {
    const r = attempt(from, prog, params);
    yield;
    return r;
  }
  const better = (a, b) => (a && (!b || a.value > b.value) ? a : b);
  function* vary(from, best, key, values) {
    for (const v of values) best = better(yield* evaluate(from, best.prog, { ...best.params, [key]: v }), best);
    return best;
  }

  // Coarse pass: how hard to charge decides how much airtime there is.
  function* scanCharge(from, prog) {
    let best = null;
    for (const charge of CHARGES)
      best = better(yield* evaluate(from, prog, { charge, taps: prog.taps, pumpPre: cfg.coarsePump }), best);
    return best;
  }

  // Local search over charge length and tap timing around the best so far.
  function* refine(from, start, rand) {
    let best = start;
    for (let n = 0; n < cfg.refineEvals; n++) {
      const { charge, taps } = best.params;
      const next = yield* evaluate(from, best.prog, {
        ...best.params,
        charge: clamp(charge + Math.round((rand() - 0.5) * 16), 20, 140),
        taps: taps
          .map(([t, slot]) => [Math.max(0, t + (rand() < 0.4 ? Math.round((rand() - 0.5) * 16) : 0)), slot])
          .sort((a, b) => a[0] - b[0]),
      });
      best = better(next, best);
    }
    return best;
  }

  // Pumping first builds speed (and so height and spin) at an energy cost;
  // then when to go: sailing on for a while may reach a gust.
  function* scanExtras(from, c, rushed) {
    let best = yield* vary(from, c, "pumpPre", PUMP_PRE);
    if (best.params.pumpPre) best = yield* vary(from, best, "pumpEvery", PUMP_EVERY);
    return rushed ? best : yield* vary(from, best, "delay", DELAYS);
  }

  // Returns a plan, or null to keep sailing (nothing worth doing yet, or a
  // better moment is coming beyond the delays tried).
  let waiting = null; // best candidate while waiting for a better moment
  function* makePlan(from, rushed) {
    let seed = (from.state.totalTime * 1e3) | 0;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const maxDelay = DELAYS.at(-1);
    // While waiting, only re-check the timing of the candidate we are waiting on.
    if (waiting && !rushed) {
      const again = yield* evaluate(from, waiting.prog, { ...waiting.params, delay: 0 });
      const timed = again && (yield* vary(from, again, "delay", DELAYS));
      if (timed && timed.params.delay === maxDelay) return (waiting = timed), null;
    }
    options.onPlan?.(from);
    const coarse = [];
    for (const p of PROGRAMS) {
      const c = yield* scanCharge(from, p);
      if (c) coarse.push(c);
    }
    coarse.sort((a, b) => b.value - a.value);
    let best = null;
    for (const c of coarse.slice(0, cfg.refineTop)) best = better(yield* scanExtras(from, c, rushed), best);
    if (!best || best.gain < cfg.minGain) return (waiting = null), null;
    if (best.params.delay === maxDelay) return (waiting = best), null;
    waiting = null;
    best = yield* refine(from, best, rand);
    const { charge, delay = 0, pumpPre = 0 } = best.params;
    log(
      `t=${from.state.totalTime.toFixed(1)}s: ${best.label}, predicted ${best.score} (+${best.points.toFixed(2)} heat)` +
        ` · wait ${(delay / 120).toFixed(1)}s, pump ${(pumpPre / 120).toFixed(1)}s, charge ${(charge / 120).toFixed(2)}s`,
    );
    return { frames: best.frames, i: 0 };
  }

  // Thinking happens while sailing a course worked out in advance: simulate the
  // next thinkSteps of plain sailing, plan from where that ends, and sail
  // exactly that course in the meantime.
  const maxEvals =
    7 + PROGRAMS.length * CHARGES.length + cfg.refineTop * (PUMP_PRE.length + PUMP_EVERY.length + DELAYS.length) + cfg.refineEvals;
  const evalsPerStep = Math.ceil(maxEvals / cfg.thinkSteps);
  function startThinking(state, controls, rushed) {
    const sim = fork(E, state, controls);
    const frames = [];
    for (let i = 0; i < cfg.thinkSteps; i++) {
      const input = sailInput(sim.state);
      sim.step(input);
      frames.push({ input, acts: [], x: sim.state.x, z: sim.state.z, t: sim.state.totalTime });
    }
    return { frames, i: 0, gen: makePlan({ state: sim.state, controls: sim.controls }, rushed), result: undefined };
  }

  // Replays recorded frames, checking that the game matches the simulation.
  const matches = (f, state) => f.x === state.x && f.z === state.z && f.t === state.totalTime;
  function follow(track, state, act) {
    const f = track.frames[track.i];
    const prev = track.frames[track.i - 1];
    if (!f) return null;
    if (prev && !matches(prev, state)) {
      log(`t=${state.totalTime.toFixed(2)}s: the game differed from the plan; replanning`);
      return null;
    }
    for (const a of f.acts) a[0] === "trick" ? act.trick(a[1]) : act[a[0]]();
    track.i++;
    return f.input;
  }

  // Whether to plan a jump now: settled, inside the course, fast and rested.
  // Returns false, "go", or "rushed" when the heat is nearly over.
  function readyToGo(state) {
    if (state.crashTime || state.rigTransition < 1 || state.maneuverTime > 0 || jibing) return false;
    if (scoringBlock(state)) return false;
    if (!E.inArea(state.x, state.z)) return false;
    const left = rules.seconds - state.totalTime;
    if (state.heat.enabled && left < 25) return "rushed";
    // Near the end of the course there's no time left to wait for wind.
    if (room(state) < state.speed * cfg.lateSeconds) return state.energy >= cfg.lateEnergy && state.speed > 5 && "go";
    if (state.energy < cfg.goEnergy || state.speed <= 5) return false;
    return (!state.heat.enabled || left > 40) && betterWindAhead(state) ? false : "go";
  }

  // Wind is known ahead of time: a slow base cycle plus gusts drifting
  // downwind. Hold off while clearly stronger wind is coming along our path.
  function betterWindAhead(state) {
    const h = state.tackSide > 0 ? Math.asin(sigma) : Math.PI - Math.asin(sigma);
    const vx = Math.sin(h) * state.speed;
    const vz = -Math.cos(h) * state.speed;
    const at = (t) => E.wind(state.conditions, state.x + vx * t, state.z + vz * t, state.totalTime + t);
    const window = (t) => (at(t) + at(t + 1) + at(t + 2)) / 3;
    const now = window(0);
    for (let t = 3; t <= cfg.waitHorizon; t++) if (window(t) > now + cfg.waitMargin) return true;
    return false;
  }

  // --- main loop -------------------------------------------------------------

  let lastPump = -99;
  let thinking = null; // { frames, i, gen, result } while planning
  let idleUntil = -99; // nothing worth doing: don't think again before this
  function update(state, act, controls) {
    if (plan) {
      const input = follow(plan, state, act);
      if (input) return input;
      plan = null;
    }
    if (thinking && thinking.i < thinking.frames.length) {
      const input = follow(thinking, state, act);
      if (input) {
        for (let k = 0; k < evalsPerStep && thinking.result === undefined; k++) {
          const r = thinking.gen.next();
          if (r.done) thinking.result = r.value;
        }
        return input;
      }
      thinking = null;
    } else if (thinking) {
      const { frames, result } = thinking;
      thinking = null;
      if (!matches(frames.at(-1), state)) log(`t=${state.totalTime.toFixed(2)}s: the game differed from the plan; replanning`);
      else if (result) return (plan = result), update(state, act, controls);
      else if (result === null && !waiting) idleUntil = state.totalTime + cfg.idleReplan;
    }
    if (state.air || state.sliding || state.landing) return sailInput(state);

    if (jibing && state.tackSide !== jibing && state.rigTransition >= 1) jibing = 0;
    if (needJibe(state)) jibing = state.tackSide;
    if (state.totalTime - sigmaAt >= 0.5) (sigma = chooseCourse(state)), (sigmaAt = state.totalTime);

    const ready = readyToGo(state);
    if (!ready) waiting = null;
    else if (state.totalTime >= idleUntil) return (thinking = startThinking(state, controls, ready === "rushed")), update(state, act, controls);

    // Pump in a steady rhythm when slow (it helps most at low speed), and
    // gently whenever the energy bar is full anyway.
    const every = state.speed < cfg.pumpBelow && state.energy > 0.35 ? 0.45 : state.energy >= cfg.freePump ? cfg.freePumpEvery : 0;
    if (every && !jibing && state.speed > 2.5 && state.totalTime - lastPump >= every) {
      act.pump();
      lastPump = state.totalTime;
    }
    return sailInput(state);
  }

  return { update, simulate, trickKey, get plan() { return plan; }, get thinking() { return !!thinking; } };
}

