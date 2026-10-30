// Baseline JPEG decoding for the spot tool, no dependencies: EOX's WMS answers
// with JPEG whatever format is asked for. Sequential Huffman, 8-bit, grey or
// YCbCr with any sampling, restart intervals; chroma is upsampled
// bilinearly, like libjpeg's smooth upsampling. Progressive files are refused.
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
// COS[x][u]: the weight of frequency u at sample x of an 8-point inverse DCT.
const COS = Array.from({ length: 8 }, (_, x) => Array.from({ length: 8 }, (_, u) => ((u === 0 ? Math.SQRT1_2 : 1) * Math.cos(((2 * x + 1) * u * Math.PI) / 16)) / 2));

function huffman(counts, symbols) {
  const maxcode = new Int32Array(17).fill(-1), mincode = new Int32Array(17), valptr = new Int32Array(17);
  for (let length = 1, code = 0, k = 0; length <= 16; length++) {
    valptr[length] = k; mincode[length] = code;
    code += counts[length - 1]; k += counts[length - 1];
    if (counts[length - 1]) maxcode[length] = code - 1;
    code <<= 1;
  }
  return { maxcode, mincode, valptr, symbols };
}

// { width, height, channels, data: Uint8Array }: 1 channel for grey, else RGB.
export function decodeJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error("not a JPEG");
  const quant = [], dc = [], ac = [];
  let frame = null, restart = 0, at = 2;
  while (at < buffer.length) {
    if (buffer[at] !== 0xff) { at++; continue; }
    const marker = buffer[at + 1];
    if (marker === 0xff) { at++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x00) { at += 2; continue; }
    if (marker === 0xd9) break;
    const length = buffer.readUInt16BE(at + 2), body = buffer.subarray(at + 4, at + 2 + length);
    at += 2 + length;
    if (marker === 0xdb) {
      for (let p = 0; p < body.length;) {
        const wide = body[p] >> 4, id = body[p] & 15, table = new Int32Array(64);
        for (let k = 0; k < 64; k++) table[k] = wide ? body.readUInt16BE(p + 1 + 2 * k) : body[p + 1 + k];
        quant[id] = table; p += 1 + (wide ? 128 : 64);
      }
    } else if (marker === 0xc4) {
      for (let p = 0; p < body.length;) {
        const counts = body.subarray(p + 1, p + 17), total = counts.reduce((a, b) => a + b, 0);
        (body[p] >> 4 ? ac : dc)[body[p] & 15] = huffman(counts, body.subarray(p + 17, p + 17 + total));
        p += 17 + total;
      }
    } else if (marker === 0xdd) restart = body.readUInt16BE(0);
    else if (marker === 0xc0 || marker === 0xc1) {
      frame = { height: body.readUInt16BE(1), width: body.readUInt16BE(3), components: [] };
      for (let c = 0; c < body[5]; c++) frame.components.push({ id: body[6 + 3 * c], h: body[7 + 3 * c] >> 4, v: body[7 + 3 * c] & 15, q: body[8 + 3 * c] });
    } else if (marker >= 0xc2 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      throw new Error(`unsupported JPEG: ${marker === 0xc2 ? "progressive" : "not baseline"} (marker ${marker.toString(16)})`);
    } else if (marker === 0xda) {
      if (!frame) throw new Error("JPEG scan before its frame");
      if (body[0] !== frame.components.length) throw new Error("unsupported JPEG: scans that do not hold every component");
      const scan = [];
      for (let c = 0; c < body[0]; c++) scan.push({ ...frame.components.find((f) => f.id === body[1 + 2 * c]), dc: dc[body[2 + 2 * c] >> 4], ac: ac[body[2 + 2 * c] & 15] });
      return finish(frame, scan, quant, buffer, at, restart);
    }
  }
  throw new Error("JPEG without a scan");
}

