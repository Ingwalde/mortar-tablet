// Launch images for iPhone (apple-touch-startup-image): the background colour with the empty emblem tile in the middle, no emblem.
// The tile is exactly what the in-page splash (index.html) starts from, so the phone shows the start of the animation at once
// and the page only draws the ring, the crosshair and the dot on it. Re-add the app to the home screen to get new images.
//   node scripts/make-splash.mjs
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const DIR = fileURLToPath(new URL("../src/renderer/public/icons/", import.meta.url));
const BG = "#161c18";
const TILE = "#1f2721";
/** Side of the splash emblem in CSS pixels (index.html: #splash svg). */
const EMBLEM_CSS = 112;

for (const f of readdirSync(DIR)) {
  const m = /^splash-(\d+)x(\d+)\.png$/.exec(f);
  if (!m) continue;
  const [w, h] = [Number(m[1]), Number(m[2])];
  // the phones with a 2x screen are the only ones with width below 1000 px
  const dpr = w < 1000 ? 2 : 3;
  const side = EMBLEM_CSS * dpr;
  // same geometry as the page: viewBox 64, tile 60x60 at (2, 2), corner radius 15
  const k = side / 64;
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}"><rect x="${2 * k}" y="${2 * k}" width="${60 * k}" height="${60 * k}" rx="${15 * k}" fill="${TILE}"/></svg>`
  );
  await sharp({ create: { width: w, height: h, channels: 3, background: BG } })
    .composite([{ input: tile, left: Math.round((w - side) / 2), top: Math.round((h - side) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(DIR + f);
  console.log(f);
}
