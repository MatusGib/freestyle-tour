// Lets a venue change how the game's water and sky look (water.js sets them).
// - The water shader's fixed colours become uniforms, and it gains wind chop,
//   whitecaps that grow with the local wind, and a venue's shallows, sandbar
//   and shorebreak. Every new uniform starts at the value that reproduces the
//   game's own look, so nothing changes until a venue is chosen.
// - The water gets the heat's wind speed along with its gusts, and with it the
//   venue's waves (waves.js): the mesh gets twice the vertices, and the mesh
//   and the game's height function both add the waves and calm them on the
//   beach, so the water stays below the sand.
// - The sky dome's two colours become uniforms, it can draw clouds, and the
//   dome gets a name to find. The water's haze rate becomes a uniform too.
// - The Game class carries the CanvasTexture class, for the beach's sand.
// - The game's wind function adds the venue's wind zones (zones.js) carried in
//   the heat's conditions, and the water shows them. The local server applies
//   these patches to the AI's engine too, so it feels the same wind.
// The minified names (f, ve, r, n, j, k, h, O, E) are the 2026-10-24 snapshot's;
// a game update that changes them makes these patches fail loudly.
import { SHORE_GLSL, SPOT_GLSL, WAVE_GLSL } from "./waves.js";

const WATER = "uniform float uGustDrift;";
const HEIGHTS = "function j(e,t,n){return O.reduce(";
const FROM = 'from"/__mods/venues/waves.js";';
const ZONES = 'from"/__mods/venues/zones.js";';
const SKY = "varying vec3 vP;void main(){float h=normalize(vP).y;vec3 col=mix(vec3(.77,.87,.78),vec3(.91,.94,.81),smoothstep(0.,.65,h));gl_FragColor=vec4(col,1.);}";

// The sky's gradient as uniforms, and cloud drawn with fractal noise on a
// plane above the course: uCloud is how much of the sky it covers (0 is the
// game's clear sky), uCloudTint its colour.
const SKY_SHADER = "uniform vec3 uSkyLow;uniform vec3 uSkyHigh;uniform float uCloud;uniform vec3 uCloudTint;" +
  "float skyHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}" +
  "float skyNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(skyHash(i),skyHash(i+vec2(1,0)),f.x),mix(skyHash(i+vec2(0,1)),skyHash(i+vec2(1,1)),f.x),f.y);}" +
  "float skyFbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*skyNoise(p);p=p*2.03+1.7;a*=.5;}return v;}" +
  "varying vec3 vP;void main(){vec3 d=normalize(vP);float h=d.y;vec3 col=mix(uSkyLow,uSkyHigh,smoothstep(0.,.65,h));" +
  "if(uCloud>0.&&h>0.){vec2 uv=d.xz/(h+.12)*1.4;float c=skyFbm(uv);float cover=smoothstep(1.05-uCloud,1.2-uCloud,c)*smoothstep(0.,.15,h);" +
  "col=mix(col,uCloudTint*(.82+.3*skyFbm(uv*1.8+4.1)),cover*.92);}" +
  "gl_FragColor=vec4(col,1.);}";

// The game's own colours, as its shaders write them (sRGB, 0–1).
export const GAME_COLOURS = {
  deep: [.035, .43, .49], light: [.18, .70, .68], sky: [.72, .85, .75], haze: [.73, .85, .76],
  skyLow: [.77, .87, .78], skyHigh: [.91, .94, .81],
};
const glsl = (rgb) => `[${rgb.join(",")}]`;

// Sunlight focused by the ripples into a moving web of bright lines on a
// shallow sandy floor: a few rounds of the point swirled by sines, bright
// where the swirl folds.
const CAUSTIC_GLSL = "float spotCaustic(vec2 p,float t){vec2 q=p*1.5;float c=0.;for(int i=0;i<3;i++){q+=vec2(sin(q.y*1.3+t*.8),cos(q.x*1.1-t*.6))*.6;c+=abs(sin(q.x+q.y+t*.3))*.34;}return pow(clamp(1.-c,0.,1.),3.);}";

