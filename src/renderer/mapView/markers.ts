import { getVisibleMarkers } from "../state";
import { t } from "../i18n";
import { symbolKey, symbolSvg } from "@core/symbols";
import type { Affiliation, MarkKind } from "@core/marks";
import { requestDraw } from "./redraw";
import { gfx, scrFromWorld } from "./state";
import { callbacks } from "./callbacks";

function typeLabel(type: string): string {
  return ({ mortar: t("typeMortar"), target: t("typeTarget"), point: t("typePoint") } as Record<string, string>)[type];
}

function kindLabel(kind: MarkKind): string {
  const keys = { infantry: "kindInfantry", armour: "kindArmour", mortar: "kindMortar", helicopter: "kindHelicopter", retreat: "kindRetreat", legacy: "typePoint" } as const;
  return t(keys[kind]);
}

/** Зображення знаків (з SVG), кеш за приналежністю й видом; після завантаження карта перемальовується. */
const symbolImages = new Map<string, HTMLImageElement>();

function symbolImage(aff: Affiliation | undefined, kind: MarkKind): HTMLImageElement | null {
  const key = symbolKey(aff, kind);
  let img = symbolImages.get(key);
  if (!img) {
    img = new Image();
    img.onload = () => requestDraw();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(symbolSvg(aff, kind));
    symbolImages.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

const MARK_FONT = '600 13px "IBM Plex Sans Condensed",sans-serif';

const markLabelWidths = new Map<string, number>();

/** Ширина підпису мітки: вимірюється один раз (шрифт сталий), а не в кожному кадрі для кожної мітки. Шрифт має бути вже встановлений у ctx. */
function markLabelWidth(label: string): number {
  let w = markLabelWidths.get(label);
  if (w === undefined) {
    if (markLabelWidths.size > 2000) markLabelWidths.clear();
    w = gfx.ctx.measureText(label).width;
    markLabelWidths.set(label, w);
  }
  return w;
}

// веб-шрифт підвантажився після першого виміру: старі ширини (запасного шрифту) недійсні
document.fonts?.addEventListener("loadingdone", () => {
  markLabelWidths.clear();
  requestDraw();
});

export function drawMarkers(c: Record<string, string>): void {
  for (const m of getVisibleMarkers()) {
    const s = scrFromWorld(m.x, m.z);
    if (s.sx < -40 || s.sy < -40 || s.sx > gfx.W + 40 || s.sy > gfx.H + 40) continue;
    const selected = m.id === callbacks.selectedId;
    const size = selected ? 38 : 32;
    const half = size / 2;
    const col = m.aff === "friend" ? c.mortar : m.aff === "hostile" ? c.target : c.point;
    const img = symbolImage(m.aff, m.kind);
    if (m.destroyed) gfx.ctx.globalAlpha = 0.55;
    if (img) gfx.ctx.drawImage(img, s.sx - half, s.sy - half, size, size);
    if (m.destroyed) {
      // зруйновано: хрест поверх приглушеної мітки
      const k = half * 0.85;
      gfx.ctx.strokeStyle = c.ink;
      gfx.ctx.lineWidth = 2.5;
      gfx.ctx.beginPath();
      gfx.ctx.moveTo(s.sx - k, s.sy - k);
      gfx.ctx.lineTo(s.sx + k, s.sy + k);
      gfx.ctx.moveTo(s.sx + k, s.sy - k);
      gfx.ctx.lineTo(s.sx - k, s.sy + k);
      gfx.ctx.stroke();
      gfx.ctx.globalAlpha = 1;
    }
    if (selected) {
      gfx.ctx.strokeStyle = col;
      gfx.ctx.lineWidth = 2;
      gfx.ctx.beginPath();
      gfx.ctx.arc(s.sx, s.sy, half + 5, 0, Math.PI * 2);
      gfx.ctx.stroke();
    }
    gfx.ctx.font = MARK_FONT;
    gfx.ctx.textBaseline = "middle";
    const label = m.name || (m.kind === "legacy" ? typeLabel(m.type) : kindLabel(m.kind));
    const tw = markLabelWidth(label);
    const lx = s.sx + half + 4;
    gfx.ctx.fillStyle = c.surface;
    gfx.ctx.globalAlpha = 0.85;
    gfx.ctx.fillRect(lx, s.sy - 9, tw + 8, 18);
    gfx.ctx.globalAlpha = 1;
    gfx.ctx.fillStyle = c.ink;
    if (m.destroyed) gfx.ctx.globalAlpha = 0.6;
    gfx.ctx.fillText(label, lx + 4, s.sy);
    gfx.ctx.globalAlpha = 1;
  }
}
