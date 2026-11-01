// Windsurfers sailing a spot's water beyond the heat, as the photos of a
// busy summer day show them: each on a beam reach across the wind (+x) along
// its lane, jibing at the ends, the rig leaning to windward with the sailor
// hanging off the boom. Three instanced meshes (boards, sails, riders) for
// all of them, moved by the water's clock before each draw. Background only:
// nothing in the game sees them. lanes: [{ from: [x, z], to: [x, z], count,
// speed }] in m/s.
import {
  CapsuleGeometry, Color, CylinderGeometry, DoubleSide, Euler, ExtrudeGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Shape, ShapeGeometry, SphereGeometry, Vector3,
} from "../lib/three.core.min.js";
import { seeded } from "../props.js";
import { merge, place } from "./plants.js";

const TURN = 8; // metres at each end over which a sailor jibes round

// Where sailor k of a lane is at time t: { x, z, yaw, mirror }. yaw turns the
// sailor's +z to its heading; mirror puts the rig to windward (-x) whichever
// way it sails.
export function sailorAt({ from: [ax, az], to: [bx, bz], count, speed }, k, t) {
  const length = Math.hypot(bx - ax, bz - az), lap = 2 * length;
  const s = (((t * speed + (k / count) * lap + k * 37) % lap) + lap) % lap;
  const out = s < length, d = out ? s : lap - s, u = d / length;
  const forward = Math.atan2(bx - ax, bz - az), back = forward + Math.PI;
  // Through the jibe the heading swings round over the last TURN metres.
  const toEnd = out ? length - d : d, swing = toEnd < TURN ? 0.5 * (1 - toEnd / TURN) : 0;
  const yaw = (out ? forward : back) + swing * Math.PI * (out ? 1 : -1);
  return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, yaw, mirror: Math.cos(yaw) < 0 };
}

// The parts in the sailor's own frame, heading +z with the wind from -x.
function boardGeometry() {
  const outline = new Shape();
  outline.moveTo(-0.3, -1.15);
  outline.lineTo(-0.33, 0.6);
  outline.quadraticCurveTo(-0.2, 1.2, 0, 1.3);
  outline.quadraticCurveTo(0.2, 1.2, 0.33, 0.6);
  outline.lineTo(0.3, -1.15);
  outline.lineTo(-0.3, -1.15);
  return new ExtrudeGeometry(outline, { depth: 0.1, bevelEnabled: false, curveSegments: 6 }).rotateX(Math.PI / 2).translate(0, 0.12, 0);
}

function sailGeometry() {
  const s = new Shape();
  s.moveTo(0, 0.4);
  s.lineTo(0, 4.6);
  s.quadraticCurveTo(1.5, 3.4, 2.2, 1.4);
  s.quadraticCurveTo(1.2, 0.3, 0, 0.4);
  return rigPose(new ShapeGeometry(s, 8));
}

// From the sail's own plane (luff up y, clew out x) to the sailor's frame:
// the chord runs back and a little to leeward; the mast leans to windward
// and back.
const rigPose = (geometry) => geometry.rotateY(1.13).rotateZ(0.32).rotateX(-0.15).translate(0, 0.15, 0.25);

function riderGeometry(random) {
  return merge([
    [new CapsuleGeometry(0.17, 0.55, 2, 8), "#16181b", place(-0.55, 0.95, 0.15, { roll: 0.45 })],
    [new SphereGeometry(0.12, 8, 6), "#c99876", place(-0.86, 1.5, 0.18)],
    [new CapsuleGeometry(0.06, 0.7, 2, 5), "#16181b", place(-0.3, 0.45, 0.35, { roll: 0.2 })],
    [new CapsuleGeometry(0.06, 0.7, 2, 5), "#16181b", place(-0.3, 0.45, -0.15, { roll: 0.2 })],
    [new CapsuleGeometry(0.045, 0.6, 2, 5), "#16181b", place(-0.35, 1.35, 0.4, { roll: 1.2 })],
    [new CapsuleGeometry(0.045, 0.6, 2, 5), "#16181b", place(-0.35, 1.3, -0.1, { roll: 1.2 })],
    // The mast up the luff and the boom out to the clew, posed with the sail.
    [rigPose(new CylinderGeometry(0.03, 0.04, 4.3, 5).translate(0, 2.5, 0)), "#22252a", place(0, 0, 0)],
    [rigPose(new CylinderGeometry(0.025, 0.025, 2.2, 5).rotateZ(Math.PI / 2).translate(1.1, 1.4, 0)), "#cfd3d6", place(0, 0, 0)],
  ], random);
}

const SAILS = ["#ff5a1f", "#1aa3d9", "#c6e03b", "#e8322f", "#f2f2ee", "#ff8a00", "#22262b", "#7a5cfa"];
const BOARDS = ["#f4f4f1", "#f4f4f1", "#2f7fd0", "#ff7a1a"];

// time: the water's uTime uniform.
export function buildSailors(lanes, time, { seed = 7 } = {}) {
  const random = seeded(seed), all = lanes.flatMap((lane) => Array.from({ length: lane.count }, (_, k) => ({ lane, k })));
  const make = (geometry, vertexColors) => {
    const mesh = new InstancedMesh(geometry, new MeshStandardMaterial({ vertexColors, roughness: 0.75, metalness: 0, side: DoubleSide }), all.length);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    return mesh;
  };
  const boards = make(boardGeometry(), false), sails = make(sailGeometry(), false), riders = make(riderGeometry(random), true);
  const tint = new Color();
  all.forEach((_, k) => {
    boards.setColorAt(k, tint.set(BOARDS[Math.floor(random() * BOARDS.length)]));
    sails.setColorAt(k, tint.set(SAILS[Math.floor(random() * SAILS.length)]));
    riders.setColorAt(k, tint.setScalar(1));
  });
  const matrix = new Matrix4(), rotation = new Quaternion(), euler = new Euler(), at = new Vector3(), size = new Vector3();
  let last = null;
  const update = () => {
    const t = time.value;
    if (t === last) return;
    last = t;
    all.forEach(({ lane, k }, i) => {
      const { x, z, yaw, mirror } = sailorAt(lane, k, t);
      // A little pitch and heel as the board skips over the chop.
      euler.set(0.03 * Math.sin(t * 3.1 + i), yaw, 0.04 * Math.sin(t * 2.3 + i * 1.7), "YXZ");
      matrix.compose(at.set(x, 0.04 * Math.sin(t * 4 + i), z), rotation.setFromEuler(euler), size.set(mirror ? -1 : 1, 1, 1));
      for (const mesh of [boards, sails, riders]) mesh.setMatrixAt(i, matrix);
    });
    for (const mesh of [boards, sails, riders]) mesh.instanceMatrix.needsUpdate = true;
  };
  // Whichever draws first moves them all, once per tick of the clock.
  for (const mesh of [boards, sails, riders]) mesh.onBeforeRender = update;
  update();
  const group = new Group();
  group.name = "sailors";
  group.add(boards, sails, riders);
  return group;
}
