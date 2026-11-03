import { pxFromWorld, worldFromPx, type MapGeometry, type Vec2 } from "@core/geometry";
import { planPyramid, type PyramidPlan } from "@core/tilePyramid";
import { currentMeta, getCurrent } from "../state";
import { $ } from "../dom";
import { requestDraw } from "./redraw";

export const cv = $<HTMLCanvasElement>("cv");

export const mainCtx = cv.getContext("2d")!;

/** Окремий шар для підписів і позначок: в економному режимі база малюється у dpr 1, а текст лишається чітким. */
export const ov = $<HTMLCanvasElement>("overlay");

export const overlayCtx = ov.getContext("2d")!;

/** Спільний стан малювання: його читають усі шари канви; міняють лише resize, draw і режим економії. */
export const gfx = {
  /** Поточний контекст малювання: основна канва або буфер базового шару (тайли + сітка). */
  ctx: mainCtx as CanvasRenderingContext2D,
  overlayDpr: 1,
  overlayActive: false,
  dpr: 1,
  W: 0,
  H: 0,
  /** Віртуальний розмір "зображення" карти в пікселях: 1:1 з метрами для порожньої сітки й
   * онлайн-тайлів, або справжній розмір імпортованої піраміди (уже обрізаної під world-аспект). */
  imgW: 12800,
  imgH: 12800,
  pyramidPlan: null as PyramidPlan | null,
  /** true — економний режим (менше деталей): dpr 1, без плавної появи тайлів, без попереднього завантаження. */
  lightMode: false
};

export const view = { k: 1, ox: 0, oy: 0 };

function css(v: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}

/** Кольори теми для канви. Читаються з CSS один раз і скидаються лише при зміні теми (а не щокадру). */
interface MapColors {
  [key: string]: string;
}

let colorCache: MapColors | null = null;

export function mapColors(): MapColors {
  if (colorCache) return colorCache;
  colorCache = {
    grid: css("--grid"),
    fine: css("--gridfine"),
    blank: css("--mapblank"),
    ink: css("--ink"),
    surface: css("--raised"),
    "pl-settlement": css("--pl-settlement"),
    "pl-military": css("--pl-military"),
    "pl-transport": css("--pl-transport"),
    "pl-industry": css("--pl-industry"),
    "pl-water": css("--pl-water"),
    "pl-nature": css("--pl-nature"),
    accent: css("--accent"),
    mortar: css("--mortar"),
    target: css("--target"),
    point: css("--point")
  };
  return colorCache;
}

function invalidateColors(): void {
  colorCache = null;
  requestDraw();
}

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", invalidateColors);

new MutationObserver(invalidateColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

export function geometry(): MapGeometry {
  const S = getCurrent();
  const meta = currentMeta();
  // знімок деяких теренів покриває трохи менше за розмір терену (preset.imageSpan): прив'язуємо зображення до цього розміру
  const span = meta.preset?.imageSpan;
  return { calib: S.calib, imgW: gfx.imgW, imgH: gfx.imgH, mapSize: span ?? meta.sizeX, mapSizeZ: span ?? meta.sizeZ };
}

export function syncImageSize(): void {
  const S = getCurrent();
  const meta = currentMeta();
  if (S.map?.kind === "pyramid") {
    gfx.imgW = S.map.width;
    gfx.imgH = S.map.height;
    gfx.pyramidPlan = planPyramid(gfx.imgW, gfx.imgH);
  } else {
    gfx.imgW = meta.sizeX;
    gfx.imgH = meta.sizeZ;
    gfx.pyramidPlan = null;
  }
}

/** Онлайн-тайли — типове джерело для теренів, що їх мають, доки користувач не імпортував
 * власне зображення (map.kind==="pyramid"). map===null (ще не вирішено) чи {kind:"none"}
 * (явно прибрав карту) рівнозначні тут — обидва означають "нема свого імпорту". */
export function usesOnlineTiles(): boolean {
  const S = getCurrent();
  return S.map?.kind !== "pyramid" && !!currentMeta().preset?.tiles;
}

export function scrFromPx(px: number, py: number) {
  return { sx: px * view.k + view.ox, sy: py * view.k + view.oy };
}

export function pxFromScr(sx: number, sy: number) {
  return { px: (sx - view.ox) / view.k, py: (sy - view.oy) / view.k };
}

export function worldFromScr(sx: number, sy: number): Vec2 {
  const p = pxFromScr(sx, sy);
  return worldFromPx(geometry(), p.px, p.py);
}

export function scrFromWorld(x: number, z: number) {
  const p = pxFromWorld(geometry(), x, z);
  return scrFromPx(p.px, p.py);
}

/**
 * Нижню частину полотна може закривати панель-шторка (телефон): полотно завжди на весь екран,
 * а "видима" висота — без закритого низу. Її віддає CSS-змінна --covered через невидимий зонд.
 */
const coverProbe = document.createElement("div");

coverProbe.style.cssText = "position:absolute;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:var(--covered,0px)";

$("mapWrap").appendChild(coverProbe);

export function viewH(): number {
  return Math.max(1, gfx.H - coverProbe.offsetHeight);
}
