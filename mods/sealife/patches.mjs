// Hands the game's own wipe-out to mods: the engine's function for a landing
// that goes wrong (Xt(state, clean)) joins its exports as __seaWipeOut, so the
// whale can knock the rider over exactly as the game does. The minified names
// (Xt, ti, Sn) are the 2026-10-24 snapshot's; a game update that changes them
// makes this patch fail loudly.
export const patches = [
  { part: "engine", find: "export{ti as $,Sn as $t,", replace: "export{Xt as __seaWipeOut,ti as $,Sn as $t,", expect: 1 },
];
