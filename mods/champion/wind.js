// The Champion's challenge's wind: 21 kt, above the game's own 1v1 rooms
// (15–19 kt), with each room's own 6 kt gusts. The game gives a 1v1 room its
// wind from the room's id; a patch (patches.mjs) passes the champion's rooms
// through roomWind, and the server sails his heat in the same wind. Pure, so
// the server imports it too.

export const ROOM_PREFIX = "champion-";
export const WIND = { knots: 21, gustKnots: 6 };

// conditions: the game's own wind for the room id.
export const roomWind = (id, conditions) => (id.startsWith(ROOM_PREFIX) ? { ...conditions, knots: WIND.knots } : conditions);
