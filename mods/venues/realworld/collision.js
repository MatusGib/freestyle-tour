// Stops the rider at a real-world spot's shore: the board and rig reach
// CLEARANCE metres round the rider, so the rider is held that far off the
// land, its nose never in the sand. Where land is within reach, the rider is
// moved straight away from it until clear, loses the speed that carried them
// in, keeps the speed along the shore, and can't drive further in. Deep
// inside land the nearest water is searched for. spot.isLand(x, z) from
// loadSpot.
export const CLEARANCE = 3; // metres
const PROBES = 16;
const REACH = 60; // metres the nearest water is searched for

// The way into the land from (x, z): the mean of the directions round the
// rider, CLEARANCE out, that end on land; null when none does.
function towardLand(spot, x, z) {
  let gx = 0, gz = 0;
  for (let k = 0; k < PROBES; k++) {
    const a = (k / PROBES) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
    if (spot.isLand(x + cx * CLEARANCE, z + cz * CLEARANCE)) { gx += cx; gz += cz; }
  }
  // Land all round sums to nothing: no way out shows from here.
  const length = Math.hypot(gx, gz);
  return length > 0.5 ? { x: gx / length, z: gz / length } : null;
}

const clear = (spot, x, z) => !spot.isLand(x, z) && !towardLand(spot, x, z);

// Too deep in for the edge to show: the way into the land from the nearest
// water, searched in rings around the rider.
function fromNearestWater(spot, x, z) {
  for (let r = 2; r <= REACH; r += 2) {
    for (let k = 0; k < PROBES; k++) {
      const a = (k / PROBES) * Math.PI * 2;
      if (!spot.isLand(x + Math.cos(a) * r, z + Math.sin(a) * r)) return { x: -Math.cos(a), z: -Math.sin(a) };
    }
  }
  return null;
}

export function resolveSpotCollision(state, input, spot) {
  if (!state || !spot || clear(spot, state.x, state.z)) return;
  const n = towardLand(spot, state.x, state.z) ?? fromNearestWater(spot, state.x, state.z);
  if (!n) return;
  for (let step = 0; step < (REACH + CLEARANCE) * 4 && !clear(spot, state.x, state.z); step++) {
    state.x -= n.x * 0.25;
    state.z -= n.z * 0.25;
  }
  const into = state.vx * n.x + state.vz * n.z;
  if (into > 0) {
    state.vx -= into * n.x;
    state.vz -= into * n.z;
    state.speed = Math.hypot(state.vx, state.vz);
  }
  // The heading as the game steers it: forward is (sin, -cos).
  const forward = Math.sin(state.heading) * n.x - Math.cos(state.heading) * n.z;
  if (input && forward > 0 && input.power > 0) input.power = 0;
}
