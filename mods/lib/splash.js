// A small splash where an animal leaves or enters the water: a ring of
// droplets. Pure, shared with the tests.

export const SPLASH = .7; // a splash's droplets in the air

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
