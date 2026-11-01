// The waves a venue adds to the game's own two long ones, and how they die out
// on its beach. The patched water mesh (WAVE_GLSL, in patches.mjs) and the
// game's height function, which floats the rider, buoys and wake, both use
// them, so the rider stays on the drawn surface. The game's physics never
// read the waves. Without a venue nothing is added.
import { bilinear } from "./realworld/raster.js";

const G = 9.81;
const KNOT = .5144;
// The water mesh has a vertex every 7.2 m (2600 m / 360), so shorter waves
// would wobble as the mesh follows the rider; the fragment chop draws those.
const SHORTEST = 30;

const state = { sea: null, knots: 18, waves: new Array(16).fill(0), shore: [0, 0, 0, 0], curve: [0, 0, 0, 0], bar: [0, 0, 0, 0], surf: 0, spot: null };

// A fetch-limited wind sea (JONSWAP): Hs = 1.6e-3·U·√(F/g) and
// Tp = 0.286·U/g·(gF/U²)^⅓, with U in m/s and the fetch F in m, capped at a
// fully developed sea (Hs = 0.22·U²/g). 17 kt over 60 km gives about 1.1 m
// waves 40 m long; 19 kt over 40 km about 1.0 m and 32 m.
export function windSea(knots, fetch) {
  const u = knots * KNOT;
  const height = Math.min(1.6e-3 * u * Math.sqrt(fetch / G), .22 * u * u / G);
  const period = .286 * u / G * Math.cbrt(G * fetch / (u * u));
  return { height, length: G * period * period / (2 * Math.PI) };
}

// One wave: [kx, kz, phase speed term, amplitude], running along angle (0 is
// downwind, +x) in deep water.
const wave = (length, angle, amplitude) => {
  const k = 2 * Math.PI / Math.max(SHORTEST, length);
  return [k * Math.cos(angle), k * Math.sin(angle), -Math.sqrt(G * k), amplitude];
};

function build() {
  const { sea, knots } = state;
  if (!sea) return new Array(16).fill(0);
  const { height, length } = windSea(knots, sea.fetch);
  // Three crests spread around the wind; their heights add up to about Hs.
  const a = height / 4.9;
  const swellAngle = Math.atan2(sea.inZ, sea.inX);
  return [
    ...wave(length, 0, a),
    ...wave(length * .8, .45, a * .8),
    ...wave(length * 1.3, -.35, a * .9),
    ...wave(sea.swell.length, swellAngle, sea.swell.height / 2),
  ];
}

// sea: { fetch, swell: { length, height }, inX, inZ, shoreline, curve: [a1, f1,
// a2, f2], bar: [distance, width, shallows, shelter], surf } or null.
export function setSea(sea) {
  state.sea = sea;
  state.shore = sea ? [sea.inX, sea.inZ, sea.shoreline, 0] : [0, 0, 0, 0];
  state.curve = sea ? sea.curve : [0, 0, 0, 0];
  state.bar = sea ? sea.bar : [0, 0, 0, 0];
  state.surf = sea ? sea.surf : 0;
  state.waves = build();
}

// The game's conditions set the wind; returns the waves for the shader.
export function setKnots(knots) {
  state.knots = knots;
  state.waves = build();
  return state.waves;
}

export const currentWaves = () => state.waves;

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Metres out from the venue's curved shoreline.
export function shoreOffset(x, z, shore = state.shore, curve = state.curve) {
  const s = -shore[1] * x + shore[0] * z;
  return shore[2] + Math.sin(s * curve[1]) * curve[0] + Math.sin(s * curve[3] + .7) * curve[2] - (shore[0] * x + shore[1] * z);
}

// A real-world spot's water map (realworld/spot.js waterMap), or null.
export function setSpotWater(map) {
  state.spot = map;
}

