// Marks the in-game key guide, proving serve-time patches reach the game.
// Menu text isn't used: it is also in the server-rendered page, and changing
// it only in the module would cause a hydration mismatch.
export const patches = [
  {
    marker: "Same keys in the air",
    find: "Same keys in the air",
    replace: "Same keys in the air · local",
    expect: 1,
  },
];
