// Where a real-world spot's plants go, the same on every visit: for each
// kind, a grid of cells sized for its density over ±half, one jittered point
// per cell, kept where the ground is one of the kind's, and as often as its
// density(spot, x, z) says (0–1) where it has one. rules: { kind: { ground:
// [codes], perHectare, density } }; spot: groundAt and heightAt. Returns
// { kind: [{ x, y, z, scale, yaw, variant }] }.
import { seeded } from "../props.js";

export function scatter(spot, rules, { half, seed = 1 }) {
  const placed = {};
  Object.entries(rules).forEach(([kind, { ground, perHectare, density }], k) => {
    const random = seeded(seed * 7919 + k * 104729), cell = Math.sqrt(10000 / perHectare), n = Math.floor((2 * half) / cell), points = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -half + (i + random()) * cell, z = -half + (j + random()) * cell;
      const scale = 0.7 + 0.6 * random(), yaw = random() * Math.PI * 2, variant = Math.floor(random() * 4);
      if (ground.includes(spot.groundAt(x, z)) && (!density || random() < density(spot, x, z))) points.push({ x, y: spot.heightAt(x, z), z, scale, yaw, variant });
    }
    placed[kind] = points;
  });
  return placed;
}
