// Raster helpers for the spot tool, in the game frame's conventions: height
// grids have points at -half + i·step, images have pixel centres at
// -half + (i + 0.5)·cell.

export const gridPoint = (i, j, half, step) => ({ x: -half + i * step, z: -half + j * step });
export const imagePoint = (i, j, half, size) => ({ x: -half + (i + 0.5) * (2 * half / size), z: -half + (j + 0.5) * (2 * half / size) });

// 1 where the pixel centre is inside the rings (even-odd, so holes and islands
// in lakes work), else 0. rings: [[x, z], ...] closed or not.
export function fillPolygons(rings, half, size) {
  const mask = new Uint8Array(size * size), cell = 2 * half / size;
  for (let j = 0; j < size; j++) {
    const z = -half + (j + 0.5) * cell, xs = [];
    for (const ring of rings) {
      for (let k = 0, n = ring.length; k < n; k++) {
        const [x1, z1] = ring[k], [x2, z2] = ring[(k + 1) % n];
        if ((z1 <= z) !== (z2 <= z)) xs.push(x1 + ((z - z1) / (z2 - z1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] + half) / cell - 0.5)), to = Math.min(size - 1, Math.floor((xs[k + 1] + half) / cell - 0.5));
      for (let i = from; i <= to; i++) mask[j * size + i] = 1;
    }
  }
  return mask;
}

// Felzenszwalb and Huttenlocher's exact Euclidean distance transform: for
// each cell, the distance in cells to the nearest cell where mask is 1.
export function distanceTransform(mask, width, height) {
  const INF = 1e20, f = new Float64Array(Math.max(width, height)), d = new Float64Array(width * height);
  for (let p = 0; p < d.length; p++) d[p] = mask[p] ? 0 : INF;
  const pass = (n, get, set) => {
    const v = new Int32Array(n), zz = new Float64Array(n + 1);
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF;
    for (let q = 1; q < n; q++) {
      let s;
      while ((s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= zz[k]) k--;
      k++; v[k] = q; zz[k] = s; zz[k + 1] = INF;
    }
    for (let q = 0, kk = 0; q < n; q++) {
      while (zz[kk + 1] < q) kk++;
      set(q, (q - v[kk]) ** 2 + f[v[kk]]);
    }
  };
  for (let i = 0; i < width; i++) pass(height, (q) => d[q * width + i], (q, value) => (d[q * width + i] = value));
  for (let j = 0; j < height; j++) pass(width, (q) => d[j * width + q], (q, value) => (d[j * width + q] = value));
  return Float32Array.from(d, Math.sqrt);
}

// The value at fractional pixel (u, v), pixel centres at integers, clamped.
export function bilinear(values, width, height, u, v, channels = 1, channel = 0) {
  const cu = Math.min(Math.max(u, 0), width - 1), cv = Math.min(Math.max(v, 0), height - 1);
  const i = Math.min(Math.floor(cu), width - 2), j = Math.min(Math.floor(cv), height - 2), fu = cu - i, fv = cv - j;
  const at = (a, b) => values[(b * width + a) * channels + channel];
  return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
}