const UNIFORMS = `
uniform float uKnots;
uniform vec3 uDeep;
uniform vec3 uLight;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uHaze;
uniform float uChop;
uniform float uCaps;
uniform float uSurf;
uniform float uFogRate;
uniform vec4 uZone;
uniform vec4 uPatch;
uniform float uPatchGain;
uniform vec4 uShore;
uniform vec4 uCurve;
uniform vec4 uBar;
uniform vec3 uSeagrass;
uniform sampler2D uSpotColour;
uniform vec2 uSandFloor;
uniform float uMarks;
uniform float uCaustics;
${SHORE_GLSL}
${SPOT_GLSL}
${CAUSTIC_GLSL}`;

// Short crests across the wind (+x) that run downwind; shading only, like the
// game's own ripples, so the wave geometry and the rider are unchanged.
const CHOP = "float chop(vec2 p){vec2 q=p-vec2(uTime*2.4,0.);return (noise(q*vec2(.85,.4))-.5)*.55+(noise(q*vec2(2.,1.1)+3.7)-.5)*.3+sin(p.x*1.7+p.y*.5-uTime*4.2)*.06;}\n";

// off: metres out from the venue's curved shoreline (uShore: inland direction
// xy, shoreline distance z; uCurve: its bends). uBar: sandbar distance out, its
// width, the width of the shallows, how much the water inside the sandbar is
// sheltered. At a real-world spot (spotWater) the depth sets the colour
// instead: the floor shows through below about 7 m, and the satellite's
// picture of it (uSpotColour, its raw sRGB) says which floor it is: bright
// white sand as uShallow, the dark seagrass and channels as uSeagrass, by
// its lightness between uSandFloor's two values. Inside
// the reef the water is sheltered, and so is water in the lee of land, by
// how short its fetch is (spotLee); young waves there hardly break near the
// land and break more as the fetch grows. A wind patch's jet (uPatch) ruffles
// and whitens the water through the lee all the same.
const SHALLOWS = `
 float coast=step(1.,uShore.z);
 float off=shoreOff(p);
 float shallow=coast*(1.-smoothstep(uBar.z*.5,uBar.z+1.,off))*(.75+.25*noise(p*.035));
 float bar=coast*(1.-smoothstep(0.,uBar.y+1.,abs(off-uBar.x)));
 float shelter=coast*uBar.w*(1.-smoothstep(uBar.x-40.,uBar.x+5.,off));
 col=mix(col,uShallow*(.92+.16*n),clamp(max(shallow*.9,bar*.65),0.,1.));
 vec4 spot=spotWater(p);
 float spotDepth=max(spot.x,uSpotFloor);
 vec3 seen=texture(uSpotColour,(p+uSpotBox.x)/(2.*uSpotBox.x)).rgb;
 float sand=smoothstep(uSandFloor.x,uSandFloor.y,dot(seen,vec3(.3,.59,.11)));
 col=mix(col,mix(uSeagrass,uShallow,sand)*(.94+.12*n),spot.w*(1.-smoothstep(1.5,7.,spotDepth)));
 shelter=max(shelter,spot.w*uBar.w*(1.-smoothstep(3.,8.,spotDepth)));
 shelter=max(shelter,spot.w*(1.-sqrt(spotLee(p).x)));
 float young=mix(.08,1.,smoothstep(150.,2000.,spotFetch(p)));
 float jet=uPatchGain>0.?1.-smoothstep(.4,1.,length(vec2((p.x-uPatch.x)/(p.x>uPatch.x?uPatch.w:uPatch.z),(p.y-uPatch.y)/uPatch.z))):0.;
 shelter*=1.-.6*jet;
 young=max(young,.7*jet);`;

