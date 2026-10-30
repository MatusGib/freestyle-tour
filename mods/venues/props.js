// Beach props built with three.js's own geometry (lib/three.core.min.js, the
// r185 the game runs) and baked into scenery.js's batches: event tents and
// flags, rigged sails and boards on the sand, spectators, palms, bushes and
// tall buildings. kit.point(s, d, y) places a point on the coast (s along the
// shore, d inland, y up); kit.add(positions, indices, colour, options) adds a
// mesh to the batch for its material. Geometry here is local: x along the
// shore, y up, z inland.
import {
  BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Euler, IcosahedronGeometry, Matrix4,
  Quaternion, Shape, ShapeGeometry, SphereGeometry, Vector3,
} from "./lib/three.core.min.js";

const matrix = new Matrix4(), rotation = new Quaternion(), euler = new Euler(), at = new Vector3(), size = new Vector3();

// Bakes geometry, turned (yaw about the vertical, then pitch and roll), scaled
// and moved to (s, d, y), into the batch for colour.
export function addShape(kit, geometry, colour, s, d, y, { yaw = 0, pitch = 0, roll = 0, scale = [1, 1, 1], uvScale = null, options = {} } = {}) {
  matrix.compose(at.set(s, y, d), rotation.setFromEuler(euler.set(pitch, yaw, roll, "YXZ")), size.set(...scale));
  const position = geometry.getAttribute("position");
  const positions = [];
  for (let i = 0; i < position.count; i++) {
    at.fromBufferAttribute(position, i).applyMatrix4(matrix);
    positions.push(...kit.point(at.x, at.z, at.y));
  }
  const indices = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: position.count }, (_, i) => i);
  const uv = geometry.getAttribute("uv");
  const uvs = uvScale && uv ? Array.from({ length: uv.count * 2 }, (_, i) => uv.array[i] * uvScale[i % 2]) : undefined;
  kit.add(positions, indices, colour, uvs ? { ...options, uvs } : options);
  geometry.dispose();
}

// A seeded random number generator, so every visit builds the same beach.
export function seeded(seed) {
  let value = seed % 2147483647 || 1;
  return () => ((value = (value * 16807) % 2147483647) - 1) / 2147483646;
}

// A white event pagoda: a square tent with a pointed roof and a coloured
// valance, as at every PWA beach village.
export function addPagoda(kit, s, d, y, { width = 5, trim = "#d23c3c", yaw = 0 } = {}) {
  addShape(kit, new BoxGeometry(width, 2.3, width), "#f4f2ec", s, d, y + 1.15, { yaw });
  addShape(kit, new BoxGeometry(width + .08, .35, width + .08), trim, s, d, y + 2.12, { yaw });
  addShape(kit, new ConeGeometry(width * .72, width * .42, 4, 1), "#fbfaf6", s, d, y + 2.3 + width * .21, { yaw: yaw + Math.PI / 4 });
}

// A sponsor's feather flag streaming downwind from its pole. windYaw turns
// the flag's local +x onto the wind.
export function addFeatherFlag(kit, s, d, y, colour, windYaw, height = 3.6) {
  addShape(kit, new CylinderGeometry(.025, .035, height + .4, 6), "#3b3b3b", s, d, y + (height + .4) / 2);
  const flag = new Shape();
  flag.moveTo(0, .35);
  flag.lineTo(0, height);
  flag.quadraticCurveTo(.95, height + .05, .9, height * .62);
  flag.quadraticCurveTo(.82, height * .2, .25, .35);
  flag.lineTo(0, .35);
  addShape(kit, new ShapeGeometry(flag, 6), colour, s, d, y, { yaw: windYaw + .12 });
}

const SAIL_COLOURS = ["#e8412d", "#f2c230", "#1d9bd1", "#20262e", "#e9ecef", "#ff7a1a", "#2ab673", "#c2185b"];

