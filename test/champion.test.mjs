import { test } from "node:test";
import assert from "node:assert/strict";
import { TITLE, bestText, failedText, heatText, menuLine, newWin, prizeDue, raceText, readyText, winText } from "../mods/champion/champion.js";
import { WIND, roomWind, setWind } from "../mods/champion/wind.js";

const info = {
  event: { id: "2025-sylt", name: "2025 Sylt Grand Slam" },
  opponent: { name: "Lennart Neubauer", target: 45.5 },
  wind: WIND,
  best: null,
  won: false,
  lastWin: null,
  prize: false,
};

test("the menu line names the event, the champion and the wind, as the game writes gusts", () => {
  assert.equal(TITLE, "Champion's challenge");
  assert.equal(menuLine(info), "This week: 2025 Sylt Grand Slam · vs Lennart Neubauer · 21 kt, gusts 23–27 kt");
  assert.equal(menuLine({ ...info, wind: { knots: 17, gustKnots: 0 } }), "This week: 2025 Sylt Grand Slam · vs Lennart Neubauer · 17 kt");
});

test("the champion's rooms get 21 kt with their own gusts; other rooms keep the game's wind", () => {
  const game = { seed: 7, knots: 16, gustKnots: 6 };
  assert.deepEqual(roomWind("champion-2025-sylt-1-3", game), { seed: 7, knots: 21, gustKnots: 6 });
  assert.deepEqual(roomWind("a-real-1v1-room", game), game);
});

test("the button's and card's other lines", () => {
  assert.equal(raceText("Lennart Neubauer"), "Race Lennart Neubauer");
  assert.equal(readyText("Lennart Neubauer"), "Getting Lennart Neubauer ready…");
  assert.equal(failedText("Lennart Neubauer"), "Couldn't get Lennart Neubauer ready. Press to try again.");
  assert.equal(heatText(info), "Your heat: Lennart Neubauer at his best, scoring around 45 points, in 21 kt, gusts 23–27 kt.");
  assert.equal(bestText(info), "No heat against him this week yet.");
  assert.equal(bestText({ ...info, best: 41.5 }), "Your best this week: 41.50.");
  assert.equal(bestText({ ...info, best: 48.1, won: true }), "Your best this week: 48.10, and you beat him.");
});

test("a win is new until the mod has congratulated you on it, and names the event when it's this week's", () => {
  const won = { ...info, lastWin: { at: 20, event: "2025-sylt", score: 48.1, opponentScore: 46.74 } };
  assert.equal(newWin(info, null), false);
  assert.equal(newWin(won, null), true);
  assert.equal(newWin(won, "20"), false);
  assert.equal(winText(won), "You beat Lennart Neubauer at the 2025 Sylt Grand Slam, 48.10 to 46.74.");
  assert.equal(winText({ ...won, lastWin: { ...won.lastWin, event: "2023-sylt" } }), "You beat Lennart Neubauer, 48.10 to 46.74.");
});

test("the prize is due when earned and not yet unlocked in this browser", () => {
  assert.equal(prizeDue({ ...info, prize: true }, null), true);
  assert.equal(prizeDue({ ...info, prize: true }, "true"), false);
  assert.equal(prizeDue(info, null), false);
});

test("the champion's wind can be changed, for the game and for the server", () => {
  const game = { seed: 7, knots: 16, gustKnots: 4 };
  assert.deepEqual(roomWind("champion-x-1-2", game, { knots: 25, gustKnots: 4 }), { seed: 7, knots: 25, gustKnots: 4 });
  setWind({ knots: 14, gustKnots: 0 });
  assert.equal(roomWind("champion-x-1-2", game).knots, 14);
  setWind(WIND);
  assert.equal(roomWind("champion-x-1-2", game).knots, 21);
});
