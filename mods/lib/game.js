// Finds the running game object (kept in a React ref next to the canvas, as
// the Freestajlo bot found it) and lets mods run code on every physics step.

export function findGame() {
  for (const canvas of document.querySelectorAll("canvas")) {
    for (let el = canvas, depth = 0; el && depth < 6; el = el.parentElement, depth++) {
      const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
      for (let f = key && el[key], up = 0; f && up < 40; f = f.return, up++) {
        for (let h = f.memoizedState, i = 0; h && i < 80; h = h.next, i++) {
          const cur = h.memoizedState?.current;
          if (cur?.controls && cur.state && typeof cur.setKey === "function") return cur;
        }
      }
    }
  }
  return null;
}

export function whenGame(interval = 250) {
  return new Promise((resolve) => {
    const check = () => {
      const game = findGame();
      if (game) resolve(game);
      else setTimeout(check, interval);
    };
    check();
  });
}

// The game calls controls.read(state) once per physics step and uses the input
// it returns. Wrapping it once lets any number of hooks see each step.
const hooks = [];
let wrapped = null;

export function onStep(game, fn) {
  hooks.push(fn);
  if (wrapped === game.controls) return;
  wrapped = game.controls;
  const read = game.controls.read;
  game.controls.read = function (state) {
    const input = read.call(this, state);
    for (const hook of hooks) hook(state, input);
    return input;
  };
}
