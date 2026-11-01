// OpenStreetMap data for a spot, from the Overpass API: the whole island's
// coastline (so its rings close) and the detail area's features, converted to
// the game frame. Data © OpenStreetMap contributors, ODbL.

export const OVERPASS = "https://overpass-api.de/api/interpreter";
const bbox = (b) => `(${b.south},${b.west},${b.north},${b.east})`;

export function overpassQuery(detail, island) {
  const d = bbox(detail);
  return `[out:json][timeout:180];
(
  way["natural"="coastline"]${bbox(island)};
  way["natural"~"^(beach|reef|sand|bare_rock|scrub|wetland)$"]${d};
  relation["natural"~"^(beach|reef|wetland)$"]${d};
  way["building"]${d};
  way["highway"]${d};
  way["man_made"="pier"]${d};
  way["amenity"="parking"]${d};
  relation["amenity"="parking"]${d};
  node["emergency"~"^lifeguard"]${d};
  way["emergency"~"^lifeguard"]${d};
);
out geom;`;
}

// Coastline ways joined end to end into closed rings of { lat, lon }. Ways
// that never close (the query cut them) are counted in `open`.
export function stitchRings(ways) {
  const byStart = new Map(ways.map((w) => [w.nodes[0], w]));
  const used = new Set(), rings = [];
  let open = 0;
  for (const first of ways) {
    if (used.has(first)) continue;
    const ring = [];
    let w = first;
    while (w && !used.has(w)) {
      used.add(w);
      ring.push(...(ring.length ? w.geometry.slice(1) : w.geometry));
      w = byStart.get(w.nodes.at(-1));
    }
    if (w === first) rings.push(ring);
    else open += 1;
  }
  return { rings, open };
}

// A relation's member ways ([{ lat, lon }] lines) joined into rings by their
// shared end points, reversing a way where needed. Members often run either
// way and close only together.
export function joinLines(lines) {
  const key = (p) => `${p.lat},${p.lon}`, left = lines.map((l) => [...l]), rings = [];
  while (left.length) {
    const ring = left.shift(), touches = (l) => key(l[0]) === key(ring.at(-1)) || key(l.at(-1)) === key(ring.at(-1));
    let k;
    while (key(ring[0]) !== key(ring.at(-1)) && (k = left.findIndex(touches)) >= 0) {
      const [next] = left.splice(k, 1);
      ring.push(...(key(next[0]) === key(ring.at(-1)) ? next : next.reverse()).slice(1));
    }
    rings.push(ring);
  }
  return rings;
}

const levelsHeight = (tags) => {
  const height = parseFloat(tags.height);
  if (Number.isFinite(height)) return height;
  const levels = parseFloat(tags["building:levels"]);
  return Number.isFinite(levels) ? levels * 3 : 4;
};

// The features a spot uses, as [x, z] lines and rings in the game frame.
export function featuresFrom(elements, frame) {
  const toGame = (points) => points.map(({ lat, lon }) => { const { x, z } = frame.toGame(lat, lon); return [Math.round(x * 10) / 10, Math.round(z * 10) / 10]; });
  const ways = elements.filter((e) => e.type === "way" && e.geometry);
  const outerRings = (e) => (e.type === "way" ? [e.geometry] : joinLines((e.members ?? []).filter((m) => m.role === "outer" && m.geometry).map((m) => m.geometry)));
  const polygonsOf = (test) => elements.filter((e) => e.tags && test(e.tags)).flatMap(outerRings).map(toGame);
  const { rings, open } = stitchRings(ways.filter((w) => w.tags?.natural === "coastline"));
  return {
    shoreline: rings.map(toGame),
    openCoastline: open,
    mangroves: polygonsOf((t) => t.natural === "wetland" && t.wetland === "mangrove"),
    beaches: polygonsOf((t) => t.natural === "beach" || t.natural === "sand"),
    reefs: polygonsOf((t) => t.natural === "reef"),
    buildings: ways.filter((w) => w.tags?.building).map((w) => ({ footprint: toGame(w.geometry), height: levelsHeight(w.tags), kind: w.tags.building })),
    roads: ways.filter((w) => w.tags?.highway).map((w) => ({ kind: w.tags.highway, line: toGame(w.geometry) })),
    piers: ways.filter((w) => w.tags?.man_made === "pier").map((w) => toGame(w.geometry)),
    parking: polygonsOf((t) => t.amenity === "parking"),
    // Lifeguard stations, mapped as points or as small buildings: where each stands.
    lifeguards: elements.filter((e) => /^lifeguard/.test(e.tags?.emergency ?? "")).map((e) => (e.type === "node" ? e : e.geometry?.[0])).filter(Boolean).map((p) => toGame([p])[0]),
  };
}