// The local wind, gusts included, drives the chop and the whitecaps. uZone is
// the heat's wind zones (zones.js zoneKnots, which the rider feels): uZone.x
// knots more from uZone.y m out over uZone.z m, and uZone.w knots less near
// the beach; stronger zones darken like a gust. uPatch is a spot's wind patch
// (zones.js patchKnots): where it starts (xy), how far across and upwind (z)
// and downwind (w) it reaches; uPatchGain its knots.
const LOCAL_WIND = `
 float zoneKnots=coast*(uZone.x*smoothstep(uZone.y,uZone.y+uZone.z+1.,off)-uZone.w*(1.-smoothstep(0.,90.,off)));
 zoneKnots+=uPatchGain*jet;
 gust=clamp(gust+max(0.,zoneKnots)/9.*mottle,0.,1.);
 float localKnots=uKnots+(uGustKnots>0.?shape*extra:0.)+zoneKnots;
 float choppy=uChop*(1.-shelter)*clamp((localKnots-8.)/12.,0.,1.8)*(1.-smoothstep(150.,600.,dist));`;

// First, at a real-world spot, sunlight rippling over the shallow floor near
// the camera (uCaustics), less where the surface mirrors the sky.
// Whitecaps cover W=3.84e-6*U^3.41 of the sea (Monahan and O'Muircheartaigh
// 1980, U in m/s): about 0.4% at 15 kt, 1.3% at 21 kt, 3.4% at 28 kt. Each
// 9 x 5 m cell may hold one breaking crest every 3.3 s, brightest at its
// downwind front, which spreads into lacy, fading foam; on average a crest whitens about 7%
// of its cell, which sets the chance. Far off the crests are smaller than a
// pixel, so the water there just pales by the cover. Above about 24 kt foam
// streaks run along the wind. Then the shorebreak, and waves breaking on the
// sandbar. At a real-world spot: a ragged white line on the reef, pulsing as
// the swell runs downwind across it, faint foam drifting behind it, and a
// little swash at the shore.
const WHITECAPS = `
 col+=uCaustics*spot.w*(1.-smoothstep(1.5,5.5,spotDepth))*(1.-smoothstep(12.,60.,dist))*(1.-fresnel)*spotCaustic(p+normal.xz*.8,uTime)*vec3(.85,1.,.95)*.4;
 float cover=uCaps*young*(1.-shelter*.8)*3.84e-6*pow(localKnots*.5144,3.41);
 vec2 cq=(p-vec2(uTime*1.8,0.))/vec2(9.,5.);
 vec2 cell=floor(cq);
 float cycle=uTime*.3+hash(cell+3.1);
 float life=fract(cycle);
 float on=step(hash(cell+floor(cycle)*1.7),cover/.07);
 vec2 at=(fract(cq)-.5-(vec2(hash(cell+11.),hash(cell+23.))*.3-.15))*vec2(9.,5.)/vec2(1.2+2.2*life,.6+.9*life);
 float ragged=length(at)+(noise(p*1.3)-.5)*.6+(noise(p*4.2)-.5)*.35;
 float lace=smoothstep(.2,.55,noise(p*2.4)+.45*(1.-life));
 float crest=on*(1.-smoothstep(.55,.95,ragged))*(1.-life*life)*mix(.45,1.,smoothstep(-1.,.6,at.x))*lace;
 float far=smoothstep(250.,600.,dist);
 float caps=cover>0.?crest*(1.-far)+cover*1.5*far+clamp((localKnots-24.)/6.,0.,1.)*.25*smoothstep(.7,.9,noise(cq*vec2(.27,3.75))):0.;
 float swash=smoothstep(.8,1.,sin(off*.45+uTime*1.5+noise(p*.04)*4.));
 caps+=coast*uSurf*(1.-smoothstep(3.,40.,off))*step(0.,off)*(swash*.8+.4*(1.-smoothstep(0.,5.,off)));
 caps+=bar*uSurf*.5*smoothstep(.85,1.,sin(off*.3+uTime*1.1+noise(p*.03)*5.));
 float reefCrest=spot.w*(1.-smoothstep(2.,12.,spot.y+(noise(p*.07)-.5)*9.));
 float swellPulse=smoothstep(.5,1.,sin(p.x*.09-uTime*1.05+noise(p*.02)*4.));
 float behindReef=spot.w*(1.-smoothstep(3.,8.,spotDepth))*(1.-smoothstep(8.,45.,spot.y));
 caps+=uSurf*(reefCrest*(.6+.4*swellPulse)*(.7+.3*noise(p*.3-vec2(uTime*.5,0.)))+behindReef*.18*smoothstep(.55,.85,noise(p*vec2(.08,.5)-vec2(uTime*.4,0.))));
 caps+=uSurf*.35*spot.w*(1.-smoothstep(1.,7.,spot.z))*smoothstep(.75,1.,sin(spot.z*.9+uTime*1.6+noise(p*.05)*4.));
 col=mix(col,vec3(.93,.96,.95),clamp(caps,0.,1.));`;

