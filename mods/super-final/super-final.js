// Pure helpers for the super final mod, shared with the tests. info is what
// GET /api/local/weekly returns.

// The game's own switch for its hidden gear, and the event it listens for.
export const HIDDEN_GEAR = { key: "fristajlo.hidden-gear", event: "fristajlo-hidden-gear-change" };
export const PRIZE_TEXT = "Unlocked: Severne Freek CC1 sail and Severne Psycho board";

const windText = (wind) => (wind.gustKnots ? `${wind.knots} kt, gusts ${wind.gustKnots}` : `${wind.knots} kt`);
export const menuLine = (info, division) => `This week: ${info.event.name} · vs ${info.divisions[division].pseudonym} · ${windText(info.wind)}`;
export const readyText = (pseudonym) => `Getting ${pseudonym} ready…`;
export const failedText = (pseudonym) => `Couldn't get ${pseudonym} ready. Press to try again.`;
export const doneText = (pseudonym) => `${pseudonym} has challenged you: accept to start the heat`;

// The division to show: the one chosen before if this week has it, else the
// first the event had.
export const pickDivision = (info, chosen) => (info.divisions[chosen] ? chosen : Object.keys(info.divisions)[0]);

// True when the prize is earned but the hidden gear isn't switched on yet.
export const prizeDue = (info, gearSetting) => info.prize && gearSetting !== "true";
