// Westerland, Sylt: the beach, sea wall and promenade, the groynes, the World
// Cup village and the town, on the analytic coast (coast.js).
import { SITE_LAYOUTS, shorelineAt, shorelineBase } from "../coast.js";
import { addBlock, addFeatherFlag, addPagoda, addPerson, addRig, seeded } from "../props.js";
import { SHORE_HALF_LENGTH, addBox, addCylinder, addForeshore, addLand, addMesh, addSurface, kitFor, landNoise, point, smooth, windYaw } from "../scenery.js";

function addMusicShell(group, template, s, d, baseY = 0) {
  addCylinder(group, template, s, d, baseY + .18, 8, 8, .24, "#c9c7bd", 24);
  for (let i = 0; i < 7; i++) {
    const angle = Math.PI * (.12 + i * .126);
    const x = s + Math.cos(angle) * 6.5;
    const z = d + Math.sin(angle) * 6.5;
    addCylinder(group, template, x, z, baseY + .4, .16, .13, 3.3, "#eee8dc", 8);
  }
  const positions = [], indices = [];
  const arc = [];
  for (let i = 0; i <= 12; i++) {
    const angle = Math.PI * (.08 + i * .07);
    arc.push([s + Math.cos(angle) * 7.2, d + Math.sin(angle) * 7.2, baseY + 4.2 + Math.sin(angle) * 1.8]);
  }
  const center = [s, d - 1, baseY + 4.7];
  for (let i = 0; i < arc.length - 1; i++) {
    const offset = positions.length / 3;
    positions.push(...point(...center), ...point(...arc[i]), ...point(...arc[i + 1]));
    indices.push(offset, offset + 1, offset + 2);
  }
  addMesh(group, template, positions, indices, "#f2eee3");
}

function addRock(group, template, s, d, width, depth, height, color, baseY = -.32, seed = 1) {
  const positions = [], indices = [];
  const sides = 7;
  let random = Math.abs(Math.floor(seed * 997 + s * 13 + d * 7)) % 2147483647 || 1;
  const rnd = () => ((random = (random * 16807) % 2147483647) - 1) / 2147483646;
  const rings = [[.78, 0], [1, .42], [.48, .84]];
  const radii = Array.from({ length: sides }, () => .76 + rnd() * .42);
  for (const [radius, rise] of rings) {
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const jitter = radii[i];
      positions.push(...point(
        s + Math.cos(angle) * width * .5 * radius * jitter,
        d + Math.sin(angle) * depth * .5 * radius * jitter,
        baseY + height * rise,
      ));
    }
  }
  const bottom = positions.length / 3;
  positions.push(...point(s, d, baseY));
  const top = positions.length / 3;
  positions.push(...point(s + (rnd() - .5) * width * .12, d + (rnd() - .5) * depth * .12, baseY + height));
  for (let ring = 0; ring < 2; ring++) {
    const a = ring * sides, b = (ring + 1) * sides;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      indices.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    indices.push(bottom, j, i, top, 2 * sides + i, 2 * sides + j);
  }
  addMesh(group, template, positions, indices, color, { roughness: .98 });
}

function addGrass(group, template, placements, color, seed = 1, groundAt = () => 0) {
  const positions = [], indices = [];
  let random = seed;
  const rnd = () => ((random = (random * 16807) % 2147483647) - 1) / 2147483646;
  for (const [s0, d0, count, height] of placements) {
    for (let i = 0; i < count; i++) {
      const s = s0 + (rnd() - .5) * 13, d = d0 + (rnd() - .5) * 9;
      const h = height * (.55 + rnd() * .8), w = .12 + rnd() * .2, lean = (rnd() - .5) * .9;
      const baseY = groundAt(s, d);
      for (let blade = 0; blade < 3; blade++) {
        const a = blade * Math.PI / 3, dx = Math.cos(a) * w, dz = Math.sin(a) * w;
        const offset = positions.length / 3;
        positions.push(...point(s - dx, d - dz, baseY), ...point(s + dx, d + dz, baseY), ...point(s + lean + dx * .2, d + lean * .2, baseY + h));
        indices.push(offset, offset + 1, offset + 2);
      }
    }
  }
  return addMesh(group, template, positions, indices, color, { flatShading: true });
}

