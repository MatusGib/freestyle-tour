// A real-world spot's land and seabed as three square rings of decreasing
// detail: inner (±800 m, 5 m), middle (±2500 m, 20 m), horizon (±12500 m,
// 100 m). Each ring leaves its inner square open; skirts hang below the edges
// to hide cracks. The land shows the satellite colour; up close, photo-scanned
// detail textures (assets/textures/) add their grain to it by ground type.
// Everything under the water is skipped: the water is opaque, and with the far
// view the seabed would flicker through it. Built on the vendored three.js
// r185, which the game's renderer draws (see the plan's Task 1 findings).
import {
  BufferAttribute, BufferGeometry, Color, DataTexture, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial, SRGBColorSpace,
} from "../lib/three.core.min.js";
import { fillPolygons, imagePoint } from "./raster.js";

export const RINGS = [{ outer: 800, inner: 0, step: 5 }, { outer: 2500, inner: 800, step: 20 }, { outer: 12500, inner: 2500, step: 100 }];

// Positions (x, y, z), uvs over the spot's detail or horizon square, and
// indices for the ring between `inner` and `outer`.
export function ringGeometry({ outer, inner, step, heightAt, skirt = 3, uvHalf = outer }) {
  const n = Math.round((2 * outer) / step) + 1, positions = [], uvs = [], indices = [], index = new Int32Array(n * n).fill(-1);
  const inside = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < inner - 1e-9;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -outer + i * step, z = -outer + j * step;
    index[j * n + i] = positions.length / 3;
    positions.push(x, heightAt(x, z), z);
    uvs.push((x + uvHalf) / (2 * uvHalf), (z + uvHalf) / (2 * uvHalf));
  }
  for (let j = 0; j + 1 < n; j++) for (let i = 0; i + 1 < n; i++) {
    const x = -outer + (i + 0.5) * step, z = -outer + (j + 0.5) * step;
    if (inside(x, z)) continue;
    const a = index[j * n + i], b = index[j * n + i + 1], c = index[(j + 1) * n + i], d = index[(j + 1) * n + i + 1];
    indices.push(a, c, b, b, c, d);
  }
  // Skirts: along the inner edge, a strip dropping `skirt` metres.
  if (inner > 0) {
    for (const edge of [[-inner, -inner, inner, -inner], [inner, -inner, inner, inner], [inner, inner, -inner, inner], [-inner, inner, -inner, -inner]]) {
      const [x1, z1, x2, z2] = edge, count = Math.round(Math.hypot(x2 - x1, z2 - z1) / step);
      for (let k = 0; k < count; k++) {
        const ax = x1 + ((x2 - x1) * k) / count, az = z1 + ((z2 - z1) * k) / count, bx = x1 + ((x2 - x1) * (k + 1)) / count, bz = z1 + ((z2 - z1) * (k + 1)) / count;
        const base = positions.length / 3;
        for (const [x, z, drop] of [[ax, az, 0], [bx, bz, 0], [ax, az, skirt], [bx, bz, skirt]]) {
          positions.push(x, heightAt(x, z) - drop, z);
          uvs.push((x + uvHalf) / (2 * uvHalf), (z + uvHalf) / (2 * uvHalf));
        }
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }
  return { positions: Float32Array.from(positions), uvs: Float32Array.from(uvs), indices: Uint32Array.from(indices) };
}

// How much of each detail texture shows at each pixel over ±half: R sand
// (the mapped beaches, and sand or the water's edge in the ground types), G
// coral rubble, B rock, A mangrove mud; scrub soil is what's left. RGBA bytes,
// row 0 at -z. The beaches come from features.beaches, since at 9.8 m pixels
// the ground types barely see them.
export function groundWeights(spot, half, size) {
  const { water, drySand, wetSand, coralRubble, rock, mangrove } = spot.manifest.ground;
  const beach = fillPolygons(spot.features.beaches, half, size), weights = new Uint8Array(size * size * 4);
  const channel = { [water]: 0, [drySand]: 0, [wetSand]: 0, [coralRubble]: 1, [rock]: 2, [mangrove]: 3 };
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const p = j * size + i, { x, z } = imagePoint(i, j, half, size);
    const c = beach[p] ? 0 : channel[spot.groundAt(x, z)];
    if (c !== undefined) weights[p * 4 + c] = 255;
  }
  return weights;
}

