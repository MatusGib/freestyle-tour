// The whitewater standing on a real-world spot's reef: a low ribbon along
// the reef line whose foam a shader draws, ragged at the top and pulsing as
// the swell runs into it. From the course the reef is 300–900 m away, where
// the water shader's foam on the surface is thinner than a pixel; breaking
// waves stand up out of the water, so they show.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial } from "../lib/three.core.min.js";

// Positions, uvs (u the metres along the line, v 0 at the foot and 1 at the
// top) and indices for ribbons along lines of [x, z] points.
export function surfRibbon(lines, { step = 3, height = 2.2, base = -0.3 } = {}) {
  const positions = [], uvs = [], indices = [];
  for (const line of lines) {
    const points = [];
    let along = 0;
    for (let k = 0; k + 1 < line.length; k++) {
      const [x1, z1] = line[k], [x2, z2] = line[k + 1], length = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(length / step));
      for (let s = k ? 1 : 0; s <= n; s++) points.push([x1 + ((x2 - x1) * s) / n, z1 + ((z2 - z1) * s) / n, along + (length * s) / n]);
      along += length;
    }
    const first = positions.length / 3;
    for (const [x, z, a] of points) {
      positions.push(x, base, z, x, height * (0.65 + 0.35 * Math.abs(Math.sin(a * 0.37) * Math.cos(a * 0.11))), z);
      uvs.push(a, 0, a, 1);
    }
    for (let k = 0; k + 1 < points.length; k++) {
      const a = first + 2 * k;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  return { positions: Float32Array.from(positions), uvs: Float32Array.from(uvs), indices: Uint32Array.from(indices) };
}

const SURF_GLSL = `
uniform float uTime;
varying vec2 vSurf;
float surfHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float surfNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(surfHash(i),surfHash(i+vec2(1,0)),f.x),mix(surfHash(i+vec2(0,1)),surfHash(i+vec2(1,1)),f.x),f.y);}`;

const SURF_MAIN = `
float surfPulse=.65+.35*smoothstep(.3,1.,sin(vSurf.x*.06-uTime*.9+surfNoise(vec2(vSurf.x*.02,0.))*5.));
float surfBody=surfNoise(vec2(vSurf.x*.25,vSurf.y*3.)-vec2(uTime*.6,uTime*.9))*.6+surfNoise(vec2(vSurf.x*.9,vSurf.y*8.)+uTime*1.3)*.4;
diffuseColor.a*=clamp((1.-smoothstep(.35,1.,vSurf.y+(surfBody-.5)*.5))*surfPulse,0.,1.);`;

// time: the water's uTime uniform, so the surf keeps the water's clock;
// lines: where it breaks, the spot's reefs unless its site says otherwise.
export function buildSurf(spot, time, lines = spot.features.reefs) {
  const { positions, uvs, indices } = surfRibbon(lines);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", () => "#include <common>\nvarying vec2 vSurf;")
      .replace("#include <begin_vertex>", () => "#include <begin_vertex>\nvSurf=uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", () => `#include <common>${SURF_GLSL}`)
      .replace("#include <alphamap_fragment>", () => `#include <alphamap_fragment>${SURF_MAIN}`);
  };
  material.customProgramCacheKey = () => "spot-surf";
  const mesh = new Mesh(geometry, material);
  mesh.name = "surf";
  mesh.matrixAutoUpdate = false;
  return mesh;
}