function addBeachBasket(group, template, s, d, baseY = 0) {
  addBox(group, template, s, d, 2.7, 2, 1.25, "#477f91", 0, baseY);
  for (let i = -2; i <= 2; i++) {
    if (i % 2 === 0) addBox(group, template, s + i * .43, d - .96, .24, .12, 1.05, "#f3ecdf", 0, baseY);
  }
  addBox(group, template, s, d - .1, 2.8, 2.1, .12, "#786655", 0, baseY);
  addBox(group, template, s - 1.05, d + .55, .08, .08, .75, "#786655", 0, baseY);
  addBox(group, template, s + 1.05, d + .55, .08, .08, .75, "#786655", 0, baseY);
}

export function build(group, template, textures) {
  const venueId = "westerland-sylt";
  const layout = SITE_LAYOUTS[venueId];
  const shore = shorelineBase(layout);
  const kit = kitFor(group, template);
  const wind = windYaw();
  const random = seeded(2023);
  const { fbm } = landNoise(54);
  const inlandOf = (s, d) => d - shorelineAt(venueId, s);
  // A beach rising to the sea wall, the promenade and the flat town behind
  // it; beyond the town, Sylt's high grey dunes.
  const groundAt = (s, d) => {
    const inland = inlandOf(s, d);
    const town = 1 - smooth(380, 900, Math.abs(s));
    const beach = .16 + .94 * Math.min(inland, 112) / 112 + 1.4 * smooth(112, 132, inland);
    const dunes = smooth(120, 220, inland) * (1 - town * .9) * (11 * Math.max(0, fbm(s * .008, inland * .012) + .35) + 2 * fbm(s * .04, inland * .04));
    return beach + Math.max(0, dunes);
  };
  const colorAt = (s, d) => {
    const inland = inlandOf(s, d);
    const shade = .92 + .08 * fbm(s * .09, inland * .09, 2);
    if (inland < 112) return { color: "#cdbfa2", factor: shade };
    const town = 1 - smooth(380, 900, Math.abs(s));
    if (town > .5 && inland < 600) return { color: "#a9a79c", factor: shade };
    return { color: fbm(s * .02, inland * .02, 2) > -.1 ? "#7f8c63" : "#c9bc9c", factor: shade };
  };
  addForeshore(group, template, venueId, layout, .16, "#8d8774");
  addLand(group, template, venueId, layout, textures, groundAt, colorAt);
  const at = (s, inland) => [s, shore + inland, groundAt(s, shore + inland)];
  // A raised, paved promenade and sea wall back the central contest beach.
  addSurface(group, template, -370, 370, shore + 114, shore + 130, 2, 180, () => 2.35, () => ({ color: "#aaa99f", factor: .98 }));
  addBox(group, template, 0, shore + 111.8, 720, 3.8, 1.25, "#a7a59b", 0, 1.1);
  addBox(group, template, 0, shore + 111.8, 720, 4.1, .22, "#d6d2c5", 0, 2.35);
  addMusicShell(group, template, -14, shore + 121, 2.35);

  // Sylt's north-south rock groynes reach about 20 m into the sea and repeat
  // every 100–200 m. At high tide, marked heads can be the only visible cue.
  const markerSpacing = 140;
  for (let s = -SHORE_HALF_LENGTH; s <= SHORE_HALF_LENGTH; s += markerSpacing) {
    for (let d = shore - 19; d < shore - .2; d += 1.55) {
      const variation = Math.sin(s * .17 + d * .71);
      const width = 1.7 + .45 * variation;
      const height = .64 + .16 * Math.sin(s * .13 + d * .44);
      const stone = Math.sin(s * .07 + d * .11) > .25 ? "#565c5c" : "#73746c";
      addRock(group, template, s + variation * .32, d, width, 1.85, height, stone, -.38, s + d);
    }
    const signD = shore + 3.4, signBase = groundAt(s, signD) + 1.95;
    addBox(group, template, s, signD, .16, .16, 2.25, "#514f47", 0, groundAt(s, signD));
    addBox(group, template, s, signD, 1.2, .22, 1.05, "#e9c23e", 0, signBase);
    const markerD = signD - .13, y0 = signBase + .1, y1 = signBase + .93, half = .34, thick = .07;
    for (const sign of [-1, 1]) {
      const positions = [], indices = [];
      positions.push(...point(s - half, markerD, sign < 0 ? y0 : y1), ...point(s - half + thick, markerD, sign < 0 ? y0 : y1),
        ...point(s + half, markerD, sign < 0 ? y1 : y0), ...point(s + half - thick, markerD, sign < 0 ? y1 : y0));
      indices.push(0, 1, 2, 0, 2, 3);
      addMesh(group, template, positions, indices, "#343831");
    }
  }

  // The World Cup village on Brandenburger Strand: pagodas, feather flags,
  // the rigging area, spectators, and the blue-and-white beach baskets.
  const trims = ["#1d6fd1", "#e8412d", "#20262e", "#f2c230"];
  for (let i = 0; i < 11; i++) {
    const [s, d, y] = at(-225 + i * 45, 43 + (i % 2) * 5);
    addPagoda(kit, s, d, y, { trim: trims[i % trims.length], width: i % 3 === 0 ? 7 : 5 });
  }
  for (let s = -160; s <= 160; s += 9) {
    const [, d, y] = at(s, 18);
    addFeatherFlag(kit, s, d, y, ["#1d6fd1", "#e8412d", "#f2c230", "#e9ecef", "#20262e"][Math.round(s / 9 + 20) % 5], wind);
  }
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1;
    const [s, d, y] = at(side * (110 + random() * 160), 10 + random() * 24);
    addRig(kit, s, d, y, random, wind);
  }
  for (let i = 0; i < 150; i++) {
    const [s, d, y] = at((random() - .5) * 360, i < 90 ? 4 + random() * 10 : 100 + random() * 12);
    addPerson(kit, s, d, y, random);
  }
  for (let s = -420; s <= 420; s += 42) {
    const basketS = s + (Math.round(s / 42) % 2) * 7;
    const [, basketD, y] = at(basketS, 24 + (Math.abs(s) % 3) * 6);
    addBeachBasket(group, template, basketS, basketD, y);
  }

  // Westerland's waterfront: hotels along the promenade and, behind them, the
  // tall slabs of the Kurzentrum that mark the town from the sea.
  for (const [s, inland, width, depth, height] of [
    [-330, 150, 26, 16, 15], [-280, 156, 30, 18, 18], [-200, 150, 34, 16, 12], [-110, 152, 28, 16, 15],
    [60, 152, 30, 16, 15], [130, 150, 34, 18, 18], [215, 154, 28, 16, 12], [300, 150, 30, 16, 15], [370, 156, 26, 14, 12],
  ]) {
    const [, d, y] = at(s, inland);
    addBlock(kit, s, d, y, width, depth, height, { windows: textures.windows, wall: "#efe9dd", roof: "#8f5a4c" });
  }
  for (const [s, inland, width, height] of [[-70, 320, 48, 30], [30, 350, 44, 38], [140, 330, 36, 27]]) {
    const [, d, y] = at(s, inland);
    addBlock(kit, s, d, y, width, 16, height, { windows: textures.windows, wall: "#e6e2d8", roof: "#9a9a96" });
  }
  // Marram grass holds the dunes either side of the town.
  const tufts = Array.from({ length: 120 }, () => [(random() < .5 ? -1 : 1) * (420 + random() * 1400), shore + 150 + random() * 300, 36, 1.2 + random() * .5]);
  addGrass(group, template, tufts, "#75844b", 937, groundAt);
}