// A rigged freestyle sail lying on the sand, its mast upwind, with its board
// beside it; the window is the sail's clear monofilm panel.
export function addRig(kit, s, d, y, random, windYaw) {
  const colour = SAIL_COLOURS[Math.floor(random() * SAIL_COLOURS.length)];
  const second = SAIL_COLOURS[Math.floor(random() * SAIL_COLOURS.length)];
  const sail = new Shape();
  sail.moveTo(0, 0);
  sail.lineTo(0, 4.4);
  sail.quadraticCurveTo(1.55, 3.1, 2.05, 1.25);
  sail.quadraticCurveTo(1, .15, 0, 0);
  const lie = { yaw: windYaw + Math.PI / 2 + (random() - .5) * .6, pitch: -Math.PI / 2 + .14 + random() * .12 };
  addShape(kit, new ShapeGeometry(sail, 8), colour, s, d, y + .12, lie);
  const panel = new Shape();
  panel.moveTo(.15, 2.2);
  panel.lineTo(.15, 3.6);
  panel.quadraticCurveTo(1, 2.8, 1.3, 1.9);
  panel.lineTo(.15, 2.2);
  addShape(kit, new ShapeGeometry(panel, 4), second, s, d, y + .16, lie);
  addShape(kit, new CylinderGeometry(.025, .025, 4.6, 5).translate(0, 2.3, 0), "#2b2b2b", s, d, y + .14, lie);
  const board = (random() - .5) * 2;
  addShape(kit, new CapsuleGeometry(.3, 1.6, 3, 8), random() < .5 ? "#f5f5f0" : colour, s + 2.6 + board, d + 1.2, y + .08, {
    yaw: windYaw + (random() - .5) * .4, roll: Math.PI / 2, scale: [.22, 1, 1],
  });
}

const SHIRTS = ["#e94b3c", "#2d6cdf", "#f5f5f0", "#20262e", "#f2c230", "#3aa76d", "#ff8fab", "#7a5cfa"];
const SKIN = ["#e9c2a0", "#c99876", "#8d5a3b", "#f1d3b8"];

// A spectator, about 1.75 m tall.
export function addPerson(kit, s, d, y, random) {
  const shirt = SHIRTS[Math.floor(random() * SHIRTS.length)];
  const tall = .9 + random() * .2;
  addShape(kit, new CapsuleGeometry(.2, .9, 2, 6), shirt, s, d, y + .65 * tall, { scale: [1, tall, .8] });
  addShape(kit, new SphereGeometry(.13, 6, 4), SKIN[Math.floor(random() * SKIN.length)], s, d, y + 1.45 * tall);
}

// A canary palm, its trunk leaning and its fronds drooping.
export function addPalm(kit, s, d, y, random) {
  const height = 6 + random() * 3;
  const lean = (random() - .5) * .25;
  addShape(kit, new CylinderGeometry(.16, .26, height, 7), "#8b7255", s, d, y + height / 2, { roll: lean });
  const top = [s - Math.sin(lean) * height / 2, y + height / 2 + Math.cos(lean) * height / 2];
  for (let i = 0; i < 10; i++) {
    const leaf = new Shape();
    leaf.moveTo(0, 0);
    leaf.quadraticCurveTo(1.6, .35, 3.2, 0);
    leaf.quadraticCurveTo(1.6, -.15, 0, 0);
    // Lay the blade flat, then droop it and turn it around the crown.
    addShape(kit, new ShapeGeometry(leaf, 4).rotateX(Math.PI / 2), i % 3 ? "#4f7d3a" : "#62914a", top[0], d, top[1], {
      yaw: i / 10 * Math.PI * 2 + random() * .3, roll: -.45 - random() * .5,
    });
  }
}

// A low, wind-shaped bush of the dunes.
export function addBush(kit, s, d, y, random, colour) {
  const r = .5 + random() * .9;
  addShape(kit, new IcosahedronGeometry(r, 0), colour, s, d, y + r * .25, { yaw: random() * 6, scale: [1.3, .55, 1] });
}

// A building with a window façade (textures.windows: 4 bays of 3.5 m by 4
// floors of 3 m) on its walls, and a plain flat roof.
export function addBlock(kit, s, d, y, width, depth, height, { wall = "#f1ede4", roof = "#b9b3a7", windows = null, yaw = 0 } = {}) {
  const box = new BoxGeometry(width, height, depth);
  if (windows) {
    // Faces: +x, -x, +y, -y, +z, -z, four vertices each. Walls repeat the
    // façade by their size; the roof and floor sample a wall pixel.
    const uv = box.getAttribute("uv");
    const spans = [[depth, height], [depth, height], null, null, [width, height], [width, height]];
    for (let face = 0; face < 6; face++) {
      for (let v = face * 4; v < face * 4 + 4; v++) {
        if (spans[face]) uv.setXY(v, uv.getX(v) * spans[face][0] / 14, uv.getY(v) * spans[face][1] / 12);
        else uv.setXY(v, .02, .98);
      }
    }
    addShape(kit, box, wall, s, d, y + height / 2, { yaw, uvScale: [1, 1], options: { map: windows } });
  } else addShape(kit, box, wall, s, d, y + height / 2, { yaw });
  addShape(kit, new BoxGeometry(width + .4, .45, depth + .4), roof, s, d, y + height + .2, { yaw });
}
