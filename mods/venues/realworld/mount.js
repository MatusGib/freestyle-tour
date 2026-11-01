// Builds a real-world spot (mods/venues/spots/<id>/, from tools/spot.mjs)
// into the game's scene: its terrain, plants, buildings, the surf on its reef
// and its site's landmarks (sites/<id>.js), water out to the horizon, the
// camera seeing that far, and the water's depth map (spot.js waterMap) for
// water.js. Everything is built on the vendored three.js r185, so only when
// the game runs the same revision (the plan's Task 1 findings); whatever
// goes wrong leaves the game's own scene.
import {
  BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial, REVISION, RepeatWrapping, SRGBColorSpace, Texture,
} from "../lib/three.core.min.js";
import { buildBuildings } from "./buildings.js";
import { buildPlants } from "./plants.js";
import { decodeInBrowser, loadSpot, waterMap } from "./spot.js";
import { buildSailors } from "./sailors.js";
import { buildSurf } from "./surf.js";
import { buildTerrain, ringGeometry } from "./terrain.js";

const FAR = 14000; // metres the camera sees at a spot; the game's is 1800
// The detail textures (assets/textures/) by the names buildTerrain uses.
const DETAIL = { sand: "sand", coralRubble: "coral-rubble", scrubSoil: "scrub-soil", rock: "rock", mangroveMud: "mangrove-mud" };
// A site may also bring its own look: textures (ground type → file, over
// DETAIL), ground ({ sand }), flora, buildings, surfLines(spot), where its
// waves break when it has no reef, and sailors(spot), windsurfers' lanes.
const SITES = { "sorobon-bonaire": () => import("../sites/sorobon-bonaire.js"), "prasonisi-rhodes": () => import("../sites/prasonisi-rhodes.js") };

const fetchBytes = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

async function detailTexture(name) {
  const texture = new Texture(await createImageBitmap(new Blob([await fetchBytes(`/__mods/venues/assets/textures/${name}.jpg`)])));
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

// Water from the game's 2600 m square out to the horizon: a ring sharing the
// game's water material, a child of its mesh so it follows the rider.
function farWater(ocean) {
  const { positions, indices } = ringGeometry({ outer: 13900, inner: 1300, step: 200, heightAt: () => 0, skirt: 0 });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.rotateX(Math.PI / 2); // undoes the ocean's turn
  const mesh = new Mesh(geometry, ocean.material);
  mesh.name = "far-water";
  return mesh;
}

// What props.js needs to place geometry at a spot: the game's own points (s
// is x, d is z), in one mesh coloured by its vertices, so a site's hundreds
// of colours cost one draw call. Each shape's normals are its own.
export function landmarkKit() {
  const positions = [], normals = [], colours = [], colour = new Color();
  const kit = {
    point: (s, d, y = 0) => [s, y, d],
    add(points, indices, hex) {
      const part = new BufferGeometry();
      part.setAttribute("position", new BufferAttribute(Float32Array.from(points), 3));
      part.setIndex(Array.from(indices));
      part.computeVertexNormals();
      const flat = part.toNonIndexed(), p = flat.getAttribute("position"), n = flat.getAttribute("normal");
      colour.set(hex);
      for (let i = 0; i < p.count; i++) {
        positions.push(p.getX(i), p.getY(i), p.getZ(i));
        normals.push(n.getX(i), n.getY(i), n.getZ(i));
        colours.push(colour.r, colour.g, colour.b);
      }
      part.dispose();
      flat.dispose();
    },
  };
  const finish = () => {
    const group = new Group();
    group.name = "landmarks";
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
    geometry.setAttribute("normal", new BufferAttribute(Float32Array.from(normals), 3));
    geometry.setAttribute("color", new BufferAttribute(Float32Array.from(colours), 3));
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: DoubleSide }));
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return group;
  };
  return { kit, finish };
}

