// Seabed depth from colour, for clear shallow water over a bright bottom: the
// log-ratio method (Stumpf, Holderied and Sinclair 2003), ln(n·blue) over
// ln(n·green) rising about linearly with depth, fitted to a spot's
// calibration points. Visual only: the game never reads the depth.
export const DEPTH_MAX = 20;
const N = 1000;

export const logRatio = (r, g, b) => Math.log(N * Math.max(b, 1) / 255) / Math.log(N * Math.max(g, 1) / 255);

// samples: [{ ratio, depth }], at least two different depths. A least-squares
// line, clamped to 0..DEPTH_MAX.
export function fitDepth(samples) {
  if (new Set(samples.map((s) => s.depth)).size < 2) throw new Error("the depth fit needs at least two calibration depths");
  const n = samples.length, mx = samples.reduce((a, s) => a + s.ratio, 0) / n, my = samples.reduce((a, s) => a + s.depth, 0) / n;
  const slope = samples.reduce((a, s) => a + (s.ratio - mx) * (s.depth - my), 0) / samples.reduce((a, s) => a + (s.ratio - mx) ** 2, 0);
  const fit = (ratio) => Math.min(DEPTH_MAX, Math.max(0, my + slope * (ratio - mx)));
  return Object.assign(fit, { slope, intercept: my - slope * mx });
}

// A one-channel image: 0 on land, else depth scaled to 0..255.
export function depthImage(colour, land, depthOf) {
  const data = new Uint8Array(colour.width * colour.height);
  for (let p = 0; p < data.length; p++) {
    if (land[p]) continue;
    const [r, g, b] = colour.data.subarray(p * 3, p * 3 + 3);
    data[p] = Math.round((depthOf(logRatio(r, g, b)) / DEPTH_MAX) * 255);
  }
  return { width: colour.width, height: colour.height, channels: 1, data };
}
