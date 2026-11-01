// Sorobon, Bonaire: what the map data doesn't carry, placed by the named
// OpenStreetMap features on the beach: the windsurf centre Jibe City at about
// (221, -363) with the Hang Out Beach Bar at (225, -337) beside it, and the
// Sorobon Beach Resort at (234, -453) with its beach bar at (165, -473).
// Rigs stand on racks and lie on the sand in front of the centre, feather
// flags blow downwind, palapa sunshades line the resort's beach, palms stand
// by the bars, people walk the beach, and the jetties of features.piers
// stand on posts in the lagoon. The game frame's +x is downwind, so props
// turn by WIND to face it.
import { BoxGeometry, ConeGeometry, CylinderGeometry, Shape, ShapeGeometry } from "../lib/three.core.min.js";
import { addFeatherFlag, addPalm, addPerson, addRig, addShape, seeded } from "../props.js";

const WIND = 0;
const SAILS = ["#e8412d", "#f2c230", "#1d9bd1", "#20262e", "#ff7a1a", "#2ab673", "#c2185b", "#7a5cfa"];

// Where the beach meets the lagoon along z, coming from the course (+x).
function shoreAt(spot, z) {
  let x = 0;
  while (x < 1500 && spot.heightAt(x, z) <= 0) x += 0.5;
  return x;
}

// A rack of rigged sails standing upright, masts up, between two posts.
function addRack(kit, x, z, y, random) {
  for (const dz of [-2.2, 2.2]) addShape(kit, new BoxGeometry(0.12, 2.4, 0.12), "#7a6347", x, z + dz, y + 1.2);
  addShape(kit, new BoxGeometry(0.1, 0.1, 4.6), "#7a6347", x, z, y + 2.3);
  for (const dz of [-1.4, 0, 1.4]) {
    const sail = new Shape();
    sail.moveTo(0, 0);
    sail.lineTo(0, 4.3);
    sail.quadraticCurveTo(1.5, 3, 2, 1.2);
    sail.quadraticCurveTo(1, 0.15, 0, 0);
    addShape(kit, new ShapeGeometry(sail, 8), SAILS[Math.floor(random() * SAILS.length)], x - 0.3, z + dz, y + 0.2, { yaw: WIND + Math.PI });
  }
}

// A palapa: a thatched sunshade on a pole.
function addPalapa(kit, x, z, y) {
  addShape(kit, new CylinderGeometry(0.08, 0.1, 2.6, 6), "#7a6347", x, z, y + 1.3);
  addShape(kit, new ConeGeometry(1.7, 1, 12, 1), "#b38f55", x, z, y + 2.95);
}

// A wooden jetty along a line of [x, z] points: a deck 0.8 m up on posts.
function addJetty(kit, line) {
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1], length = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(-(bz - az), bx - ax);
    addShape(kit, new BoxGeometry(length + 0.9, 0.14, 1.8), "#9c8466", (ax + bx) / 2, (az + bz) / 2, 0.8, { yaw });
    for (let s = 0; s <= length; s += 3) {
      for (const side of [-0.8, 0.8]) {
        const t = s / length;
        addShape(kit, new CylinderGeometry(0.09, 0.09, 1.9, 6), "#5d4b3a", ax + (bx - ax) * t + Math.sin(yaw) * side, az + (bz - az) * t + Math.cos(yaw) * side, -0.2);
      }
    }
  }
}

export function landmarks(kit, spot) {
  const random = seeded(1993);
  const at = (z, inland) => {
    const x = shoreAt(spot, z) + inland;
    return [x, z, spot.heightAt(x, z)];
  };
  // Jibe City: racks of rigged sails along the beach front, rigs on the sand
  // by the water, and the centre's flags.
  for (let z = -385; z <= -341; z += 7.5) addRack(kit, ...at(z, 16), random);
  for (let k = 0; k < 18; k++) {
    const [x, z, y] = at(-330 - random() * 75, 3 + random() * 7);
    addRig(kit, x, z, y, random, WIND);
  }
  for (const [z, colour] of [[-348, "#e8412d"], [-356, "#1d9bd1"], [-366, "#f2c230"], [-374, "#20262e"]]) addFeatherFlag(kit, ...at(z, 21), colour, WIND);
  // The resort's beach: palapas, and the bar's palms.
  for (let k = 0; k < 12; k++) addPalapa(kit, ...at(-420 - k * 7 - random() * 3, 9 + (k % 2) * 8 + random() * 3));
  for (const [x, z] of [[214, -332], [232, -322], [208, -352], [170, -480], [158, -466], [176, -462], [246, -436], [250, -470]]) addPalm(kit, x, z, spot.heightAt(x, z), random);
  for (let k = 0; k < 45; k++) {
    const [x, z, y] = at(-325 - random() * 180, 1 + random() * 22);
    addPerson(kit, x, z, y, random);
  }
  // The jetties near the course.
  for (const line of spot.features.piers) if (line.some(([x, z]) => Math.hypot(x, z) < 1500)) addJetty(kit, line);
}