const DEFAULTS = [
  "uKnots:{value:18}",
  `uDeep:{value:${glsl(GAME_COLOURS.deep)}}`,
  `uLight:{value:${glsl(GAME_COLOURS.light)}}`,
  `uShallow:{value:${glsl(GAME_COLOURS.light)}}`,
  `uSky:{value:${glsl(GAME_COLOURS.sky)}}`,
  `uHaze:{value:${glsl(GAME_COLOURS.haze)}}`,
  "uChop:{value:0}", "uCaps:{value:0}", "uSurf:{value:0}", "uFogRate:{value:.0026}", "uZone:{value:[0,0,0,0]}", "uPatch:{value:[0,0,1,1]}", "uPatchGain:{value:0}",
  "uShore:{value:[0,0,0,0]}", "uCurve:{value:[0,0,0,0]}", "uBar:{value:[0,0,0,0]}",
  `uSeagrass:{value:${glsl(GAME_COLOURS.light)}}`, "uSpotWater:{value:null}", "uSpotBox:{value:[0,0,0,0]}", "uSpotFloor:{value:.8}", "uSpotFetch:{value:[1,1]}",
  "uSpotColour:{value:null}", "uSandFloor:{value:[.3,.75]}", "uMarks:{value:1}", "uCaustics:{value:0}",
  `uWave:{value:[${new Array(16).fill(0).join(",")}]}`,
].join(",");

