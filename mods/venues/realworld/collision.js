// Stops the rider at a real-world spot's shore: inside land, the rider goes
// back towards the water along the land's slope, loses the speed that carried
// them in, and can't drive further in. spot.isLand(x, z) from loadSpot.
const PROBE = 2; // metres
const REACH = 60; // metres the nearest water is searched for

const landNormal = (spot, x, z) => {
  const gx = (spot.isLand(x + PROBE, z) ? 1 : 0) - (spot.isLand(x - PROBE, z) ? 1 : 0);
  const gz = (spot.isLand(x, z + PROBE) ? 1 : 0) - (spot.isLand(x, z - PROBE) ? 1 : 0);
  const length = Math.hypot(gx, gz);
  return length ? { x: gx / length, z: gz / length } : null;
};

// Too deep in for the edge to show: the way into the land from the nearest
// water, searched in rings around the rider.
function fromNearestWater(spot, x, z) {
  for (let r = PROBE; r <= REACH; r += PROBE) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (!spot.isLand(x + Math.cos(a) * r, z + Math.sin(a) * r)) return { x: -Math.cos(a), z: -Math.sin(a) };
    }
  }
  return null;
}

export function resolveSpotCollision(state, input, spot) {
  if (!state || !spot || !spot.isLand(state.x, state.z)) return;
  const n = landNormal(spot, state.x, state.z) ?? fromNearestWater(spot, state.x, state.z);
  if (!n) return;
  for (let step = 0; step < (REACH + PROBE) * 4 && spot.isLand(state.x, state.z); step++) {
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
