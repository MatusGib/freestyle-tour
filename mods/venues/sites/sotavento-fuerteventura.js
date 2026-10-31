// Sotavento, Fuerteventura: Playa Barca's beach, dunes and the Jandía massif,
// the judging tower and the event village, on the analytic coast (coast.js).
import { SITE_LAYOUTS, shorelineAt, shorelineBase } from "../coast.js";
import { addBlock, addBush, addFeatherFlag, addPagoda, addPalm, addPerson, addRig, seeded } from "../props.js";
import { addBox, addForeshore, addLand, kitFor, landNoise, smooth, windYaw } from "../scenery.js";

function addJudgeTower(group, template, s, d, baseY = 0) {
  for (const x of [-3.1, 3.1]) {
    for (const z of [-2.2, 2.2]) addBox(group, template, s + x, d + z, .32, .32, 5.8, "#d9d4c8", 0, baseY);
  }
  addBox(group, template, s, d, 7.2, 5.5, .34, "#9e7954", 0, baseY + 5.35);
  addBox(group, template, s, d, 6.2, 4.1, 2.6, "#eee8db", 0, baseY + 5.7);
  addBox(group, template, s, d - 2.3, 7.5, .32, 2.9, "#f7f3eb", 0, baseY + 5.65);
  addBox(group, template, s, d, 7.8, 6, .25, "#b85d49", 0, baseY + 8.35);
  for (const x of [-3, 3]) addBox(group, template, s + x, d - 2.78, .12, .12, .75, "#f4f0e7", 0, baseY + 5.9);
}

export function build(group, template, textures) {
  const venueId = "sotavento-fuerteventura";
  const layout = SITE_LAYOUTS[venueId];
  const shore = shorelineBase(layout);
  const kit = kitFor(group, template);
  const wind = windYaw();
  const random = seeded(1993);
  const { fbm, ridged } = landNoise(28);
  const inlandOf = (s, d) => d - shorelineAt(venueId, s);
  // A wide, gently rising beach; foredunes behind it; then the Jandía massif:
  // old, worn volcanic ridges cut by gullies, rising to about 200 m inland.
  const groundAt = (s, d) => {
    const inland = inlandOf(s, d);
    const beach = .12 + .3 * Math.min(inland, 90) / 90 + Math.max(0, inland - 90) * .012;
    const dunes = smooth(70, 150, inland) * (1 - smooth(420, 560, inland)) * (6 * Math.max(0, fbm(s * .011, inland * .018) + .25) + 1.2 * fbm(s * .05, inland * .06));
    const hills = smooth(500, 1500, inland) * (1 + inland / 2400) * (150 * ridged(s * .0009 + 3, inland * .0011, 4, 1.15) + 18 * fbm(s * .005, inland * .005));
    return beach + Math.max(0, dunes) + hills;
  };
  const colorAt = (s, d) => {
    const inland = inlandOf(s, d);
    const shade = .93 + .07 * fbm(s * .08, inland * .08, 2);
    if (inland < 90) return { color: "#dcc493", factor: shade };
    if (inland < 520) return { color: fbm(s * .03, inland * .03, 2) > .18 ? "#a8a06c" : "#e2ca96", factor: shade };
    const height = groundAt(s, d);
    return { color: height > 120 ? "#86644f" : height > 40 ? "#9c7757" : "#b48d63", factor: .88 + .12 * fbm(s * .01, inland * .01, 3) };
  };
  addForeshore(group, template, venueId, layout, .12, "#a38e68");
  addLand(group, template, venueId, layout, textures, groundAt, colorAt);
  const at = (s, inland) => [s, shore + inland, groundAt(s, shore + inland)];

  // Playa Barca's judging tower and the event village: pagodas, a banner
  // fence and a line of sponsors' feather flags along the beach front.
  addJudgeTower(group, template, 0, shore + 22, groundAt(0, shore + 22));
  const trims = ["#d23c3c", "#1d6fd1", "#f2c230", "#20262e"];
  for (let i = 0; i < 12; i++) {
    const [s, d, y] = at(-250 + i * 46, 46 + (i % 2) * 7);
    addPagoda(kit, s, d, y, { trim: trims[i % trims.length], width: i % 4 === 0 ? 7 : 5 });
  }
  for (let s = -150; s <= 150; s += 6.5) {
    const [, d, y] = at(s, 31);
    addBox(group, template, s, d, 6, .12, 1.1, ["#e8412d", "#1d6fd1", "#f4f2ec", "#20262e"][Math.round(s / 6.5) & 3], 0, y);
  }
  for (let s = -170; s <= 170; s += 8.5) {
    const [, d, y] = at(s, 15 + (Math.round(s / 8.5) % 2) * 2);
    addFeatherFlag(kit, s, d, y, ["#e8412d", "#1d9bd1", "#f2c230", "#20262e", "#e9ecef"][Math.round(s / 8.5 + 20) % 5], wind);
  }
  // The rigging areas either side of the village, and spectators along the
  // water's edge and around the tower.
  for (let i = 0; i < 46; i++) {
    const side = i % 2 ? 1 : -1;
    const [s, d, y] = at(side * (120 + random() * 170), 8 + random() * 26);
    addRig(kit, s, d, y, random, wind);
  }
  for (let i = 0; i < 170; i++) {
    const near = i < 70;
    const [s, d, y] = at(near ? (random() - .5) * 90 : (random() - .5) * 420, near ? 6 + random() * 22 : 2 + random() * 7);
    addPerson(kit, s, d, y, random);
  }

  // The René Egli centre and the low Meliá resort wings among palms, with
  // bushes holding the dunes.
  addBlock(kit, 20, shore + 129, groundAt(20, shore + 129), 56, 21, 4.4, { windows: textures.windows });
  addBox(group, template, 20, shore + 117.8, 50, .42, 2.1, "#73aeb0", 0, groundAt(20, shore + 129) + 1.1);
  for (const [s, inland, width, depth, floors] of [[-118, 180, 70, 36, 3], [-150, 222, 60, 30, 4], [105, 190, 86, 40, 4], [150, 236, 64, 30, 5]]) {
    const [, d, y] = at(s, inland);
    for (let step = 0; step < floors; step++) {
      addBlock(kit, s, d + step * 6, y + step * 3, width - step * 4, depth - step * 6, 3, { windows: textures.windows, roof: "#c9b9a0" });
    }
  }
  for (let i = 0; i < 26; i++) {
    const [s, d, y] = at(-200 + random() * 400, 140 + random() * 70);
    addPalm(kit, s, d, y, random);
  }
  for (let i = 0; i < 160; i++) {
    const [s, d, y] = at((random() - .5) * 1400, 120 + random() * 380);
    addBush(kit, s, d, y, random, random() < .5 ? "#8b8f58" : "#9d9466");
  }
}