// The loaded image (RGB or RGBA) as a colour texture with mipmaps.
function colourTexture(image) {
  let data = image.data;
  if (image.channels !== 4) {
    data = new Uint8Array(image.width * image.height * 4);
    for (let p = 0; p < image.width * image.height; p++) {
      for (let c = 0; c < 3; c++) data[p * 4 + c] = image.data[p * image.channels + Math.min(c, image.channels - 1)];
      data[p * 4 + 3] = 255;
    }
  }
  const texture = new DataTexture(data, image.width, image.height);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

const UNDER_WATER = "if(vSpotWorld.y<-.05)discard;";

// Shared by both materials: the world position, and skipping the seabed.
function patchWorld(shader) {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", () => "#include <common>\nvarying vec3 vSpotWorld;")
    .replace("#include <project_vertex>", () => "#include <project_vertex>\nvSpotWorld=(modelMatrix*vec4(transformed,1.)).xyz;");
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", () => "#include <common>\nvarying vec3 vSpotWorld;");
}

// Detail: each texture's grain (its brightness against its own average, at
// two scales mixed by noise so it doesn't visibly repeat) brightens or
// darkens the satellite colour, fading out by about 300 m. The beaches turn
// towards white coral sand, darker where the sand is wet.
const DETAIL_GLSL = `
uniform sampler2D uWeights;
uniform float uWeightsHalf;
uniform sampler2D uSand;
uniform sampler2D uCoral;
uniform sampler2D uSoil;
uniform sampler2D uRock;
uniform sampler2D uMud;
uniform vec4 uSizes;
uniform float uSoilSize;
uniform vec3 uSandColour;
uniform float uDetail;
float spotHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float spotNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(spotHash(i),spotHash(i+vec2(1,0)),f.x),mix(spotHash(i+vec2(0,1)),spotHash(i+vec2(1,1)),f.x),f.y);}
float spotLum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float spotGrain(sampler2D t,vec2 p,float size,float contrast,float fine,float coarse){
 float mean=max(spotLum(textureLod(t,vec2(.5),12.).rgb),.02);
 float a=spotLum(texture(t,p/size).rgb)/mean;
 float b=spotLum(texture(t,mat2(.8,-.6,.6,.8)*p/(size*7.3)+.37).rgb)/mean;
 return pow(mix(1.,a,fine)*mix(1.,b,coarse),contrast);
}`;

const DETAIL_MAIN = `
${UNDER_WATER}
float spotDistance=distance(cameraPosition,vSpotWorld);
float spotFade=1.-smoothstep(120.,320.,spotDistance);
float spotFine=1.-smoothstep(15.,60.,spotDistance);
vec2 spotP=vSpotWorld.xz;
vec2 spotWobble=vec2(spotNoise(spotP*.07),spotNoise(spotP*.07+7.3))-.5;
vec4 spotW=texture(uWeights,(spotP+spotWobble*9.+uWeightsHalf)/(2.*uWeightsHalf));
float spotSoil=max(0.,1.-spotW.r-spotW.g-spotW.b-spotW.a);
diffuseColor.rgb=mix(diffuseColor.rgb,uSandColour*diffuse,spotW.r*.6);
diffuseColor.rgb*=1.-.35*spotW.r*(1.-smoothstep(.05,.45,vSpotWorld.y));
if(spotFade>0.){
 float coarse=.4+.6*smoothstep(.25,.75,spotNoise(spotP*.05));
 float grain=0.;
 if(spotW.r>.01)grain+=spotW.r*spotGrain(uSand,spotP,uSizes.x,2.5,spotFine,coarse);
 if(spotW.g>.01)grain+=spotW.g*spotGrain(uCoral,spotP,uSizes.y,1.,spotFine,coarse);
 if(spotW.b>.01)grain+=spotW.b*spotGrain(uRock,spotP,uSizes.z,1.,spotFine,coarse);
 if(spotW.a>.01)grain+=spotW.a*spotGrain(uMud,spotP,uSizes.w,1.,spotFine,coarse);
 if(spotSoil>.01)grain+=spotSoil*spotGrain(uSoil,spotP,uSoilSize,1.,spotFine,coarse);
 diffuseColor.rgb*=mix(1.,grain,spotFade*uDetail);
}`;

// The real size, in metres, each detail texture covers (assets/textures/CREDITS.md).
const SIZES = { sand: 2, coralRubble: 2, scrubSoil: 3, rock: 2, mangroveMud: 1.3 };
// The satellite's colours are already lit by the sun; the game's lights light
// them again, so they are dimmed to keep them from washing out.
const LAND_TINT = 0.55;

function detailMaterial(map, weights, half, detail, sand) {
  const material = new MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
  material.color.setScalar(LAND_TINT);
  const uniforms = {
    uWeights: { value: weights }, uWeightsHalf: { value: half },
    uSand: { value: detail.sand }, uCoral: { value: detail.coralRubble }, uSoil: { value: detail.scrubSoil }, uRock: { value: detail.rock }, uMud: { value: detail.mangroveMud },
    uSizes: { value: [SIZES.sand, SIZES.coralRubble, SIZES.rock, SIZES.mangroveMud] }, uSoilSize: { value: SIZES.scrubSoil },
    uSandColour: { value: new Color(sand) }, uDetail: { value: 0.8 },
  };
  material.onBeforeCompile = (shader) => {
    patchWorld(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", () => `#include <common>${DETAIL_GLSL}`)
      .replace("#include <map_fragment>", () => `#include <map_fragment>${DETAIL_MAIN}`);
  };
  material.customProgramCacheKey = () => "spot-terrain-detail";
  material.userData.spotUniforms = uniforms;
  return material;
}

function farMaterial(map) {
  const material = new MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
  material.color.setScalar(LAND_TINT);
  material.onBeforeCompile = (shader) => {
    patchWorld(shader);
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", () => `#include <map_fragment>\n${UNDER_WATER}`);
  };
  material.customProgramCacheKey = () => "spot-terrain-far";
  return material;
}

function ringMesh(ring, spot, uvHalf, material) {
  const { positions, uvs, indices } = ringGeometry({ ...ring, heightAt: spot.heightAt, uvHalf });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// detail: { sand, coralRubble, scrubSoil, rock, mangroveMud } textures
// (repeating, sRGB, with mipmaps); sand: the colour the beaches turn towards
// (Bonaire's white coral sand by default). Returns the terrain's group.
export function buildTerrain(spot, detail, { sand = "#ece3cf" } = {}) {
  const { detail: near, horizon } = spot.manifest;
  const weightsSize = 1024;
  const weights = new DataTexture(groundWeights(spot, near.half, weightsSize), weightsSize, weightsSize);
  weights.magFilter = LinearFilter;
  weights.minFilter = LinearFilter;
  weights.needsUpdate = true;
  const nearMaterial = detailMaterial(colourTexture(spot.images.ground), weights, near.half, detail, sand);
  const group = new Group();
  group.name = "terrain";
  group.add(
    ringMesh(RINGS[0], spot, near.half, nearMaterial),
    ringMesh(RINGS[1], spot, near.half, nearMaterial),
    ringMesh(RINGS[2], spot, horizon.half, farMaterial(colourTexture(spot.images.horizonColour))),
  );
  return group;
}
