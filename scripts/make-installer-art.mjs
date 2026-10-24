// Бічна картинка інсталятора Windows (build/installerSidebar.bmp, 164x314): емблема застосунку на темному тлі.
//   node scripts/make-installer-art.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const W = 164;
const H = 314;
const ICON = fileURLToPath(new URL("../src/renderer/public/icons/icon-512.png", import.meta.url));
const OUT = fileURLToPath(new URL("../build/installerSidebar.bmp", import.meta.url));

const icon = await sharp(ICON).resize(112, 112).png().toBuffer();
const { data } = await sharp({ create: { width: W, height: H, channels: 3, background: "#161c18" } })
  .composite([{ input: icon, left: Math.round((W - 112) / 2), top: 70 }])
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// 24-бітний BMP: рядки знизу вгору, піксель — B, G, R, ряд вирівняно до 4 байтів
const rowBytes = Math.ceil((W * 3) / 4) * 4;
const pixels = Buffer.alloc(rowBytes * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const src = (y * W + x) * 3;
    const dst = (H - 1 - y) * rowBytes + x * 3;
    pixels[dst] = data[src + 2];
    pixels[dst + 1] = data[src + 1];
    pixels[dst + 2] = data[src];
  }
}
const head = Buffer.alloc(54);
head.write("BM", 0);
head.writeUInt32LE(54 + pixels.length, 2);
head.writeUInt32LE(54, 10);
head.writeUInt32LE(40, 14);
head.writeInt32LE(W, 18);
head.writeInt32LE(H, 22);
head.writeUInt16LE(1, 26);
head.writeUInt16LE(24, 28);
head.writeUInt32LE(pixels.length, 34);
writeFileSync(OUT, Buffer.concat([head, pixels]));
console.log(OUT);
