// Painted signs at a real-world spot: a restaurant's fascia, a banner on a
// lookout. Each is a plane, its picture drawn on a canvas by the site's
// draw(ctx, width, height), facing along its yaw (local +z turned to
// (sin yaw, cos yaw), as the sites place things). cutout: draw only where
// opaque, for a shaped board; doubleSided for a flag, seen from both sides;
// pitch tips it back, as on a roof. One draw call per sign. signs: [{ at:
// [x, y, z], yaw, pitch, width, height (metres), draw, cutout, doubleSided }].
import { CanvasTexture, DoubleSide, FrontSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from "../lib/three.core.min.js";

const PER_METRE = 64;
const LARGEST = 2048;

// The canvas size for a sign, keeping its shape.
export function signCanvasSize({ width, height }) {
  const scale = Math.min(PER_METRE, LARGEST / width, LARGEST / height);
  return [Math.round(width * scale), Math.round(height * scale)];
}

// Sets ctx.font for text at up to size pixels, smaller if that would run
// wider than maxWidth, so a sign's words always fit their board.
export function fitFont(ctx, text, maxWidth, size, family, prefix = "bold") {
  ctx.font = `${prefix} ${size}px ${family}`;
  const width = ctx.measureText?.(text)?.width;
  if (width > maxWidth) ctx.font = `${prefix} ${Math.floor((size * maxWidth) / width)}px ${family}`;
}

const browserCanvas = () => (typeof document === "undefined" ? null : document.createElement("canvas"));

export function buildSigns(signs, { createCanvas = browserCanvas } = {}) {
  const group = new Group();
  group.name = "signs";
  for (const sign of signs) {
    const canvas = createCanvas();
    if (!canvas) break;
    [canvas.width, canvas.height] = signCanvasSize(sign);
    sign.draw(canvas.getContext("2d"), canvas.width, canvas.height);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 8;
    const material = new MeshStandardMaterial({ map, roughness: 0.75, metalness: 0, side: sign.doubleSided ? DoubleSide : FrontSide, alphaTest: sign.cutout ? 0.5 : 0, transparent: false });
    const mesh = new Mesh(new PlaneGeometry(sign.width, sign.height), material);
    mesh.position.set(...sign.at);
    mesh.rotation.set(sign.pitch ?? 0, sign.yaw, 0, "YXZ");
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}