// How much of the waves a spot's water lets through at (x, z): all on the
// open sea, about 15% in the lagoon, none at the shore. Keep in step with
// SPOT_GLSL.
export function spotWaves(x, z, map = state.spot) {
  if (!map) return 1;
  const u = ((x + map.half) * map.size) / (2 * map.half) - .5, v = ((z + map.half) * map.size) / (2 * map.half) - .5;
  if (u < -.5 || v < -.5 || u > map.size - .5 || v > map.size - .5) return 1;
  const depth = Math.max((bilinear(map.data, map.size, map.size, u, v, 4, 0) / 255) * map.depthMax, map.floor);
  const shore = (bilinear(map.data, map.size, map.size, u, v, 4, 2) / 255) * map.distanceMax;
  return (.15 + .85 * smoothstep(2, 8, depth)) * smoothstep(0, 10, shore);
}

// The game's height at (x, z) at time t, base, with the venue's waves added.
// Keep in step with WAVE_GLSL.
export function venueWater(x, z, t, base) {
  const { waves, shore, bar, surf } = state;
  let h = base;
  for (let i = 0; i < 16; i += 4) h += Math.sin(x * waves[i] + z * waves[i + 1] + t * waves[i + 2]) * waves[i + 3];
  if (state.spot) return h * spotWaves(x, z);
  if (shore[2] < 1) return h;
  const off = shoreOffset(x, z);
  // Calm inside a sheltering sandbar; waves rise a little as they reach
  // shallow water, then die on the beach, whose water stays below the sand.
  const calm = 1 - bar[3] * (1 - smoothstep(bar[0] - 40, bar[0] + 5, off));
  const shoal = 1 + .5 * surf * smoothstep(15, 30, off) * (1 - smoothstep(30, 70, off));
  const beach = smoothstep(0, 25, off);
  return h * calm * shoal * (.2 + .8 * beach) - (1 - beach) * .25;
}

// shoreOffset in GLSL; needs uShore and uCurve declared.
export const SHORE_GLSL = "float shoreOff(vec2 p){float s=dot(p,vec2(-uShore.y,uShore.x));return uShore.z+sin(s*uCurve.y)*uCurve.x+sin(s*uCurve.w+.7)*uCurve.z-dot(p,uShore.xy);}";

// A spot's water map in GLSL: uSpotBox is its half extent, 1 when in use,
// and the metres a whole byte of depth and of distance stand for.
// spotWater(p): x the measured depth, y the distance to the reef, z to the
// shore, w 1 inside the map (outside it, open sea).
export const SPOT_GLSL = `uniform sampler2D uSpotWater;
uniform vec4 uSpotBox;
uniform float uSpotFloor;
vec4 spotWater(vec2 p){
 vec2 uv=(p+uSpotBox.x)/(2.*uSpotBox.x);
 if(uSpotBox.y<.5||uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return vec4(uSpotBox.z,1e3,1e3,0.);
 vec4 m=textureLod(uSpotWater,uv,0.);
 return vec4(m.r*uSpotBox.z,m.g*uSpotBox.w,m.b*uSpotBox.w,1.);
}
float spotWaves(vec2 p){
 vec4 s=spotWater(p);
 if(s.w<.5)return 1.;
 return (.15+.85*smoothstep(2.,8.,max(s.x,uSpotFloor)))*smoothstep(0.,10.,s.z);
}`;

export const WAVE_GLSL = `
uniform vec4 uWave[4];
uniform vec4 uShore;
uniform vec4 uCurve;
uniform vec4 uBar;
uniform float uSurf;
${SHORE_GLSL}
${SPOT_GLSL}
float venueWater(vec2 p,float y){
 float h=y;
 for(int i=0;i<4;i++)h+=sin(dot(p,uWave[i].xy)+uTime*uWave[i].z)*uWave[i].w;
 if(uSpotBox.y>.5)return h*spotWaves(p);
 if(uShore.z<1.)return h;
 float off=shoreOff(p);
 float calm=1.-uBar.w*(1.-smoothstep(uBar.x-40.,uBar.x+5.,off));
 float shoal=1.+.5*uSurf*smoothstep(15.,30.,off)*(1.-smoothstep(30.,70.,off));
 float beach=smoothstep(0.,25.,off);
 return h*calm*shoal*(.2+.8*beach)-(1.-beach)*.25;
}`;
