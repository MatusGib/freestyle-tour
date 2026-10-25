// Pure helpers for the Champion's challenge mod, shared with the tests. info is
// what GET /api/local/weekly returns.

export const TITLE = "Champion's challenge";
// The last win the mod congratulated you on (its time).
export const SEEN_KEY = "freestyle-tour.champion-seen-win";

// As the game writes it: gusts from 2 kt above the wind up to gustKnots above.
export const windText = (wind) => (wind.gustKnots ? `${wind.knots} kt, gusts ${wind.knots + 2}–${wind.knots + wind.gustKnots} kt` : `${wind.knots} kt`);
export const menuLine = (info) => `This week: ${info.event.name} · vs ${info.opponent.name} · ${windText(info.wind)}`;
export const readyText = (name) => `Getting ${name} ready…`;
export const failedText = (name) => `Couldn't get ${name} ready. Press to try again.`;
export const doneText = (name) => `${name} has challenged you: accept to start the heat`;
// The AI lands about half a point under its target in the champion's wind.
export const heatText = ({ opponent, wind }) => `Your heat: ${opponent.name} at his best, scoring around ${Math.round(opponent.target - 0.5)} points, in ${windText(wind)}.`;
export const bestText = (info) => (info.best === null ? "No heat against him this week yet." : `Your best this week: ${info.best.toFixed(2)}${info.won ? ", and you beat him" : ""}.`);

// A win the mod hasn't congratulated you on yet.
export const newWin = (info, seenAt) => !!info.lastWin && info.lastWin.at > Number(seenAt ?? 0);

export function winText({ lastWin, event, opponent }) {
  const where = lastWin.event === event.id ? ` at the ${event.name}` : "";
  return `You beat ${opponent.name}${where}, ${lastWin.score.toFixed(2)} to ${lastWin.opponentScore.toFixed(2)}.`;
}

// The prize is due when earned and not yet unlocked in this browser.
export const prizeDue = (info, setting) => info.prize && setting !== "true";
