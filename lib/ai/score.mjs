// What a rider scores on the game's scale, from their Glicko-2 rating going
// into an event. Glicko's win chance is close to a normal curve with a scale
// of 295.6 rating points, so heat scores spread SPREAD points around an average
// that moves SPREAD·√2/295.6 points per rating point give the same win chances.

export const ANCHOR = { rating: 1965, score: 42 }; // the top 5% of men's ratings average 42
export const SPREAD = 6;
export const SLOPE = (SPREAD * Math.SQRT2) / 295.6;
export const FLOOR = 22; // the planner can't aim lower
export const CEILING = 50;

export const averageScore = (rating) => ANCHOR.score + (rating - ANCHOR.rating) * SLOPE;

// A 32-bit seed from any parts (FNV-1a), so a challenge always gets the same draw.
export function seedOf(...parts) {
  let hash = 0x811c9dc5;
  for (const char of parts.join("|")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// Mulberry32: numbers in [0, 1) from a seed.
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The score a rider aims for in one heat: their average plus a normal draw
// with spread SPREAD, clipped to FLOOR–CEILING.
export function heatTarget(rating, seed) {
  const next = generator(seed);
  const z = Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  return Math.min(CEILING, Math.max(FLOOR, averageScore(rating) + SPREAD * z));
}

// The standard normal distribution function (Abramowitz and Stegun 7.1.26).
function normal(x) {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// The model's chance that a rider rated ra outscores one rated rb.
export const winChance = (ra, rb) => normal((averageScore(ra) - averageScore(rb)) / (SPREAD * Math.SQRT2));
