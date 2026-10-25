// Gives the Champion's challenge its wind and its prize in the game.
// - The wind: the main page imports the game's 1v1 room wind as p; it gets a
//   p that passes the champion's rooms through wind.js (21 kt).
// - The Red Bull helmet: the look editor lists it once the Champion's challenge
//   is won, the game's look check keeps it on a rider (it keeps only values in
//   the lists), and the 3D rider draws it: the water helmet's shell in navy,
//   then the visor and logo from helmet.js.
// The minified names (p, c, f, vd, Z, ko, Ho, $i) are the 2026-10-24
// snapshot's; a game update that changes them makes these patches fail loudly.
const FROM = `from"/__mods/champion/helmet.js";`;
const PAGE = 'import{_ as l,c as u,d,g as f,h as p,s as m,t as h,u as g,v as _}from"./conditions-C2esDKY1.js"';
const APPEARANCE = "label:`Baseball cap`";
const RIDER = "t.name=`Helmet`";
const VISOR = "if(e===`red`){let e=new Z(new ko(1,20,10),n);e.name=`Helmet visor`,e.position.set(0,.095,.163),e.scale.set(.208,.018,.11),t.add(e)}";

export const patches = [
  {
    marker: PAGE,
    find: PAGE,
    replace: `${PAGE.replace("h as p,", "h as __championRoomConditions,")};import{roomWind as __championRoomWind}from"/__mods/champion/wind.js";function p(e){return __championRoomWind(e,__championRoomConditions(e))}`,
    expect: 1,
  },
  {
    marker: APPEARANCE,
    find: "{value:`cap`,label:`Baseball cap`}]",
    replace: "{value:`cap`,label:`Baseball cap`},{value:`redbull`,label:`Red Bull helmet`}]",
    expect: 1,
  },
  {
    marker: APPEARANCE,
    find: ":e===`facialHair`&&t.bodyType===`female`?c.facialHair.filter(({value:e})=>e===`none`):c[e]}",
    replace: ":e===`facialHair`&&t.bodyType===`female`?c.facialHair.filter(({value:e})=>e===`none`):e===`helmet`&&!__championHelmetWon()?c.helmet.filter(({value:e})=>e!==`redbull`):c[e]}",
    expect: 1,
  },
  {
    marker: APPEARANCE,
    find: "function f(e,t,n=!1){",
    replace: `import{helmetWon as __championHelmetWon}${FROM}function f(e,t,n=!1){`,
    expect: 1,
  },
  {
    marker: RIDER,
    find: "e===`red`?14887222:2438200",
    replace: "e===`red`?14887222:e===`redbull`?__championNavy:2438200",
    expect: 1,
  },
  {
    marker: RIDER,
    find: `${VISOR}return t}`,
    replace: `${VISOR}if(e===\`redbull\`)__championParts(t,{Mesh:Z,SphereGeometry:ko,Material:Ho,CanvasTexture:$i});return t}`,
    expect: 1,
  },
  {
    marker: RIDER,
    find: "function vd(e){",
    replace: `import{NAVY as __championNavy,addHelmetParts as __championParts}${FROM}function vd(e){`,
    expect: 1,
  },
];