// Mounts venue's spot and returns its water map (with its texture), or null
// when it can't, or when another venue was chosen while it loaded. Asked
// again while loading, it waits for the same load.
export function mountSpot(game, venue, log) {
  if (game.__venueSpot?.manifest.id === venue.id) return Promise.resolve(game.__venueSpotWater);
  if (game.__venueSpotLoading?.id === venue.id) return game.__venueSpotLoading.done;
  unmountSpot(game);
  if (window.__THREE__ !== REVISION) {
    log(`the game runs three.js r${window.__THREE__}, not r${REVISION}; ${venue.name} keeps the game's own scene`);
    return Promise.resolve(null);
  }
  const loading = (game.__venueSpotLoading = { id: venue.id });
  loading.done = build(game, venue, log, loading);
  return loading.done;
}

async function build(game, venue, log, loading) {
  let detail = null;
  try {
    const site = await SITES[venue.id]?.(), files = { ...DETAIL, ...site?.textures }, names = [...new Set(Object.values(files))];
    const [spot, ...textures] = await Promise.all([loadSpot(venue.id, { fetchBytes, decodeImage: decodeInBrowser }), ...names.map(detailTexture)]);
    detail = Object.fromEntries(Object.entries(files).map(([key, name]) => [key, textures[names.indexOf(name)]]));
    if (game.__venueSpotLoading !== loading) return null;
    const surf = site?.surfLines?.(spot) ?? spot.features.reefs;
    const map = waterMap(spot, 1024, surf), texture = new DataTexture(map.data, map.size, map.size);
    texture.magFilter = texture.minFilter = LinearFilter;
    texture.needsUpdate = true;
    // The satellite's picture for the water, its raw sRGB values as the
    // water shader works in them (no colour space, so no decoding).
    const { ground } = spot.images, colour = new DataTexture(ground.data, ground.width, ground.height);
    colour.magFilter = LinearFilter;
    colour.minFilter = LinearMipmapLinearFilter;
    colour.generateMipmaps = true;
    colour.needsUpdate = true;
    const group = new Group();
    group.name = `spot:${venue.id}`;
    group.add(buildTerrain(spot, detail, site?.ground), buildPlants(spot, { flora: site?.flora }), buildBuildings(spot, site?.buildings), buildSurf(spot, game.water.uniforms.uTime, surf));
    if (site?.sailors) group.add(buildSailors(site.sailors(spot), game.water.uniforms.uTime));
    if (site) {
      const { kit, finish } = landmarkKit();
      site.landmarks(kit, spot);
      group.add(finish());
    }
    const far = farWater(game.ocean);
    game.ocean.add(far);
    game.scene.add(group);
    game.__venueGameFar ??= game.camera.far;
    game.camera.far = FAR;
    game.camera.updateProjectionMatrix();
    Object.assign(game, { __venueSpot: spot, __venueSpotWater: { ...map, texture, colour }, __venueSpotGroup: group, __venueSpotFarWater: far });
    detail = null;
    return game.__venueSpotWater;
  } catch (error) {
    log(`could not build ${venue.name}; keeping the game's own scene`, error);
    if (game.__venueSpotLoading === loading) unmountSpot(game);
    return null;
  } finally {
    if (detail) for (const texture of new Set(Object.values(detail))) texture.dispose();
    if (game.__venueSpotLoading === loading) game.__venueSpotLoading = null;
  }
}

// Takes a spot out of the scene, with everything built for it, and gives
// the camera back the game's view; also stops one that is loading.
export function unmountSpot(game) {
  game.__venueSpotLoading = null;
  const group = game.__venueSpotGroup, textures = new Set();
  group?.removeFromParent();
  group?.traverse((object) => {
    object.geometry?.dispose();
    if (object.isInstancedMesh) object.dispose();
    for (const material of [object.material].flat().filter(Boolean)) {
      for (const value of [material.map, ...Object.values(material.userData.spotUniforms ?? {}).map((u) => u.value)]) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
  // The far water shares the game's own material, which stays.
  game.__venueSpotFarWater?.removeFromParent();
  game.__venueSpotFarWater?.geometry.dispose();
  game.__venueSpotWater?.texture.dispose();
  game.__venueSpotWater?.colour.dispose();
  if (game.__venueSpot && game.__venueGameFar) {
    game.camera.far = game.__venueGameFar;
    game.camera.updateProjectionMatrix();
  }
  Object.assign(game, { __venueSpot: null, __venueSpotWater: null, __venueSpotGroup: null, __venueSpotFarWater: null });
}
