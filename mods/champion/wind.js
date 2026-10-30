// The Champion's challenge's wind: 21 kt by default, above the game's own 1v1
// rooms (15–19 kt), with each room's own gusts. The game gives a 1v1 room its
// wind from the room's id; a patch (patches.mjs) passes the champion's rooms
// through roomWind. His wind is data (server/champion.json, changeable in the
// developer panel): the server sails his heat in it, and the champion mod
// hands it to the game with setWind. Pure, so the server imports it too.

export const ROOM_PREFIX = "champion-";
export const WIND = { knots: 21, gustKnots: 6 };

let current = WIND;

// wind: { knots, gustKnots }, as GET /api/local/weekly answers.
export const setWind = (wind) => void (current = wind);

// conditions: the game's own wind for the room id.
export const roomWind = (id, conditions, wind = current) => (id.startsWith(ROOM_PREFIX) ? { ...conditions, knots: wind.knots } : conditions);
