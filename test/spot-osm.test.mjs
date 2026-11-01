import { test } from "node:test";
import assert from "node:assert/strict";
import { featuresFrom, overpassQuery, stitchRings } from "../tools/spot/osm.mjs";

const way = (id, nodes, tags = {}, geometry) => ({ type: "way", id, nodes, tags, geometry: geometry ?? nodes.map((n) => ({ lat: n / 1000, lon: n / 1000 })) });

test("coastline ways are stitched into closed rings; open ends are reported", () => {
  const { rings, open } = stitchRings([way(1, [1, 2, 3]), way(2, [3, 4, 1]), way(3, [7, 8])]);
  assert.deepEqual(rings.map((r) => r.map((p) => p.lat * 1000)), [[1, 2, 3, 4, 1]]);
  assert.equal(open, 1);
});

test("features come out in game coordinates, with building heights", () => {
  const frame = { toGame: (lat, lon) => ({ x: lon * 1000, z: lat * 1000 }) };
  const elements = [
    way(1, [1, 2, 3, 1], { natural: "coastline" }),
    way(10, [5, 6, 7, 5], { building: "yes", "building:levels": "2" }),
    way(11, [5, 6, 7, 5], { building: "yes", height: "7.5 m" }),
    way(12, [5, 6, 7, 5], { building: "hut" }),
    way(13, [5, 6], { natural: "reef" }),
    way(14, [5, 6, 7, 5], { natural: "wetland", wetland: "mangrove" }),
    way(15, [5, 6, 7, 5], { natural: "beach" }),
    way(16, [5, 6], { highway: "track" }),
    way(17, [5, 6], { man_made: "pier" }),
  ];
  const f = featuresFrom(elements, frame);
  assert.equal(f.shoreline.length, 1);
  assert.deepEqual(f.buildings.map((b) => b.height), [6, 7.5, 4]);
  assert.deepEqual([f.reefs.length, f.mangroves.length, f.beaches.length, f.roads[0].kind, f.piers.length], [1, 1, 1, "track", 1]);
  assert.deepEqual(f.buildings[0].footprint[0], [5, 5]);
});

test("a relation's outer ways are joined into closed rings, whichever way each runs", () => {
  const frame = { toGame: (lat, lon) => ({ x: lon * 1000, z: lat * 1000 }) };
  const at = (n) => ({ lat: n / 1000, lon: n / 1000 });
  const member = (role, nodes) => ({ type: "way", role, geometry: nodes.map(at) });
  // Prasonisi's isthmus is a beach relation of several open ways like these.
  const relation = { type: "relation", id: 1, tags: { natural: "beach" }, members: [member("outer", [1, 2, 3]), member("outer", [5, 4, 3]), member("outer", [5, 6, 1]), member("inner", [7, 8, 9, 7])] };
  const f = featuresFrom([relation], frame);
  assert.deepEqual(f.beaches.map((r) => r.map(([x]) => x)), [[1, 2, 3, 4, 5, 6, 1]]);
});

test("the query asks for the island's whole coastline and the detail area's features", () => {
  const q = overpassQuery({ south: 1, west: 2, north: 3, east: 4 }, { south: 0, west: 0, north: 9, east: 9 });
  assert.match(q, /way\["natural"="coastline"\]\(0,0,9,9\)/);
  assert.match(q, /way\["building"\]\(1,2,3,4\)/);
  assert.match(q, /out geom;/);
});
