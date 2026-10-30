// True colour for a spot from EOX's Sentinel-2 cloudless WMS (it answers with
// JPEG although PNG is asked for), resampled
// into the game frame. "Sentinel-2 cloudless - https://s2maps.eu by EOX IT
// Services GmbH (Contains modified Copernicus Sentinel data 2024)",
// CC BY-NC-SA 4.0.
import { decodeJpeg } from "./jpeg.mjs";
import { decodePng } from "./png.mjs";
import { bilinear, imagePoint } from "./raster.mjs";

export const WMS = "https://tiles.maps.eox.at/wms";

export function wmsUrl(box, size, layer) {
  const q = new URLSearchParams({ service: "WMS", request: "GetMap", version: "1.1.1", layers: layer, styles: "", srs: "EPSG:4326", bbox: `${box.west},${box.south},${box.east},${box.north}`, width: String(size), height: String(size), format: "image/png" });
  return `${WMS}?${q}`;
}

// The WMS answer as an image, whether the server sent a JPEG or a PNG.
export const decodeWms = (bytes) => (bytes[0] === 0xff && bytes[1] === 0xd8 ? decodeJpeg(bytes) : decodePng(bytes));

// An RGB image ({ width, height, channels, data }) of the game square
// [-half, half]², size pixels a side, from a WMS image over `box`.
export function resampleColour(image, box, frame, half, size) {
  const data = new Uint8Array(size * size * 3);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const { x, z } = imagePoint(i, j, half, size), { lat, lon } = frame.toLatLon(x, z);
      const u = ((lon - box.west) / (box.east - box.west)) * image.width - 0.5, v = ((box.north - lat) / (box.north - box.south)) * image.height - 0.5;
      for (let c = 0; c < 3; c++) data[(j * size + i) * 3 + c] = Math.round(bilinear(image.data, image.width, image.height, u, v, image.channels, c));
    }
  }
  return { width: size, height: size, channels: 3, data };
}
