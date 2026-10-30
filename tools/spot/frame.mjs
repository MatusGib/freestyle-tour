// The game frame of a spot: metres around its centre, turned so the wind
// blows along the game's +x, never mirrored. three.js's own top view has x
// east and z south; the frame is that view turned about y, so left and right
// stay true.
const R = 6378137;
const RAD = Math.PI / 180;

// windFrom: the bearing the wind comes from, degrees clockwise from north.
export function localFrame({ lat, lon }, windFrom) {
  const kx = R * RAD * Math.cos(lat * RAD), ky = R * RAD;
  const phi = (windFrom + 90) * RAD, c = Math.cos(phi), s = Math.sin(phi);
  return {
    centre: { lat, lon },
    windFrom,
    toGame(la, lo) {
      const sx = (lo - lon) * kx, sz = -(la - lat) * ky;
      return { x: sx * c + sz * s, z: -sx * s + sz * c };
    },
    toLatLon(x, z) {
      const sx = x * c - z * s, sz = x * s + z * c;
      return { lat: lat - sz / ky, lon: lon + sx / kx };
    },
  };
}

// The latitude/longitude box holding the game square [-half, half]².
export function latLonBox(frame, half) {
  const corners = [[-half, -half], [half, -half], [-half, half], [half, half]].map(([x, z]) => frame.toLatLon(x, z));
  return { south: Math.min(...corners.map((p) => p.lat)), north: Math.max(...corners.map((p) => p.lat)), west: Math.min(...corners.map((p) => p.lon)), east: Math.max(...corners.map((p) => p.lon)) };
}

// Fractional Web Mercator tile coordinates at zoom z.
export function tileOf(lat, lon, z) {
  const n = 2 ** z, la = lat * RAD;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n };
}
