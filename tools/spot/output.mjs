// The tool's checks and side outputs: the course must lie in sailable water,
// a comparison image of the built features over the satellite colour, the
// chooser's picture, and the credits.
import { bilinear } from "./raster.mjs";
import { DEPTH_MAX } from "./depth.mjs";

// Half-extents of the water the course and the AI's overshoot need.
export const COURSE = { x: 110, z: 210 + 43 };
const MIN_DEPTH = 0.5;

// One line per depth pixel inside the course box shallower than MIN_DEPTH.
export function courseProblems(depth, half) {
  const cell = 2 * half / depth.width, problems = [];
  for (let j = 0; j < depth.height; j++) for (let i = 0; i < depth.width; i++) {
    const x = -half + (i + 0.5) * cell, z = -half + (j + 0.5) * cell;
    if (Math.abs(x) > COURSE.x + cell / 2 || Math.abs(z) > COURSE.z + cell / 2) continue;
    const metres = (depth.data[j * depth.width + i] / 255) * DEPTH_MAX;
    if (metres < MIN_DEPTH) problems.push(`at x ${Math.round(x)}, z ${Math.round(z)}: ${metres.toFixed(1)} m deep`);
  }
  return problems;
}

// Draws polylines ([[x, z], ...] in the game frame) into an RGB image of the
// square [-half, half]².
export function drawLines(image, half, lines, [r, g, b]) {
  const scale = image.width / (2 * half), plot = (i, j) => {
    if (i < 0 || j < 0 || i >= image.width || j >= image.height) return;
    image.data.set([r, g, b], (j * image.width + i) * 3);
  };
  for (const line of lines) for (let k = 0; k + 1 < line.length; k++) {
    const [x1, z1] = line[k], [x2, z2] = line[k + 1];
    const a = [(x1 + half) * scale - 0.5, (z1 + half) * scale - 0.5], b2 = [(x2 + half) * scale - 0.5, (z2 + half) * scale - 0.5];
    const steps = Math.max(1, Math.ceil(Math.hypot(b2[0] - a[0], b2[1] - a[1])));
    for (let s = 0; s <= steps; s++) plot(Math.round(a[0] + ((b2[0] - a[0]) * s) / steps), Math.round(a[1] + ((b2[1] - a[1]) * s) / steps));
  }
  return image;
}

// 384 × 256 of the colour image around the course: 1200 m along the wind
// (x, left to right) by 800 m across it (z).
export function picture(colour, half) {
  const width = 384, height = 256, data = new Uint8Array(width * height * 3), scale = colour.width / (2 * half);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const x = -600 + (i + 0.5) * (1200 / width), z = -400 + (j + 0.5) * (800 / height);
    for (let c = 0; c < 3; c++) data[(j * width + i) * 3 + c] = Math.round(bilinear(colour.data, colour.width, colour.height, (x + half) * scale - 0.5, (z + half) * scale - 0.5, 3, c));
  }
  return { width, height, channels: 3, data };
}

export function credits(spot) {
  return `# ${spot.name}: data credits\n\n${spot.sources.map((s) => `- **${s.name}** (${s.licence}): ${s.credit}. ${s.url}`).join("\n")}\n`;
}
