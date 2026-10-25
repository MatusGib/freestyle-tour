// The Champion's challenge prize, the Red Bull helmet: its logo drawn on a
// canvas, the 3D parts the game's rider gets (through patches.mjs, which
// imports this module into the game), and a picture of it for the mod's
// screens. Browser only.

export const HELMET = "redbull";
export const WON_KEY = "freestyle-tour.champion-helmet";
export const NAVY = 0x13244b;
const SILVER = 0xc9ced6;
const RED = "#d8102c";
const YELLOW = "#fdc82f";

// Whether the Champion's challenge has been won in this browser: the look
// editor lists the helmet only then.
export function helmetWon() {
  try {
    return localStorage.getItem(WON_KEY) === "true";
  } catch {
    return false;
  }
}

// A charging bull facing right, in a 1 × 0.66 box.
function bull(ctx) {
  ctx.beginPath();
  ctx.moveTo(0.06, 0.26);
  ctx.bezierCurveTo(0.2, 0.16, 0.42, 0.12, 0.56, 0.1);
  ctx.bezierCurveTo(0.66, 0.08, 0.74, 0.16, 0.8, 0.26);
  ctx.lineTo(0.93, 0.1);
  ctx.lineTo(0.88, 0.27);
  ctx.bezierCurveTo(0.95, 0.33, 1, 0.42, 0.97, 0.48);
  ctx.lineTo(0.88, 0.5);
  ctx.lineTo(0.8, 0.47);
  ctx.lineTo(0.94, 0.62);
  ctx.lineTo(0.88, 0.65);
  ctx.lineTo(0.7, 0.5);
  ctx.bezierCurveTo(0.58, 0.53, 0.44, 0.53, 0.33, 0.5);
  ctx.lineTo(0.08, 0.64);
  ctx.lineTo(0.04, 0.6);
  ctx.lineTo(0.2, 0.44);
  ctx.bezierCurveTo(0.12, 0.4, 0.08, 0.34, 0.06, 0.3);
  ctx.lineTo(0, 0.42);
  ctx.lineTo(0.02, 0.28);
  ctx.closePath();
  ctx.fill();
}

// The logo centred at (cx, cy), size wide: two red bulls charging at a yellow
// sun, with the name under them unless name is false.
export function drawLogo(ctx, cx, cy, size, { name = true } = {}) {
  const bullSize = size * 0.5;
  const top = cy - size * (name ? 0.24 : 0.16);
  ctx.save();
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.arc(cx, top + size * 0.14, size * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RED;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(cx - side * size * 0.04, top);
    ctx.scale(-side * bullSize, bullSize);
    bull(ctx);
    ctx.restore();
  }
  if (name) {
    ctx.font = `italic 900 ${Math.round(size * 0.2)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Red Bull", cx, top + size * 0.36);
  }
  ctx.restore();
}

// The canvas for the helmet's front: the logo on a transparent background.
function logoCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  drawLogo(canvas.getContext("2d"), 256, 166, 440);
  return canvas;
}

// The game's water helmet shell is a sphere cap pushed up at the front; the
// logo goes on a slightly larger patch of the same shape so it sits on it.
function shaped(geometry) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    position.setY(i, y + (0.32 * Math.max(0, position.getZ(i)) * (1 - y)) / 1.22);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Adds the visor and the logo to the game's helmet group (whose shell the game
// has already drawn in NAVY). three: the game's own 3D classes, passed in by
// the patch.
export function addHelmetParts(group, { Mesh, SphereGeometry, Material, CanvasTexture }) {
  const visor = new Mesh(new SphereGeometry(1, 20, 10), new Material({ color: SILVER, roughness: 0.25, metalness: 0.6 }));
  visor.name = "Helmet visor";
  visor.position.set(0, 0.095, 0.163);
  visor.scale.set(0.208, 0.018, 0.11);
  group.add(visor);
  const texture = new CanvasTexture(logoCanvas());
  texture.colorSpace = "srgb";
  const width = 1.7;
  const logo = new Mesh(
    shaped(new SphereGeometry(1.012, 32, 16, Math.PI / 2 - width / 2, width, 0.55, 0.78)),
    new Material({ map: texture, transparent: true, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  logo.name = "Helmet logo";
  logo.position.set(0, 0.067, -0.024);
  logo.scale.set(0.213, 0.229, 0.203);
  group.add(logo);
}

// A picture of the helmet, seen from the front, on the given canvas.
export function drawHelmetPicture(canvas) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const navy = `#${NAVY.toString(16).padStart(6, "0")}`;
  const gradient = ctx.createRadialGradient(w * 0.4, h * 0.3, w * 0.05, w * 0.5, h * 0.5, w * 0.55);
  gradient.addColorStop(0, "#2d4a8a");
  gradient.addColorStop(1, navy);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.78);
  ctx.bezierCurveTo(w * 0.06, h * 0.2, w * 0.3, h * 0.06, w * 0.5, h * 0.06);
  ctx.bezierCurveTo(w * 0.7, h * 0.06, w * 0.94, h * 0.2, w * 0.9, h * 0.78);
  ctx.quadraticCurveTo(w * 0.5, h * 0.9, w * 0.1, h * 0.78);
  ctx.fill();
  ctx.fillStyle = "#c9ced6";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.74, w * 0.36, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  drawLogo(ctx, w * 0.5, h * 0.4, w * 0.52);
}
