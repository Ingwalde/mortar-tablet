import { TIER_SCALE, type PlaceTier } from "@core/places";
import { currentMeta } from "../state";
import { gfx, scrFromWorld } from "./state";

interface PlaceSprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** Центр крапки прив'язки всередині спрайта (CSS-пікселі). */
  ax: number;
  ay: number;
}

const spriteCache = new Map<string, PlaceSprite>();

const measureCtx = document.createElement("canvas").getContext("2d")!;

/** Підпис із крапкою й м'яким свіченням — малюється один раз і потім лише виводиться як картинка. */
function placeSprite(name: string, tier: PlaceTier, px: number, col: string, surface: string, glow: number, dotR: number): PlaceSprite {
  const key = [name, tier, px.toFixed(1), col, surface, glow.toFixed(1), dotR.toFixed(1), gfx.dpr].join("|");
  const hit = spriteCache.get(key);
  if (hit) return hit;
  if (spriteCache.size > 700) spriteCache.clear();
  const font = `${tier === 1 ? 600 : 500} ${px.toFixed(1)}px "IBM Plex Sans Condensed",sans-serif`;
  measureCtx.font = font;
  const tw = measureCtx.measureText(name).width;
  const pad = Math.ceil(glow * 2 + 2);
  const w = Math.ceil(pad * 2 + dotR * 2 + 4 + tw);
  const h = Math.ceil(pad * 2 + px * 1.4);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * gfx.dpr);
  canvas.height = Math.ceil(h * gfx.dpr);
  const g = canvas.getContext("2d")!;
  g.scale(gfx.dpr, gfx.dpr);
  g.font = font;
  g.textBaseline = "middle";
  g.shadowColor = surface;
  g.shadowBlur = glow;
  g.fillStyle = col;
  const ax = pad + dotR;
  const ay = h / 2;
  g.beginPath();
  g.arc(ax, ay, dotR, 0, Math.PI * 2);
  g.fill();
  g.fillText(name, ax + dotR + 4, ay + 0.5);
  g.fillText(name, ax + dotR + 4, ay + 0.5); // другий прохід підсилює свічення
  const sprite = { canvas, w, h, ax, ay };
  spriteCache.set(key, sprite);
  return sprite;
}

export function drawPlaces(c: Record<string, string>): void {
  const preset = currentMeta().preset;
  if (!getShowPlaces() || !preset?.places) return;
  // Головні пункти (тир 1) пишемо найбільшим і жирним шрифтом, другорядні (тир 3) — дрібніше.
  // Важливіші малюємо останніми, щоб їхні підписи лишались зверху при перекритті.
  for (const tier of [3, 2, 1] as const) {
    if (tier > placesLevel) continue;
    const px = 11.5 * placesScale * TIER_SCALE[tier];
    const dotR = (tier === 1 ? 3.6 : 3) * Math.max(0.85, placesScale);
    const glow = 4 * Math.max(1, placesScale);
    for (const p of preset.places) {
      if (p.tier !== tier) continue;
      const s = scrFromWorld(p.x, p.z);
      if (s.sx < -80 || s.sy < -20 || s.sx > gfx.W + 20 || s.sy > gfx.H + 20) continue;
      const col = c["pl-" + p.kind] || c.ink;
      const sp = placeSprite(p.name, tier, px, col, c.surface, glow, dotR);
      gfx.ctx.drawImage(sp.canvas, s.sx - sp.ax, s.sy - sp.ay, sp.w, sp.h);
    }
  }
}

let showPlaces = true;

export function setShowPlaces(v: boolean): void {
  showPlaces = v;
}

let placesScale = 1;

let placesLevel: PlaceTier = 3;

export function setPlacesStyle(scale: number, level: PlaceTier): void {
  placesScale = scale;
  placesLevel = level;
}

function getShowPlaces(): boolean {
  return showPlaces;
}
