import { metersPerPx } from "@core/geometry";
import { currentMeta } from "../state";
import { geometry, gfx, headerBand, safeTop, scrFromPx, scrFromWorld, view, worldFromScr } from "./state";

export function drawGrid(c: Record<string, string>): void {
  const g = geometry();
  const mpp = metersPerPx(g) / view.k;
  const w0 = worldFromScr(0, 0);
  const w1 = worldFromScr(gfx.W, gfx.H);
  const meta = currentMeta();
  const x0 = Math.max(Math.min(w0.x, w1.x), 0);
  const x1 = Math.min(Math.max(w0.x, w1.x), meta.sizeX);
  const z0 = Math.max(Math.min(w0.z, w1.z), 0);
  const z1 = Math.min(Math.max(w0.z, w1.z), meta.sizeZ);

  const tl = scrFromPx(0, 0);
  gfx.ctx.save();
  gfx.ctx.beginPath();
  gfx.ctx.rect(tl.sx, tl.sy, gfx.imgW * view.k, gfx.imgH * view.k);
  gfx.ctx.clip();
  const steps = [10, 100, 1000];
  let labelStep = 1000;
  for (const st of steps) {
    const spx = st / mpp;
    if (spx < 14) continue;
    if (spx >= 56 && st < labelStep) labelStep = st;
    gfx.ctx.strokeStyle = st === 1000 ? c.grid : c.fine;
    gfx.ctx.lineWidth = st === 1000 ? 1.2 : 1;
    gfx.ctx.beginPath();
    const n = (x1 - x0) / st + (z1 - z0) / st;
    if (n > 400) continue;
    for (let x = Math.ceil(x0 / st) * st; x <= x1; x += st) {
      if (st < 1000 && x % (st * 10) === 0) continue;
      const s = scrFromWorld(x, z0).sx;
      gfx.ctx.moveTo(Math.round(s) + 0.5, 0);
      gfx.ctx.lineTo(Math.round(s) + 0.5, gfx.H);
    }
    for (let z = Math.ceil(z0 / st) * st; z <= z1; z += st) {
      if (st < 1000 && z % (st * 10) === 0) continue;
      const s = scrFromWorld(x0, z).sy;
      gfx.ctx.moveTo(0, Math.round(s) + 0.5);
      gfx.ctx.lineTo(gfx.W, Math.round(s) + 0.5);
    }
    gfx.ctx.stroke();
  }
  gfx.ctx.restore();

  gfx.ctx.font = '600 11px "IBM Plex Sans Condensed",sans-serif';
  gfx.ctx.fillStyle = c.ink;
  gfx.ctx.textBaseline = "top";
  // Підписи не заходять під рядок стану телефона: верхній ряд стоїть під ним, лівий стовпець зникає, поки не вийде з-під нього.
  const top = safeTop();
  const head = headerBand();
  const lw = labelStep === 1000 ? 2 : labelStep === 100 ? 3 : 4;
  const div = labelStep === 1000 ? 1000 : labelStep === 100 ? 100 : 10;
  if ((x1 - x0) / labelStep < 60) {
    for (let x = Math.ceil(x0 / labelStep) * labelStep; x <= x1; x += labelStep) {
      const s = scrFromWorld(x, z0).sx;
      labelBox(pad(Math.round(x / div), lw), s + 3, top + 3, c);
    }
    for (let z = Math.ceil(z0 / labelStep) * labelStep; z <= z1; z += labelStep) {
      const s = scrFromWorld(x0, z).sy;
      if (s - 15 >= top && !(head && s - 15 < head.bottom + 2 && s - 1 > head.top - 2)) labelBox(pad(Math.round(z / div), lw), 3, s - 15, c);
    }
  }
}

export function pad(n: number, w: number): string {
  let s = String(Math.abs(n));
  while (s.length < w) s = "0" + s;
  return (n < 0 ? "-" : "") + s;
}

function labelBox(t: string, x: number, y: number, c: Record<string, string>): void {
  const w = gfx.ctx.measureText(t).width;
  gfx.ctx.fillStyle = c.surface;
  gfx.ctx.globalAlpha = 0.8;
  gfx.ctx.fillRect(x - 2, y - 1, w + 4, 14);
  gfx.ctx.globalAlpha = 1;
  gfx.ctx.fillStyle = c.ink;
  gfx.ctx.fillText(t, x, y);
}
