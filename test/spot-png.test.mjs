// The tool's PNG codec: 8-bit grey, RGB, RGBA and palette images, all five
// row filters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { chunk, decodePng, encodePng } from "../tools/spot/png.mjs";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = (w, h, type) => { const b = Buffer.alloc(13); b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4); b[8] = 8; b[9] = type; return b; };
const png = (w, h, type, raw, extra = []) => Buffer.concat([SIGNATURE, chunk("IHDR", ihdr(w, h, type)), ...extra, chunk("IDAT", deflateSync(Buffer.from(raw))), chunk("IEND", Buffer.alloc(0))]);

test("an image comes back as it was encoded", () => {
  for (const channels of [1, 3, 4]) {
    const data = Uint8Array.from({ length: 5 * 3 * channels }, (_, i) => (i * 37) & 255);
    assert.deepEqual(decodePng(encodePng({ width: 5, height: 3, channels, data })), { width: 5, height: 3, channels, data });
  }
});

test("all five row filters are undone", () => {
  // A 2 × 2 grey image, rows [10, 20] and [30, 45], each row filtered differently.
  const rows = (f0, r0, f1, r1) => [f0, ...r0, f1, ...r1];
  const expect = Uint8Array.from([10, 20, 30, 45]);
  assert.deepEqual(decodePng(png(2, 2, 0, rows(0, [10, 20], 2, [20, 25]))).data, expect, "none, up");
  assert.deepEqual(decodePng(png(2, 2, 0, rows(1, [10, 10], 3, [25, 20]))).data, expect, "sub, average");
  // Paeth on the second row: for x0, a=0 b=10 c=0 → predictor b=10; for x1, a=30 b=20 c=10 → p=40, nearest a=30.
  assert.deepEqual(decodePng(png(2, 2, 0, rows(0, [10, 20], 4, [20, 15]))).data, expect, "paeth");
});

test("a palette image is expanded to RGB", () => {
  const plte = chunk("PLTE", Buffer.from([255, 0, 0, 0, 0, 255]));
  const out = decodePng(png(2, 1, 3, [0, 0, 1], [plte]));
  assert.deepEqual(out, { width: 2, height: 1, channels: 3, data: Uint8Array.from([255, 0, 0, 0, 0, 255]) });
});

test("unsupported images are refused with the reason", () => {
  assert.throws(() => decodePng(Buffer.from("nope")), /not a PNG/);
  const b = ihdr(1, 1, 0); b[8] = 16;
  assert.throws(() => decodePng(Buffer.concat([SIGNATURE, chunk("IHDR", b), chunk("IEND", Buffer.alloc(0))])), /bit depth 16/);
});
