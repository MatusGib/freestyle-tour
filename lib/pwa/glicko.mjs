// Glicko-2 (Glickman, "Example of the Glicko-2 system", 2012), with weighted
// games. A rider is { rating, rd, volatility } on the usual 1500 scale.

const SCALE = 173.7178;
export const MAX_RD = 350;
const EPSILON = 0.000001;

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu, muj, phij) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));
const toMu = (rating) => (rating - 1500) / SCALE;

export const newRider = (rating) => ({ rating, rd: MAX_RD, volatility: 0.06 });

// The rider after one rating period. games: [{ opponent, score, weight }],
// with the opponent's rating going into the period and score 1, 0.5 or 0.
// With no games only the deviation grows.
export function ratePeriod(rider, games, tau) {
  const mu = toMu(rider.rating);
  const phi = rider.rd / SCALE;
  const sigma = rider.volatility;
  if (!games.length) return { ...rider, rd: Math.min(MAX_RD, Math.sqrt(phi * phi + sigma * sigma) * SCALE) };

  let vInverse = 0;
  let sum = 0;
  for (const { opponent, score, weight = 1 } of games) {
    const muj = toMu(opponent.rating);
    const phij = opponent.rd / SCALE;
    const e = expected(mu, muj, phij);
    vInverse += weight * g(phij) ** 2 * e * (1 - e);
    sum += weight * g(phij) * (score - e);
  }
  const v = 1 / vInverse;
  const delta = v * sum;

  // The new volatility, by the Illinois algorithm (step 5 of the paper).
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const volatility = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + volatility * volatility);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return { rating: 1500 + SCALE * muNew, rd: Math.min(MAX_RD, SCALE * phiNew), volatility };
}

// The chance that a beats b, counting both riders' deviations.
export function winChance(a, b) {
  const phi = Math.hypot(a.rd, b.rd) / SCALE;
  return 1 / (1 + Math.exp(-g(phi) * (toMu(a.rating) - toMu(b.rating))));
}
