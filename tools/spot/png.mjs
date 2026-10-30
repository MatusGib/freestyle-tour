// 8-bit PNG decoding and encoding for the spot tool, on node:zlib alone:
// grey, RGB, RGBA and palette images, not interlaced.
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const COLOUR_TYPE = { 1: 0, 2: 4, 3: 2, 4: 6 };
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export function chunk(kind, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(kind, 4, "latin1");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// { width, height, channels, data: Uint8Array } (palette images come back RGB).
export function decodePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let width, height, depth, type, interlace, palette = null;
  const idat = [];
  for (let at = 8; at < buffer.length;) {
    const length = buffer.readUInt32BE(at);
    const kind = buffer.toString("latin1", at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (kind === "IHDR") [width, height, depth, type, interlace] = [body.readUInt32BE(0), body.readUInt32BE(4), body[8], body[9], body[12]];
    else if (kind === "PLTE") palette = body;
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    at += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || !(type in CHANNELS)) throw new Error(`unsupported PNG: bit depth ${depth}, colour type ${type}, interlace ${interlace}`);
  const bpp = CHANNELS[type], stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[row + i - bpp] : 0, b = y ? out[row - stride + i] : 0, c = i >= bpp && y ? out[row - stride + i - bpp] : 0;
      const x = raw[src + i];
      const v = filter === 0 ? x : filter === 1 ? x + a : filter === 2 ? x + b : filter === 3 ? x + ((a + b) >> 1) : filter === 4 ? x + paeth(a, b, c) : NaN;
      if (Number.isNaN(v)) throw new Error(`bad PNG filter ${filter}`);
      out[row + i] = v & 255;
    }
  }
  if (type !== 3) return { width, height, channels: bpp, data: out };
  const rgb = new Uint8Array(width * height * 3);
  for (let p = 0; p < out.length; p++) rgb.set(palette.subarray(out[p] * 3, out[p] * 3 + 3), p * 3);
  return { width, height, channels: 3, data: rgb };
}

export function encodePng({ width, height, channels, data }) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = COLOUR_TYPE[channels];
  const stride = width * channels, raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk("IHDR", head), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