function finish(frame, scan, quant, buffer, start, restart) {
  const hmax = Math.max(...scan.map((c) => c.h)), vmax = Math.max(...scan.map((c) => c.v));
  const mcusX = Math.ceil(frame.width / (8 * hmax)), mcusY = Math.ceil(frame.height / (8 * vmax));
  for (const c of scan) { c.stride = mcusX * c.h * 8; c.plane = new Uint8Array(c.stride * mcusY * c.v * 8); c.pred = 0; }

  let pos = start, bits = 0, count = 0;
  const bit = () => {
    if (!count) {
      const byte = buffer[pos];
      if (byte === 0xff && buffer[pos + 1] !== 0) bits = 0; // a marker: feed zeros
      else { bits = byte ?? 0; pos += byte === 0xff ? 2 : 1; }
      count = 8;
    }
    count--;
    return (bits >> count) & 1;
  };
  const receive = (n) => { let v = 0; while (n--) v = (v << 1) | bit(); return v; };
  const extend = (v, n) => (v < 1 << (n - 1) ? v - (1 << n) + 1 : v);
  const symbol = (t) => {
    for (let length = 1, code = 0; length <= 16; length++) {
      code = (code << 1) | bit();
      if (t.maxcode[length] >= 0 && code <= t.maxcode[length]) return t.symbols[t.valptr[length] + code - t.mincode[length]];
    }
    throw new Error("bad JPEG Huffman code");
  };

  const block = new Float64Array(64), tmp = new Float64Array(64);
  const decodeBlock = (c, bx, by) => {
    const q = quant[c.q];
    block.fill(0);
    const size = symbol(c.dc);
    c.pred += size ? extend(receive(size), size) : 0;
    block[0] = c.pred * q[0];
    for (let k = 1; k < 64;) {
      const rs = symbol(c.ac), s = rs & 15, r = rs >> 4;
      if (!s) { if (r === 15) { k += 16; continue; } break; }
      k += r;
      if (k > 63) break;
      block[ZIGZAG[k]] = extend(receive(s), s) * q[k];
      k++;
    }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { // rows
      let sum = 0;
      for (let u = 0; u < 8; u++) sum += COS[x][u] * block[y * 8 + u];
      tmp[y * 8 + x] = sum;
    }
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { // columns
      let sum = 0;
      for (let v = 0; v < 8; v++) sum += COS[y][v] * tmp[v * 8 + x];
      c.plane[(by * 8 + y) * c.stride + bx * 8 + x] = Math.min(255, Math.max(0, Math.round(sum + 128)));
    }
  };

  for (let m = 0; m < mcusX * mcusY; m++) {
    if (restart && m && m % restart === 0) { // byte-align and skip the RSTn marker
      count = 0;
      while (pos < buffer.length && !(buffer[pos] === 0xff && buffer[pos + 1] >= 0xd0 && buffer[pos + 1] <= 0xd7)) pos++;
      pos += 2;
      for (const c of scan) c.pred = 0;
    }
    const mx = m % mcusX, my = Math.floor(m / mcusX);
    for (const c of scan) for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) decodeBlock(c, mx * c.h + h, my * c.v + v);
  }

  const { width, height } = frame, channels = scan.length === 1 ? 1 : 3, data = new Uint8Array(width * height * channels);
  // A component's value at full-resolution pixel (x, y): bilinear between the
  // centres of its (coarser) samples, clamped to the ones that exist.
  const sample = (c, x, y) => {
    const sx = Math.min(Math.max(((x + 0.5) * c.h) / hmax - 0.5, 0), Math.ceil((width * c.h) / hmax) - 1);
    const sy = Math.min(Math.max(((y + 0.5) * c.v) / vmax - 0.5, 0), Math.ceil((height * c.v) / vmax) - 1);
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(x0 + 1, Math.ceil((width * c.h) / hmax) - 1), y1 = Math.min(y0 + 1, Math.ceil((height * c.v) / vmax) - 1), fx = sx - x0, fy = sy - y0;
    const at = (a, b) => c.plane[b * c.stride + a];
    return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
  };
  const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const s = scan.map((c) => sample(c, x, y)), o = (y * width + x) * channels;
    if (channels === 1) data[o] = clamp(s[0]);
    else {
      const [Y, cb, cr] = [s[0], s[1] - 128, s[2] - 128];
      data[o] = clamp(Y + 1.402 * cr); data[o + 1] = clamp(Y - 0.344136 * cb - 0.714136 * cr); data[o + 2] = clamp(Y + 1.772 * cb);
    }
  }
  return { width, height, channels, data };
}
