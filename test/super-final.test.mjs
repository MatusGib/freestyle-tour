import { test } from "node:test";
import assert from "node:assert/strict";
import { HIDDEN_GEAR, PRIZE_TEXT, doneText, failedText, menuLine, pickDivision, prizeDue, readyText } from "../mods/super-final/super-final.js";

const info = {
  event: { name: "2019 Mercedes-Benz World Cup Sylt" },
  divisions: { men: { pseudonym: "Amada Vryeswijk", average: 42.51 }, women: { pseudonym: "Sarah-Quito Uffringa", average: 49.1 } },
  wind: { knots: 17, gustKnots: 0 },
  prize: false,
};

test("the menu line names the event, the opponent and the wind", () => {
  assert.equal(menuLine(info, "men"), "This week: 2019 Mercedes-Benz World Cup Sylt · vs Amada Vryeswijk · 17 kt");
  assert.equal(menuLine({ ...info, wind: { knots: 19, gustKnots: 5 } }, "women"), "This week: 2019 Mercedes-Benz World Cup Sylt · vs Sarah-Quito Uffringa · 19 kt, gusts 5");
});

test("the button's other lines", () => {
  assert.equal(readyText("Amada Vryeswijk"), "Getting Amada Vryeswijk ready…");
  assert.equal(doneText("Amada Vryeswijk"), "Amada Vryeswijk has challenged you: accept to start the heat");
  assert.equal(failedText("Amada Vryeswijk"), "Couldn't get Amada Vryeswijk ready. Press to try again.");
  assert.equal(PRIZE_TEXT, "Unlocked: Severne Freek CC1 sail and Severne Psycho board");
});

test("the division is the one chosen before, if this week's event had it", () => {
  assert.equal(pickDivision(info, "women"), "women");
  assert.equal(pickDivision({ ...info, divisions: { men: info.divisions.men } }, "women"), "men");
});

test("the prize is due when earned and the game's hidden gear isn't on yet", () => {
  assert.deepEqual(HIDDEN_GEAR, { key: "fristajlo.hidden-gear", event: "fristajlo-hidden-gear-change" });
  assert.equal(prizeDue({ ...info, prize: true }, null), true);
  assert.equal(prizeDue({ ...info, prize: true }, "true"), false);
  assert.equal(prizeDue(info, null), false);
});
