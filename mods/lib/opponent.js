// The game draws one opponent. Mods that want it take turns: the one holding
// the slot shows its rider, and the others leave the opponent display alone.
let owner = null;

// True when who now holds the slot (or already did).
export function claimOpponent(who) {
  if (owner && owner !== who) return false;
  owner = who;
  return true;
}

export function releaseOpponent(who) {
  if (owner === who) owner = null;
}

export const opponentOwner = () => owner;
