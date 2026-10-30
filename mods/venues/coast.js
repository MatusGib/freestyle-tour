// Where each venue's coast lies around the game's heat area. The game's wind
// always blows along +x and its heat area never moves, so a venue turns its
// coast instead: the beach lies at the venue's angle to the wind, beyond the
// course and the water AI riders sail. Plain numbers, no three.js, so the
// local server can place a venue's wind zones too.

// The game's heat area: depth along the wind (x), length across it (z).
export const COURSE = { depth: 220, length: 420 };

// inland: the direction from the water to the beach, measured from the wind:
// 0 is onshore, ±90° side-shore, beyond ±90° a little offshore. Negative
// angles put the beach on the far side of the course from the camera, so the
// coast is in view. That mirrors both venues: there the wind comes from the
// left as you look out to sea, here from the right.
export const SITE_LAYOUTS = {
  "sotavento-fuerteventura": {
    inland: -100 * Math.PI / 180, // side-shore, slightly offshore
    shoreBuffer: 90,
    sandbarOffshore: 280,
    curveAmplitude: 5.5,
    curveFrequency: .0036,
    curveSecondary: 2.4,
    curveSecondaryFrequency: .011,
  },
  "westerland-sylt": {
    inland: -45 * Math.PI / 180, // side-onshore
    shoreBuffer: 100,
    sandbarOffshore: 400,
    curveAmplitude: 3.2,
    curveFrequency: .0045,
    curveSecondary: 1.8,
    curveSecondaryFrequency: .013,
  },
};
// s runs along the shore, d inland from the water.
for (const layout of Object.values(SITE_LAYOUTS)) {
  const inX = Math.cos(layout.inland), inZ = Math.sin(layout.inland);
  layout.frame = { rightX: -inZ, rightZ: inX, inX, inZ };
}

// The shoreline sits shoreBuffer beyond the course's corner nearest the beach.
export function shorelineBase(layout) {
  const { inX, inZ } = layout.frame;
  return COURSE.depth / 2 * Math.abs(inX) + COURSE.length / 2 * Math.abs(inZ) + layout.shoreBuffer;
}
export function shorelineOffset(s, layout) {
  return Math.sin(s * layout.curveFrequency) * layout.curveAmplitude +
    Math.sin(s * layout.curveSecondaryFrequency + .7) * layout.curveSecondary;
}
export function shorelineAt(venueId, s) {
  const layout = SITE_LAYOUTS[venueId];
  return layout ? shorelineBase(layout) + shorelineOffset(s, layout) : 0;
}

// Where the water shader draws a venue's shallows and calms its waves, and
// where its wind zones lie: the inland direction, the straight shoreline's
// distance from the course centre, its bends (as shorelineOffset: [a1, f1, a2,
// f2]) and the sandbar's distance out from it.
export function coastFor(venueId) {
  const layout = SITE_LAYOUTS[venueId];
  if (!layout) return null;
  const { curveAmplitude, curveFrequency, curveSecondary, curveSecondaryFrequency } = layout;
  return {
    inX: layout.frame.inX, inZ: layout.frame.inZ, shoreline: shorelineBase(layout), sandbar: layout.sandbarOffshore,
    curve: [curveAmplitude, curveFrequency, curveSecondary, curveSecondaryFrequency],
  };
}