export const patches = [
  { marker: WATER, find: "uniform float uGustPhase[${e}];", replace: "uniform float uGustPhase[${e}];" + UNIFORMS, expect: 1 },
  { marker: WATER, find: "float surface(vec2 p,float wrinkle){return waves(p)+wrinkle*(", replace: `${CHOP}float surface(vec2 p,float wrinkle,float c){return c*chop(p)+waves(p)+wrinkle*(`, expect: 1 },
  { marker: WATER, find: ",wrinkle)", replace: ",wrinkle,choppy)", expect: 3 },
  {
    marker: WATER,
    find: "vec3 col=mix(vec3(.035,.43,.49),vec3(.18,.70,.68),smoothstep(.16,1.1,n));",
    replace: `vec3 col=mix(uDeep,uLight,smoothstep(.16,1.1,n));${SHALLOWS}`,
    expect: 1,
  },
  { marker: WATER, find: "float wrinkle=gust*(1.-smoothstep(60.,260.,dist));", replace: `float wrinkle=gust*(1.-smoothstep(60.,260.,dist));${LOCAL_WIND}`, expect: 1 },
  { marker: WATER, find: "col=mix(col,vec3(.72,.85,.75),fresnel*", replace: "col=mix(col,uSky,fresnel*", expect: 1 },
  // uMarks scales the game's stylised crest lines and foam streaks.
  { marker: WATER, find: "col+=vec3(.13,.22,.15)*pow(1.-ridge,18.)*.42*patches*detailFade;", replace: "col+=vec3(.13,.22,.15)*pow(1.-ridge,18.)*.42*patches*detailFade*uMarks;", expect: 1 },
  { marker: WATER, find: "col+=vec3(.25,.3,.24)*foam*.24*patches*detailFade;", replace: `col+=vec3(.25,.3,.24)*foam*.24*patches*detailFade*uMarks;${WHITECAPS}`, expect: 1 },
  { marker: WATER, find: "col=mix(col,vec3(.73,.85,.76),fog);", replace: "col=mix(col,uHaze,fog);", expect: 1 },
  { marker: WATER, find: "float fog=1.-exp(-dist*.0026);", replace: "float fog=1.-exp(-dist*uFogRate);", expect: 1 },
  { marker: WATER, find: "uGustPhase:{value:Array.from({length:e},()=>0)}}", replace: `uGustPhase:{value:Array.from({length:e},()=>0)},${DEFAULTS}}`, expect: 1 },
  { marker: WATER, find: "r.uGustKnots.value=n.gustKnots", replace: "r.uKnots.value=n.knots,r.uWave.value=__venueSetKnots(n.knots),r.uZone.value=__venueZoneUniform(n.zones),r.uPatch.value=__venuePatchUniform(n.zones),r.uPatchGain.value=n.zones?.patch?.gain??0,r.uGustKnots.value=n.gustKnots", expect: 1 },
  { marker: WATER, find: "function Z(e,n){", replace: `import{setKnots as __venueSetKnots}${FROM}import{zoneUniform as __venueZoneUniform,patchUniform as __venuePatchUniform}${ZONES}function Z(e,n){`, expect: 1 },
  { marker: WATER, find: "new h(O,O,180,180)", replace: "new h(O,O,360,360)", expect: 1 },
  {
    marker: HEIGHTS,
    find: "function j(e,t,n){return O.reduce((r,i)=>r+Math.sin(e*i.x+t*i.z+n*i.speed)*i.amplitude,0)}",
    replace: `import{venueWater as __venueWater}${FROM}function j(e,t,n){return __venueWater(e,t,n,O.reduce((r,i)=>r+Math.sin(e*i.x+t*i.z+n*i.speed)*i.amplitude,0))}`,
    expect: 1,
  },
  { marker: HEIGHTS, find: "let a=k/180", replace: "let a=k/360", expect: 1 },
  {
    marker: HEIGHTS,
    find: "varying vec3 vWorld;\nvoid main(){\n vec4 world=modelMatrix*vec4(position,1.);",
    replace: `varying vec3 vWorld;${WAVE_GLSL}\nvoid main(){\n vec4 world=modelMatrix*vec4(position,1.);`,
    expect: 1,
  },
  { marker: HEIGHTS, find: " vWorld=world.xyz;\n", replace: " world.y=venueWater(world.xz,world.y);\n vWorld=world.xyz;\n", expect: 1 },
  {
    marker: SKY,
    find: SKY,
    replace: SKY_SHADER,
    expect: 1,
  },
  {
    marker: SKY,
    find: "new _({side:1,depthTest:!1,depthWrite:!1,vertexShader:",
    replace: `new _({uniforms:{uSkyLow:{value:${glsl(GAME_COLOURS.skyLow)}},uSkyHigh:{value:${glsl(GAME_COLOURS.skyHigh)}},uCloud:{value:0},uCloudTint:{value:[1,1,1]}},side:1,depthTest:!1,depthWrite:!1,vertexShader:`,
    expect: 1,
  },
  { marker: SKY, find: "e.renderOrder=-1,e.frustumCulled=!1", replace: 'e.name="sky",e.renderOrder=-1,e.frustumCulled=!1', expect: 1 },
  { part: "scene", find: "export{ve as Game}", replace: "ve.three={CanvasTexture:f};export{ve as Game}", expect: 1 },
  {
    part: "wind",
    find: "function O(e,t,n,r){return e.knots+Math.sin(r*.17)*1.7+Math.sin(r*.63)*.6+E(e,t,n,r)}",
    replace: `import{zoneKnots as __venueZoneKnots}${ZONES}function O(e,t,n,r){return e.knots+Math.sin(r*.17)*1.7+Math.sin(r*.63)*.6+E(e,t,n,r)+__venueZoneKnots(e.zones,t,n)}`,
    expect: 1,
  },
];
