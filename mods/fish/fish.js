// The fish that come to see a rider who has wiped out: who they are, where
// each one swims, and when a visit starts and ends. Pure helpers, shared with
// the tests; index.js draws them. Places are metres from the middle of the
// rider and the sail (x, z) and above the water (lift); times are seconds
// since the wipe-out.

// The game sets crashTime to 4.8 s when the rider wipes out and counts it
// down to 0 while the rider climbs back on. Behind the game's menu the water
// is only scenery.
export const wipedOut = (game) => !!game.active && game.state.crashTime > 0;

export const ARRIVE = 1; // to swim in
export const JUMP = 1.2; // a leap over the rider and the sail
export const LEAVE = 1.4; // to swim off and dive once the rider is up
export const SPLASH = .7; // a splash's droplets in the air
const HIGH = 3.2; // a leap's height
const STEP = .02; // to see which way a fish is going

// colours: body, belly, fins. turn: radians a second round the rider, its
// sign the way round. angle: where it circles from. delay: when it sets off.
// jumps: when it leaps across.
export const FISH = [
  { colours: ["#ff8a3d", "#ffe3c2", "#ffd166"], radius: 3.4, turn: 1.1, angle: 0, delay: 0, jumps: [] },
  { colours: ["#ffd23f", "#fff6cf", "#ff9f1c"], radius: 4.3, turn: -.9, angle: 1.3, delay: .15, jumps: [] },
  { colours: ["#ff6fa8", "#ffe0ec", "#ffb3d1"], radius: 4.6, turn: 1, angle: 2.4, delay: .3, jumps: [] },
  { colours: ["#3fa7ff", "#dcefff", "#ffd23f"], radius: 4.9, turn: -1, angle: 3.6, delay: .1, jumps: [] },
  { colours: ["#2ec4b6", "#d8f6f2", "#ff8a3d"], radius: 3.7, turn: -1.1, angle: 4.5, delay: 0, jumps: [1.1, 3] },
  { colours: ["#9b6bff", "#ebe2ff", "#ff6fa8"], radius: 4, turn: 1.05, angle: 5.5, delay: .2, jumps: [2, 3.8] },
];

// A visit is null (no fish), or { start, up }: the times (the game's clock)
// of the wipe-out and of the rider getting up, null while still in the water.
export function nextVisit(visit, wiped, time) {
  if (wiped) return visit?.up === null ? visit : { start: time, up: null };
  if (!visit) return null;
  if (visit.up === null) return { ...visit, up: time };
  return time >= visit.up + LEAVE ? null : visit;
}

const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
// Swimming just under the surface, back and fin bobbing out.
const bob = (fish, t) => -.1 + .09 * Math.sin(2.6 * t + fish.angle * 3);

// On the fish's circle, swimming in from 6 m further out and 1.4 m down. A
// leap lands on the far side, half a turn on.
function circle(fish, t) {
  const done = fish.jumps.filter((at) => at + JUMP <= t).length;
  const angle = fish.angle + fish.turn * t + done * (Math.PI - fish.turn * JUMP);
  const near = smooth((t - fish.delay) / ARRIVE);
  const r = fish.radius + 6 * (1 - near);
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r, lift: -1.4 + (bob(fish, t) + 1.4) * near };
}

// Where the fish is while the rider is in the water, or null before it sets
// off. A leap goes straight across the middle.
export function fishSpot(fish, t) {
  if (t <= fish.delay) return null;
  const jump = fish.jumps.find((at) => t > at && t < at + JUMP);
  if (jump === undefined) return circle(fish, t);
  const from = circle(fish, jump), u = (t - jump) / JUMP;
  return {
    x: from.x * (1 - 2 * u),
    z: from.z * (1 - 2 * u),
    lift: bob(fish, jump) * (1 - u) + bob(fish, jump + JUMP) * u + 4 * HIGH * u * (1 - u),
  };
}

// Once the rider is up (up: seconds after the wipe-out), the fish darts away
// from the middle, faster and faster, and dives out of sight. A fish leaping
// over the middle carries on across.
function leaving(fish, up, s) {
  const from = fishSpot(fish, up);
  if (!from) return null;
  let dx = from.x, dz = from.z;
  if (Math.hypot(dx, dz) < .5) {
    const next = fishSpot(fish, up + STEP);
    [dx, dz] = [next.x - from.x, next.z - from.z];
  }
  const length = Math.hypot(dx, dz) || 1, go = 3 * s + 1.5 * s * s, k = s / LEAVE;
  return { x: from.x + dx / length * go, z: from.z + dz / length * go, lift: from.lift - (from.lift + 1.8) * k * k };
}

function where(fish, visit, time) {
  if (visit.up === null || time < visit.up) return fishSpot(fish, time - visit.start);
  return time >= visit.up + LEAVE ? null : leaving(fish, visit.up - visit.start, time - visit.up);
}

// The fish's place and which way it faces, for a model with its nose on +x:
// yaw turns it about the vertical (three.js's rotation.y), pitch lifts its
// nose. Null when it is out of sight.
export function fishPose(fish, visit, time) {
  const here = where(fish, visit, time);
  if (!here) return null;
  const ahead = where(fish, visit, time + STEP);
  const [from, to] = ahead ? [here, ahead] : [where(fish, visit, time - STEP), here];
  const dx = to.x - from.x, dz = to.z - from.z;
  return { ...here, yaw: Math.atan2(-dz, dx), pitch: Math.atan2(to.lift - from.lift, Math.hypot(dx, dz)) };
}

// The splashes in the air at t: where a leaping fish left the water and
// where it came back, with their age. Leaps after until (the rider getting
// up) never land.
export function splashes(fish, t, until = Infinity) {
  const out = [];
  for (const at of fish.jumps) {
    for (const when of [at, at + JUMP]) {
      const age = t - when;
      if (when > until || age < 0 || age > SPLASH) continue;
      const { x, z } = fishSpot(fish, when);
      out.push({ x, z, age });
    }
  }
  return out;
}

// Droplet i of a splash's ring: thrown up and out, falling back and
// shrinking away as the splash ends.
export function droplet(i, count, age) {
  const angle = i / count * Math.PI * 2, out = 1.5 * age;
  return {
    x: Math.cos(angle) * out,
    y: (3.2 + .5 * (i % 2)) * age - 4.9 * age * age,
    z: Math.sin(angle) * out,
    size: .09 * Math.max(0, 1 - age / SPLASH),
  };
}

// The game's water height, j(x, z, time), with the venues mod's waves when
// that mod has added them.
const WATER_HEIGHT = /^function [\w$]+\(e,t,n\)\{return (?:[\w$]+\(e,t,n,)?[\w$]+\.reduce\(\(r,i\)=>r\+Math\.sin\(e\*i\.x\+t\*i\.z\+n\*i\.speed\)\*i\.amplitude,0\)\)?\}$/;
export const isWaterHeight = (value) => typeof value === "function" && WATER_HEIGHT.test(value.toString());
