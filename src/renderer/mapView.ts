import {
  fmtM,
  gridRef,
  metersPerPx,
  pxFromWorld,
  worldFromPx,
  type MapGeometry,
  type Vec2
} from "@core/geometry";
import { tileIndexForWorld, tileSpan } from "@core/onlineTiles";
import { TIER_SCALE, TIER_WEIGHT, type PlaceTier } from "@core/places";
import { FrameMonitor } from "@core/frameMonitor";
import { PYRAMID_TILE_SIZE, planPyramid, type PyramidPlan } from "@core/tilePyramid";
import { spreadOutline } from "@core/spread";
import { pointInPolygon, polygonArea } from "@core/buildings";
import { buildingIndexFor, buildingsLoading, setBuildingsLoadedHook } from "./buildings";
import { currentMeta, getCurrent, getVisibleMarkers, type Marker } from "./state";
import { $ } from "./dom";
import { t } from "./i18n";
import { reducedMotion } from "./motion";
import { isRemote, onlineTileSrc, pyramidTileSrc } from "./platform";
import { symbolKey, symbolSvg } from "@core/symbols";
import type { Affiliation, MarkKind } from "@core/marks";
import { heightAt, onHeightsLoaded } from "./terrainHeight";

const cv = $<HTMLCanvasElement>("cv");
const mainCtx = cv.getContext("2d")!;
/** Окремий шар для підписів і позначок: в економному режимі база малюється у dpr 1, а текст лишається чітким. */
const ov = $<HTMLCanvasElement>("overlay");
const overlayCtx = ov.getContext("2d")!;
let overlayDpr = 1;
let overlayActive = false;
/** Поточний контекст малювання: основна канва або буфер базового шару (тайли + сітка). */
let ctx: CanvasRenderingContext2D = mainCtx;

let dpr = 1;
let W = 0;
let H = 0;
let needsDraw = false;

/** Віртуальний розмір "зображення" карти в пікселях: 1:1 з метрами для порожньої сітки й
 * онлайн-тайлів, або справжній розмір імпортованої піраміди (уже обрізаної під world-аспект). */
let imgW = 12800;
let imgH = 12800;
let pyramidPlan: PyramidPlan | null = null;

export const view = { k: 1, ox: 0, oy: 0 };

function css(v: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}

/** Кольори теми для канви. Читаються з CSS один раз і скидаються лише при зміні теми (а не щокадру). */
interface MapColors {
  [key: string]: string;
}
let colorCache: MapColors | null = null;
function mapColors(): MapColors {
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

function geometry(): MapGeometry {
  const S = getCurrent();
  const meta = currentMeta();
  // знімок деяких теренів покриває трохи менше за розмір терену (preset.imageSpan): прив'язуємо зображення до цього розміру
  const span = meta.preset?.imageSpan;
  return { calib: S.calib, imgW, imgH, mapSize: span ?? meta.sizeX, mapSizeZ: span ?? meta.sizeZ };
}

export function syncImageSize(): void {
  const S = getCurrent();
  const meta = currentMeta();
  if (S.map?.kind === "pyramid") {
    imgW = S.map.width;
    imgH = S.map.height;
    pyramidPlan = planPyramid(imgW, imgH);
  } else {
    imgW = meta.sizeX;
    imgH = meta.sizeZ;
    pyramidPlan = null;
  }
}

/** Онлайн-тайли — типове джерело для теренів, що їх мають, доки користувач не імпортував
 * власне зображення (map.kind==="pyramid"). map===null (ще не вирішено) чи {kind:"none"}
 * (явно прибрав карту) рівнозначні тут — обидва означають "нема свого імпорту". */
function usesOnlineTiles(): boolean {
  const S = getCurrent();
  return S.map?.kind !== "pyramid" && !!currentMeta().preset?.tiles;
}

function scrFromPx(px: number, py: number) {
  return { sx: px * view.k + view.ox, sy: py * view.k + view.oy };
}
function pxFromScr(sx: number, sy: number) {
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
function viewH(): number {
  return Math.max(1, H - coverProbe.offsetHeight);
}

let lastViewH = 0;

// ---------- плавність: економний режим ----------
const LIGHT_KEY = "mortar.lightMode.v1";
function readLight(): boolean | null {
  try {
    const v = localStorage.getItem(LIGHT_KEY);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}
/** true — економний режим (менше деталей): dpr 1, без плавної появи тайлів, без попереднього завантаження. */
let lightMode = readLight() ?? false;
/** Користувач явно вибрав режим — автоматика більше його не змінює. */
let lightManual = readLight() !== null;
export function isLightMode(): boolean {
  return lightMode;
}
export function setLightMode(on: boolean, manual = true): void {
  if (lightMode === on) {
    if (manual) lightManual = true;
    return;
  }
  lightMode = on;
  window.dispatchEvent(new CustomEvent("mortar:light", { detail: { on, manual } }));
  if (manual) {
    lightManual = true;
    try {
      localStorage.setItem(LIGHT_KEY, on ? "1" : "0");
    } catch {
      // сховище недоступне
    }
  }
  resize();
}
/** Монітор інтервалів між кадрами під час руху: стійко повільно — вмикаємо економний режим автоматично. */
const frameMonitor = new FrameMonitor();
let lastViewSig = "";
let lastViewChangeAt = 0;
function monitorFrame(sig: string): boolean {
  const now = performance.now();
  const moving = sig !== lastViewSig;
  lastViewSig = sig;
  const slow = frameMonitor.frame(now, moving);
  if (moving) lastViewChangeAt = now;
  if (slow && !lightMode && !lightManual) setLightMode(true, false);
  return moving;
}
/** Карта зараз рухається (жест/зум/анімація): у цей час не завантажуємо тайли наперед. */
function interacting(): boolean {
  return performance.now() - lastViewChangeAt < 220;
}
onHeightsLoaded(() => updateReadout());

/**
 * Шторка рухається: приціл і координати "їдуть" за нею, а світова точка під прицілом лишається та сама
 * (карта зсувається на пів зміни висоти) — наведена ціль не втікає з-під прицілу, коли відкриваєш панель.
 */
export function notifyCoverChanged(): void {
  const vh = viewH();
  if (lastViewH) view.oy += (vh - lastViewH) / 2;
  lastViewH = vh;
  updateReadout();
  requestDraw();
}

export function centerWorld(): Vec2 {
  return worldFromScr(W / 2, viewH() / 2);
}

function kLimits() {
  const fitK = Math.min(W / imgW, viewH() / imgH);
  return { min: fitK * 0.5, max: Math.max(fitK * 2, 60 * metersPerPx(geometry())) };
}

export function fit(): void {
  cancelFly();
  if (!W) return;
  const vh = viewH();
  view.k = Math.min(W / imgW, vh / imgH) * 0.96;
  view.ox = (W - imgW * view.k) / 2;
  view.oy = (vh - imgH * view.k) / 2;
  requestDraw();
}

export function zoomAt(factor: number, sx: number, sy: number): void {
  cancelFly();
  const l = kLimits();
  const nk = Math.min(l.max, Math.max(l.min, view.k * factor));
  const p = pxFromScr(sx, sy);
  view.k = nk;
  view.ox = sx - p.px * nk;
  view.oy = sy - p.py * nk;
  requestDraw();
}

let flyId: number | null = null;
/** Зупиняє поточний переліт (жест користувача, масштаб, «вся карта»). */
function cancelFly(): void {
  if (flyId !== null) cancelAnimationFrame(flyId);
  flyId = null;
}

/** Плавно їде до точки: карта прискорюється й гальмує замість того, щоб стрибнути. */
export function flyToWorld(x: number, z: number): void {
  const p = pxFromWorld(geometry(), x, z);
  const tx = W / 2 - p.px * view.k;
  const ty = viewH() / 2 - p.py * view.k;
  cancelFly();
  const sx = view.ox;
  const sy = view.oy;
  const dist = Math.hypot(tx - sx, ty - sy);
  if (!W || dist < 3 || reducedMotion()) {
    view.ox = tx;
    view.oy = ty;
    requestDraw();
    return;
  }
  const ms = Math.min(850, Math.max(300, 240 + dist * 0.4));
  const t0 = performance.now();
  const step = (now: number): void => {
    const u = Math.min(1, (now - t0) / ms);
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    view.ox = sx + (tx - sx) * e;
    view.oy = sy + (ty - sy) * e;
    requestDraw();
    flyId = u < 1 ? requestAnimationFrame(step) : null;
  };
  flyId = requestAnimationFrame(step);
}

export function centerOnWorld(x: number, z: number): void {
  cancelFly();
  const p = pxFromWorld(geometry(), x, z);
  view.ox = W / 2 - p.px * view.k;
  view.oy = viewH() / 2 - p.py * view.k;
  requestDraw();
}

function resize(): void {
  const r = cv.getBoundingClientRect();
  // На телефоні (3× екран) полотно в 3× важке для перемальовування щокадру; 2× майже не відрізнити, а тече плавніше.
  dpr = lightMode ? 1 : Math.min(window.devicePixelRatio || 1, isRemote ? 2 : 4);
  // у економному режимі підписи малюємо окремим шаром у повній (до 2×) роздільності: це дешево, а текст не розмивається
  overlayDpr = Math.min(window.devicePixelRatio || 1, 2);
  overlayActive = lightMode && overlayDpr > dpr;
  const first = W === 0;
  // Світова точка під центром (під прицілом) лишається на місці, коли розмір карти міняється
  // (бровка панелі, режим на весь екран, зміна вікна) — інакше приціл зсувався б із цілі.
  const cx = first ? 0 : (W / 2 - view.ox) / view.k;
  const cy = first ? 0 : (viewH() / 2 - view.oy) / view.k;
  W = r.width;
  H = r.height;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  ov.hidden = !overlayActive;
  if (overlayActive) {
    ov.width = Math.round(W * overlayDpr);
    ov.height = Math.round(H * overlayDpr);
  }
  if (first) fit();
  else {
    view.ox = W / 2 - cx * view.k;
    view.oy = viewH() / 2 - cy * view.k;
  }
  lastViewH = viewH();
  requestDraw();
}
new ResizeObserver(resize).observe($("mapWrap"));
// ResizeObserver's initial callback can be delayed (or, observed in practice, simply not
// fire) right after a dev-mode full page reload — розмір канви лишається дефолтним 300x150.
// Явний виклик одразу й ще раз у наступному кадрі — надійний запобіжник, не залежний від цього.
resize();
requestAnimationFrame(resize);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", requestDraw);

export function requestDraw(): void {
  if (!needsDraw) {
    needsDraw = true;
    requestAnimationFrame(draw);
  }
}
// дані будівель підвантажились — перемалювати зруйновані
setBuildingsLoadedHook(requestDraw);

// ---------- tile image cache ----------
interface CacheEntry {
  img?: HTMLImageElement;
  failedAt?: number;
  /** Коли тайл завантажився: від цього рахується плавна поява. */
  loadedAt?: number;
}
const TILE_FADE_MS = 220;
let inflight = 0;
function setLoading(on: boolean): void {
  document.getElementById("mapWrap")?.classList.toggle("loading", on);
}
/** Зміна набору тайлів (завантажено/скасовано) — базовий шар треба перемалювати. */
let tileGen = 0;
/** Тайли, потрібні в поточному кадрі; запити на решту (вже не видимі) скасовуються. */
let wantedThisFrame = new Set<string>();
const pending = new Map<string, { img: HTMLImageElement; quiet: boolean; entry: CacheEntry }>();
function cancelStale(): void {
  for (const [url, p] of pending) {
    if (wantedThisFrame.has(url)) continue;
    p.img.onload = null;
    p.img.onerror = null;
    p.img.src = "";
    pending.delete(url);
    tileCache.delete(url);
    if (!p.quiet) {
      inflight = Math.max(0, inflight - 1);
      if (inflight === 0) setLoading(false);
    }
  }
}
/** Прозорість тайла: щойно завантажений з'являється плавно. */
function tileAlpha(url: string): number {
  if (lightMode) return 1;
  const e = tileCache.get(url);
  if (!e?.loadedAt) return 1;
  const a = (performance.now() - e.loadedAt) / TILE_FADE_MS;
  if (a >= 1) return 1;
  fading = true;
  return Math.max(0.05, a);
}
let fading = false;
/** Невдалий тайл (мережевий збій, перерваний запит під час HMR тощо) не блокується назавжди —
 * через цей інтервал наступний draw() пробує завантажити його ще раз. */
const TILE_RETRY_MS = 4000;
const tileCache = new Map<string, CacheEntry>();
function loadTile(url: string, fetchIt = true, quiet = false): HTMLImageElement | null {
  if (fetchIt) wantedThisFrame.add(url);
  let e = tileCache.get(url);
  if (e) {
    if (e.failedAt !== undefined) {
      if (Date.now() - e.failedAt < TILE_RETRY_MS) return null;
      tileCache.delete(url);
      e = undefined;
    } else {
      return e.img ?? null;
    }
  }
  if (!fetchIt) return null;
  e = {};
  tileCache.set(url, e);
  const im = new Image();
  im.decoding = "async";
  // Тихе (попереднє) завантаження не показує індикатор на карті.
  if (!quiet) {
    inflight++;
    setLoading(true);
  }
  pending.set(url, { img: im, quiet, entry: e });
  const done = (): void => {
    pending.delete(url);
    if (quiet) return;
    inflight = Math.max(0, inflight - 1);
    if (inflight === 0) setLoading(false);
  };
  im.onload = () => {
    e!.img = im;
    e!.loadedAt = performance.now();
    tileGen++;
    done();
    requestDraw();
  };
  im.onerror = () => {
    e!.failedAt = Date.now();
    done();
    setTimeout(requestDraw, TILE_RETRY_MS + 50);
  };
  im.src = url;
  // Декодований тайл 256x256 ≈ 256 КБ пам'яті: на телефоні кеш менший, щоб iOS не вбивав вкладку.
  const cap = isRemote ? 320 : 800;
  if (tileCache.size > cap) {
    for (const k of tileCache.keys()) {
      if (tileCache.size <= cap * 0.75) break;
      tileCache.delete(k);
    }
  }
  return null;
}

function drawOnlineTiles(): void {
  const maxLod = currentMeta().preset!.tiles!.maxLod;
  const pxPerM = Math.abs(scrFromWorld(100, 0).sx - scrFromWorld(0, 0).sx) / 100;
  let lod = Math.floor(Math.log2(256 / (tileSpan(0) * pxPerM * Math.min(dpr, 2))));
  lod = Math.max(0, Math.min(maxLod, lod));
  // грубий огляд усієї карти одразу (мало тайлів, дешево), тоді проміжний рівень з кешу
  // (без запиту), і нарешті цільова деталізація зверху — так само, як у прототипі.
  drawOnlineLod(maxLod, true);
  if (lod + 1 < maxLod) drawOnlineLod(lod + 1, false);
  if (lod < maxLod) drawOnlineLod(lod, true, true);
}

function drawOnlineLod(lod: number, fetchIt: boolean, prefetch = false): void {
  const meta = currentMeta();
  const span = tileSpan(lod);
  const w0 = worldFromScr(0, 0);
  const w1 = worldFromScr(W, H);
  const min = tileIndexForWorld(Math.min(w0.x, w1.x), Math.min(w0.z, w1.z), lod);
  const max = tileIndexForWorld(Math.max(w0.x, w1.x), Math.max(w0.z, w1.z), lod);
  const tx0 = Math.max(0, min.x);
  const tx1 = Math.min(Math.ceil(meta.sizeX / span), max.x);
  const ty0 = Math.max(0, min.y);
  const ty1 = Math.min(Math.ceil(meta.sizeZ / span), max.y);
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 400) return;
  if (prefetch && fetchIt && !lightMode && !interacting()) {
    // кільце в один тайл навколо видимого: при русі карти вони вже будуть у кеші
    const maxX = Math.ceil(meta.sizeX / span);
    const maxY = Math.ceil(meta.sizeZ / span);
    for (let tx = Math.max(0, tx0 - 1); tx <= Math.min(maxX, tx1 + 1); tx++) {
      for (let ty = Math.max(0, ty0 - 1); ty <= Math.min(maxY, ty1 + 1); ty++) {
        if (tx >= tx0 && tx <= tx1 && ty >= ty0 && ty <= ty1) continue;
        loadTile(onlineTileSrc(meta.id, lod, tx, ty), true, true);
      }
    }
  }
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      const url = onlineTileSrc(meta.id, lod, tx, ty);
      const im = loadTile(url, fetchIt);
      if (!im) continue;
      const a = scrFromWorld(tx * span - 50, (ty + 1) * span - 50);
      const b = scrFromWorld((tx + 1) * span - 50, ty * span - 50);
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = prevA * tileAlpha(url);
      ctx.drawImage(im, a.sx, a.sy, b.sx - a.sx + 0.6, b.sy - a.sy + 0.6);
      ctx.globalAlpha = prevA;
    }
  }
}

function pickPyramidLevel(plan: PyramidPlan): number {
  const need = imgW * view.k * dpr * 0.85;
  for (const l of plan.levels) if (l.width >= need) return l.z;
  return plan.maxLevel;
}

function drawPyramidLevel(z: number, fetchIt: boolean, prefetch = false): boolean {
  if (!pyramidPlan) return false;
  const level = pyramidPlan.levels[z];
  const fx = imgW / level.width;
  const fy = imgH / level.height;
  const meta = currentMeta();
  let all = true;
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      const x0 = col * PYRAMID_TILE_SIZE * fx;
      const y0 = row * PYRAMID_TILE_SIZE * fy;
      const a = scrFromPx(x0, y0);
      // Крайній (неповний) тайл sharp доповнює білим до повних 256x256 — малюємо лише
      // реальний вміст (tileSrcW/H), інакше цей "хвіст" з'являється як біла смуга за межею
      // зображення. Для теренів, де width/height кратні 256 (напр. 32768 = 128×256), крайніх
      // неповних тайлів нема взагалі, тому цей випадок не проявлявся раніше.
      const tileSrcW = Math.min(PYRAMID_TILE_SIZE, level.width - col * PYRAMID_TILE_SIZE);
      const tileSrcH = Math.min(PYRAMID_TILE_SIZE, level.height - row * PYRAMID_TILE_SIZE);
      const w = tileSrcW * fx * view.k;
      const h = tileSrcH * fy * view.k;
      if (a.sx > W || a.sy > H || a.sx + w < 0 || a.sy + h < 0) {
        // поза екраном, але впритул — завантажуємо наперед (без малювання й без індикатора)
        if (prefetch && fetchIt && !lightMode && !interacting() && a.sx < W + w && a.sy < H + h && a.sx + w > -w && a.sy + h > -h) {
          loadTile(pyramidTileSrc(meta.id, z, row, col), true, true);
        }
        continue;
      }
      // sharp().tile({layout:"google"}) записує файли як {z}/{рядок}/{колонка}.webp — не
      // {z}/{колонка}/{рядок}, як інтуїтивно очікувалось. Для квадратних зображень (rows===cols)
      // різниці не видно, тому бага не проявлялась на Everon/Kolguyev — лише на непрямокутних.
      const url = pyramidTileSrc(meta.id, z, row, col);
      const im = loadTile(url, fetchIt);
      if (im) {
        const prevA = ctx.globalAlpha;
        ctx.globalAlpha = prevA * tileAlpha(url);
        ctx.drawImage(im, 0, 0, tileSrcW, tileSrcH, a.sx, a.sy, w + 0.6, h + 0.6);
        ctx.globalAlpha = prevA;
      } else all = false;
    }
  }
  return all;
}

function drawPyramid(): void {
  if (!pyramidPlan) return;
  const z = pickPyramidLevel(pyramidPlan);
  // грубий рівень 0 одразу як підклад, тоді ціль зверху — щоб не блимало порожнечею,
  // поки вантажаться тайли потрібної деталізації.
  drawPyramidLevel(0, true);
  if (z >= 2) drawPyramidLevel(z - 1, false);
  if (z > 0) drawPyramidLevel(z, true, true);
}

// ---------- main draw ----------
/** Кільця дальності вибраного міномета: усі заряди вибраного снаряда. */
export interface RingSpec {
  x: number;
  z: number;
  rings: { level: number; min: number; max: number; active: boolean }[];
}

export interface DrawCallbacks {
  selectedId: string | null;
  firePair: () => { m: { x: number; z: number }; t: { x: number; z: number } } | null;
  rings: () => RingSpec | null;
  /** Еліпс розкиду навколо цілі: центр, напрямок вогню (одиничний вектор) і радіуси в метрах. */
  spread: () => { x: number; z: number; ux: number; uz: number; a: number; b: number } | null;
}
let callbacks: DrawCallbacks = { selectedId: null, firePair: () => null, rings: () => null, spread: () => null };

let ringsVisible = true;
export function setRingsVisible(v: boolean): void {
  ringsVisible = v;
  requestDraw();
}

// ---------- політ міни ----------
interface Shot {
  from: { x: number; z: number };
  to: { x: number; z: number };
  /** Тривалість польоту, с. */
  dur: number;
  t0: number;
  label: string;
}
const shots: Shot[] = [];
const IMPACT_MS = 1500;
let animating = false;

/** Запускає анімацію міни від міномета до цілі за час польоту; label — підпис у лічильнику. */
export function launchShot(from: { x: number; z: number }, to: { x: number; z: number }, durationSec: number, label: string): number {
  const t0 = performance.now();
  shots.push({ from, to, dur: Math.max(0.5, durationSec), t0, label });
  requestDraw();
  return t0;
}

export function activeShots(): number {
  return shots.length;
}

function updateShotChip(now: number): void {
  const chip = document.getElementById("shotChip");
  if (!chip) return;
  if (!shots.length) {
    chip.hidden = true;
    return;
  }
  chip.hidden = false;
  chip.classList.toggle("multi", shots.length > 1);
  // рядки будуємо через DOM (підписи — назви міток користувача, без innerHTML)
  chip.textContent = "";
  for (const s of shots.slice(0, 3)) {
    const remain = s.dur - (now - s.t0) / 1000;
    const row = document.createElement("div");
    row.className = remain > 0 ? "shotrow" : "shotrow hit";
    const big = document.createElement("b");
    big.textContent = remain > 0 ? remain.toFixed(1) : t("shotImpact");
    row.appendChild(big);
    if (remain > 0) {
      const unit = document.createElement("i");
      unit.textContent = t("shotSecUnit");
      row.appendChild(unit);
    }
    const label = document.createElement("span");
    label.textContent = s.label;
    row.appendChild(label);
    chip.appendChild(row);
  }
}

/** Іконка мінометної міни: загострена голівка, корпус із пояском і хвостове оперення. Ніс — уздовж +X. */
function drawShellIcon(g: CanvasRenderingContext2D, x: number, y: number, angle: number, scale: number, c: Record<string, string>): void {
  const L = 22; // довжина, px
  const r = 4; // радіус корпусу
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(scale, scale);
  g.globalAlpha = 1;
  g.lineJoin = "round";
  // оперення
  g.fillStyle = c.target;
  g.strokeStyle = c.surface;
  g.lineWidth = 1.2;
  for (const sgn of [-1, 1]) {
    g.beginPath();
    g.moveTo(-L / 2 + 5, sgn * r * 0.6);
    g.lineTo(-L / 2 - 2, sgn * (r + 4.2));
    g.lineTo(-L / 2 + 1, sgn * r * 0.6);
    g.closePath();
    g.fill();
    g.stroke();
  }
  // корпус: хвіст — циліндр, голівка — оживальна
  g.fillStyle = c.ink;
  g.beginPath();
  g.moveTo(-L / 2, -r * 0.7);
  g.lineTo(L * 0.08, -r);
  g.quadraticCurveTo(L * 0.36, -r, L / 2, 0);
  g.quadraticCurveTo(L * 0.36, r, L * 0.08, r);
  g.lineTo(-L / 2, r * 0.7);
  g.closePath();
  g.fill();
  g.stroke();
  // кольорова смужка (як маркування) і яскрава голівка
  g.fillStyle = c.target;
  g.fillRect(-L * 0.12, -r, L * 0.1, r * 2);
  g.fillStyle = c.surface;
  g.beginPath();
  g.moveTo(L * 0.3, -r * 0.55);
  g.quadraticCurveTo(L * 0.42, -r * 0.35, L / 2 - 1, 0);
  g.quadraticCurveTo(L * 0.42, r * 0.35, L * 0.3, r * 0.55);
  g.closePath();
  g.fill();
  g.restore();
}

function drawShots(c: Record<string, string>): void {
  animating = false;
  if (!shots.length) {
    updateShotChip(performance.now());
    return;
  }
  const now = performance.now();
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    const u = (now - s.t0) / 1000 / s.dur;
    const a = scrFromWorld(s.from.x, s.from.z);
    const b = scrFromWorld(s.to.x, s.to.z);
    const dist = Math.hypot(b.sx - a.sx, b.sy - a.sy);
    const arcH = Math.min(150, Math.max(26, dist * 0.2));
    const at = (k: number): { x: number; y: number; ground: { x: number; y: number } } => {
      const gx = a.sx + (b.sx - a.sx) * k;
      const gy = a.sy + (b.sy - a.sy) * k;
      return { x: gx, y: gy - 4 * arcH * k * (1 - k), ground: { x: gx, y: gy } };
    };
    animating = true;
    if (u >= 1) {
      // влучання: кільце, що розходиться, і спалах
      const k = (now - (s.t0 + s.dur * 1000)) / IMPACT_MS;
      if (k >= 1) {
        shots.splice(i, 1);
        continue;
      }
      const e1 = 1 - Math.pow(1 - k, 3);
      ctx.save();
      // пляма на землі: темніє одразу й повільно блякне
      ctx.globalAlpha = 0.3 * Math.min(1, k * 8) * (1 - Math.max(0, (k - 0.45) / 0.55));
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(b.sx, b.sy, 9 + e1 * 5, 6 + e1 * 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // яскравий спалах у перші мілісекунди
      if (k < 0.3) {
        const f = 1 - k / 0.3;
        const g = ctx.createRadialGradient(b.sx, b.sy, 0, b.sx, b.sy, 10 + (1 - f) * 26);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.4, "rgba(255,190,110,0.8)");
        g.addColorStop(1, "rgba(255,140,60,0)");
        ctx.globalAlpha = f;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.sx, b.sy, 10 + (1 - f) * 26, 0, Math.PI * 2);
        ctx.fill();
      }
      // дві ударні хвилі
      ctx.strokeStyle = c.target;
      for (const [delay, maxR, lw] of [
        [0, 56, 3.4],
        [0.1, 36, 2.2]
      ]) {
        const kk = (k - delay) / (1 - delay);
        if (kk <= 0) continue;
        const ee = 1 - Math.pow(1 - kk, 3);
        ctx.globalAlpha = (1 - kk) * 0.85;
        ctx.lineWidth = lw * (1 - kk) + 0.8;
        ctx.beginPath();
        ctx.arc(b.sx, b.sy, 6 + ee * maxR, 0, Math.PI * 2);
        ctx.stroke();
      }
      // уламки: короткі промені, що розлітаються
      ctx.lineCap = "round";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 10; i++) {
        const ang = i * 0.628 + 0.3;
        const r0 = 4 + e1 * 30 * (0.7 + 0.15 * (i % 3));
        const len = Math.max(0, 10 * (1 - k));
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.moveTo(b.sx + Math.cos(ang) * r0, b.sy + Math.sin(ang) * r0);
        ctx.lineTo(b.sx + Math.cos(ang) * (r0 + len), b.sy + Math.sin(ang) * (r0 + len));
        ctx.stroke();
      }
      // дим: кілька кіл, що здіймаються й розпливаються
      ctx.fillStyle = c.ink;
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.256 + 0.7;
        ctx.globalAlpha = 0.22 * (1 - k) * Math.min(1, k * 6);
        ctx.beginPath();
        ctx.arc(b.sx + Math.cos(ang) * (6 + e1 * 14), b.sy + Math.sin(ang) * (4 + e1 * 8) - e1 * 16, 4 + e1 * 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      continue;
    }
    ctx.save();
    // траєкторія — тонка пунктирна дуга
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    for (let k = 0; k <= 1.001; k += 0.04) {
      const p = at(Math.min(1, k));
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // слід за міною, що меркне
    for (let j = 10; j >= 1; j--) {
      const kk = Math.max(0, u - j * 0.012);
      const p = at(kk);
      ctx.globalAlpha = (1 - j / 11) * 0.5;
      ctx.fillStyle = c.target;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6 * (1 - j / 14), 0, Math.PI * 2);
      ctx.fill();
    }
    // тінь на землі й сама міна: вузький корпус зі стабілізатором, носом уздовж руху
    const p = at(u);
    const alt = 4 * u * (1 - u);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.ellipse(p.ground.x, p.ground.y, 7 - alt * 2.5, 2.6 - alt, 0, 0, Math.PI * 2);
    ctx.fill();
    // напрям руху: похідна дуги (по екрану) — міна «дивиться» вперед і на вершині перекидається вниз
    const vx = b.sx - a.sx;
    const vy = b.sy - a.sy - 4 * arcH * (1 - 2 * u);
    drawShellIcon(ctx, p.x, p.y, Math.atan2(vy, vx), 1 + alt * 0.28, c);
    ctx.restore();
  }
  updateShotChip(now);
}

/**
 * Штрихує коло лише там, де воно перетинає видиму область: у наближенні радіус кілець — тисячі пікселів,
 * і повне коло (особливо пунктиром) на телефоні сильно гальмувало б малювання.
 */
function strokeArcInView(cx: number, cy: number, r: number): void {
  const m = 16;
  const x0 = -m;
  const y0 = -m;
  const x1 = W + m;
  const y1 = H + m;
  // коло зовсім поза екраном або охоплює його без перетину
  const nearX = Math.max(x0, Math.min(cx, x1));
  const nearY = Math.max(y0, Math.min(cy, y1));
  const dMin = Math.hypot(cx - nearX, cy - nearY);
  const dMax = Math.max(
    Math.hypot(cx - x0, cy - y0),
    Math.hypot(cx - x1, cy - y0),
    Math.hypot(cx - x0, cy - y1),
    Math.hypot(cx - x1, cy - y1)
  );
  if (r < dMin || r > dMax) return;
  // крок так, щоб хорда була ~6 px (але не рідше ніж 1°)
  const step = Math.min(Math.PI / 90, 6 / Math.max(r, 1));
  const n = Math.ceil((Math.PI * 2) / step);
  let pen = false;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const ang = i * step;
    const px = cx + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r;
    const inside = px >= x0 && px <= x1 && py >= y0 && py <= y1;
    if (inside) {
      if (!pen) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      pen = true;
    } else {
      pen = false;
    }
  }
  ctx.stroke();
}

/** Кільця дальності: зовнішнє — максимум заряду, внутрішнє пунктиром — мінімум; активний заряд яскравіший. */
function drawRangeRings(c: Record<string, string>): void {
  if (!ringsVisible) return;
  const spec = callbacks.rings();
  if (!spec || !spec.rings.length) return;
  const center = scrFromWorld(spec.x, spec.z);
  const pxPerM = Math.abs(scrFromWorld(100, 0).sx - scrFromWorld(0, 0).sx) / 100;
  ctx.save();
  ctx.lineJoin = "round";
  for (const r of spec.rings) {
    const outer = r.max * pxPerM;
    const inner = r.min * pxPerM;
    if (outer < 3 || outer > 40000) continue;
    // заливка зони дії (мін–макс) лише коли обидва кола помірні: гігантський кільцевий шлях сильно гальмує
    if (r.active && !lightMode && outer < 3000) {
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = c.mortar;
      ctx.beginPath();
      ctx.arc(center.sx, center.sy, outer, 0, Math.PI * 2);
      ctx.arc(center.sx, center.sy, inner, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
    }
    ctx.globalAlpha = r.active ? 0.95 : 0.3;
    ctx.strokeStyle = c.mortar;
    ctx.lineWidth = r.active ? 2 : 1;
    // пунктир — лише в звичайному режимі й для невеликих кіл; поза екраном нічого не малюємо
    ctx.setLineDash(r.active || lightMode || outer > 3000 ? [] : [5, 5]);
    strokeArcInView(center.sx, center.sy, outer);
    if (r.active && inner > 3) {
      ctx.setLineDash(lightMode || inner > 3000 ? [] : [7, 5]);
      ctx.lineWidth = 1.5;
      strokeArcInView(center.sx, center.sy, inner);
    }
  }
  // підписи лише активного кільця, над ним (на півночі)
  const active = spec.rings.find((r) => r.active);
  if (active) {
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.font = '600 11.5px "IBM Plex Sans Condensed",sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = c.surface;
    ctx.shadowBlur = 4;
    ctx.fillStyle = c.mortar;
    const outer = active.max * pxPerM;
    if (outer > 24) {
      ctx.fillText(t("ringLabelCharge", { c: active.level, max: active.max }), center.sx, center.sy - outer - 4);
    }
    const inner = active.min * pxPerM;
    if (inner > 24) ctx.fillText(t("ringLabelMin", { min: active.min }), center.sx, center.sy - inner - 4);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
  }
  ctx.restore();
}
export function setDrawCallbacks(cb: Partial<DrawCallbacks>): void {
  callbacks = { ...callbacks, ...cb };
}

/** Буфер базового шару (тайли + сітка): перемальовується лише коли змінився вид, тайли чи тема. */
const baseCanvas = document.createElement("canvas");
const baseCtx = baseCanvas.getContext("2d")!;
let baseKey = "";

function draw(): void {
  needsDraw = false;
  fading = false;
  wantedThisFrame = new Set<string>();
  if (!W) return;
  const c = mapColors();
  const S = getCurrent();

  const key = [
    cv.width,
    cv.height,
    dpr,
    view.k.toFixed(6),
    view.ox.toFixed(2),
    view.oy.toFixed(2),
    tileGen,
    S.map ? JSON.stringify(S.map) : "",
    JSON.stringify(S.calib),
    currentMeta().id,
    c.blank,
    c.grid,
    c.fine
  ].join("|");

  const moving = monitorFrame(`${cv.width}x${cv.height}|${view.k.toFixed(6)}|${view.ox.toFixed(2)}|${view.oy.toFixed(2)}`);
  const drawBase = (): void => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.blank;
    ctx.fillRect(0, 0, W, H);
    if (S.map?.kind === "pyramid") drawPyramid();
    else if (usesOnlineTiles()) drawOnlineTiles();
    drawGrid(c);
  };

  let renderedBase = false;
  if (moving) {
    // Карта рухається: кожен кадр і так новий, буфер лише додав би копіювання на весь екран.
    renderedBase = true;
    ctx = mainCtx;
    drawBase();
    baseKey = ""; // для наступного нерухомого кадру буфер перебудується
  } else {
    if (key !== baseKey) {
      renderedBase = true;
      if (baseCanvas.width !== cv.width || baseCanvas.height !== cv.height) {
        baseCanvas.width = cv.width;
        baseCanvas.height = cv.height;
      }
      ctx = baseCtx;
      drawBase();
      ctx = mainCtx;
      // Поки тайли з'являються плавно, шар не вважаємо готовим — наступний кадр його перемалює.
      baseKey = fading ? "" : key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(baseCanvas, 0, 0);
  }
  const baseDpr = dpr;
  if (overlayActive) {
    // шар підписів: чистимо й малюємо в повній роздільності (спрайти тексту беруть dpr звідси)
    dpr = overlayDpr;
    ctx = overlayCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ov.width, ov.height);
  }
  try {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRangeRings(c);
    drawSpread(c);
    drawFiringLine(c);
    drawDestroyed();
    drawAimBuilding(c);
    drawCalibPoints(c);
    drawPlaces(c);
    drawMarkers(c);
    drawShots(c);
  } finally {
    if (overlayActive) {
      dpr = baseDpr;
      ctx = mainCtx;
    }
  }
  updateReadout();
  // запити скасовуємо лише коли набір потрібних тайлів перераховано в цьому кадрі
  if (renderedBase) cancelStale();
  // тайли ще з'являються плавно або міна в польоті — домалювати наступний кадр
  if (fading || animating) requestDraw();
}

function drawGrid(c: Record<string, string>): void {
  const g = geometry();
  const mpp = metersPerPx(g) / view.k;
  const w0 = worldFromScr(0, 0);
  const w1 = worldFromScr(W, H);
  const meta = currentMeta();
  const x0 = Math.max(Math.min(w0.x, w1.x), 0);
  const x1 = Math.min(Math.max(w0.x, w1.x), meta.sizeX);
  const z0 = Math.max(Math.min(w0.z, w1.z), 0);
  const z1 = Math.min(Math.max(w0.z, w1.z), meta.sizeZ);

  const tl = scrFromPx(0, 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(tl.sx, tl.sy, imgW * view.k, imgH * view.k);
  ctx.clip();
  const steps = [10, 100, 1000];
  let labelStep = 1000;
  for (const st of steps) {
    const spx = st / mpp;
    if (spx < 14) continue;
    if (spx >= 56 && st < labelStep) labelStep = st;
    ctx.strokeStyle = st === 1000 ? c.grid : c.fine;
    ctx.lineWidth = st === 1000 ? 1.2 : 1;
    ctx.beginPath();
    const n = (x1 - x0) / st + (z1 - z0) / st;
    if (n > 400) continue;
    for (let x = Math.ceil(x0 / st) * st; x <= x1; x += st) {
      if (st < 1000 && x % (st * 10) === 0) continue;
      const s = scrFromWorld(x, z0).sx;
      ctx.moveTo(Math.round(s) + 0.5, 0);
      ctx.lineTo(Math.round(s) + 0.5, H);
    }
    for (let z = Math.ceil(z0 / st) * st; z <= z1; z += st) {
      if (st < 1000 && z % (st * 10) === 0) continue;
      const s = scrFromWorld(x0, z).sy;
      ctx.moveTo(0, Math.round(s) + 0.5);
      ctx.lineTo(W, Math.round(s) + 0.5);
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.font = '600 11px "IBM Plex Sans Condensed",sans-serif';
  ctx.fillStyle = c.ink;
  ctx.textBaseline = "top";
  const lw = labelStep === 1000 ? 2 : labelStep === 100 ? 3 : 4;
  const div = labelStep === 1000 ? 1000 : labelStep === 100 ? 100 : 10;
  if ((x1 - x0) / labelStep < 60) {
    for (let x = Math.ceil(x0 / labelStep) * labelStep; x <= x1; x += labelStep) {
      const s = scrFromWorld(x, z0).sx;
      labelBox(pad(Math.round(x / div), lw), s + 3, 3, c);
    }
    for (let z = Math.ceil(z0 / labelStep) * labelStep; z <= z1; z += labelStep) {
      const s = scrFromWorld(x0, z).sy;
      labelBox(pad(Math.round(z / div), lw), 3, s - 15, c);
    }
  }
}
function pad(n: number, w: number): string {
  let s = String(Math.abs(n));
  while (s.length < w) s = "0" + s;
  return (n < 0 ? "-" : "") + s;
}
function labelBox(t: string, x: number, y: number, c: Record<string, string>): void {
  const w = ctx.measureText(t).width;
  ctx.fillStyle = c.surface;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(x - 2, y - 1, w + 4, 14);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.ink;
  ctx.fillText(t, x, y);
}

/** Радіус «зони» зруйнованої мітки, коли контуру будівлі нема (м). */
const DESTROYED_FALLBACK_RADIUS_M = 8;

interface DestroyedShape {
  markerId: string;
  /** Контури будівлі й прибудов (світові координати); порожньо — круг навколо мітки. */
  polys: Float32Array[];
  /** Центр підпису: для будівлі — центр найбільшого контуру. */
  cx: number;
  cz: number;
}

/** Зруйновані цілі й точки видимої папки з контуром будівлі, на яку вони потрапили. */
function destroyedShapes(): DestroyedShape[] {
  const list = getVisibleMarkers().filter((m) => m.destroyed && m.type !== "mortar");
  if (!list.length) return [];
  const terrainId = currentMeta().id;
  const idx = buildingIndexFor(terrainId);
  // дані будівель ще вантажаться: малюємо, коли прийдуть (замість тимчасового круга)
  if (!idx && buildingsLoading(terrainId)) return [];
  return list.map((m) => {
    const b = idx?.findAt(m.x, m.z) ?? null;
    if (!b || !idx) return { markerId: m.id, polys: [], cx: m.x, cz: m.z };
    // будівля разом з прибудовами, що торкаються її; підпис — по центру найбільшого блоку
    const cluster = idx.clusterOf(b);
    let main = b;
    let mainArea = polygonArea(b.pts);
    for (const c of cluster) {
      const a = polygonArea(c.pts);
      if (a > mainArea) {
        main = c;
        mainArea = a;
      }
    }
    return { markerId: m.id, polys: cluster.map((c) => c.pts), cx: main.cx, cz: main.cz };
  });
}

const AIM_SNAP_TAP_M = 1.5;

/** Будівля під прицілом (центр екрана всередині контуру); null — прицілу нічого прив'язувати. polys — вона разом з прибудовами, що торкаються її. */
export function aimBuilding(): { cx: number; cz: number; pts: Float32Array; polys: Float32Array[] } | null {
  const idx = buildingIndexFor(currentMeta().id);
  if (!idx) return null;
  const w = centerWorld();
  const b = idx.findAt(w.x, w.z, 0.5);
  return b ? { cx: b.cx, cz: b.cz, pts: b.pts, polys: idx.clusterOf(b).map((c) => c.pts) } : null;
}

/** Тонка підсвітка будівлі під прицілом: видно, що мітка стане в її центр. */
function drawAimBuilding(c: Record<string, string>): void {
  const b = aimBuilding();
  if (!b) return;
  let minX = Infinity;
  let maxX = -Infinity;
  ctx.save();
  ctx.beginPath();
  for (const pts of b.polys) {
    for (let i = 0; i < pts.length; i += 2) {
      const p = scrFromWorld(pts[i], pts[i + 1]);
      minX = Math.min(minX, p.sx);
      maxX = Math.max(maxX, p.sx);
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    }
    ctx.closePath();
  }
  if (maxX - minX >= 6) {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = c.accent;
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

/** Червона будівля (або круг, якщо контуру нема) з підписом «Зруйновано» посередині. */
function drawDestroyed(): void {
  const shapes = destroyedShapes();
  if (!shapes.length) return;
  ctx.save();
  for (const sh of shapes) {
    let minX = Infinity;
    let maxX = -Infinity;
    // горизонтальна й вертикальна «хорда» через центр: стільки місця реально є під підпис
    let chordW = 0;
    let chordH = 0;
    ctx.beginPath();
    if (sh.polys.length) {
      const cc = scrFromWorld(sh.cx, sh.cz);
      for (const poly of sh.polys) {
        const scr: { x: number; y: number }[] = [];
        for (let i = 0; i < poly.length; i += 2) {
          const p = scrFromWorld(poly[i], poly[i + 1]);
          scr.push({ x: p.sx, y: p.sy });
          minX = Math.min(minX, p.sx);
          maxX = Math.max(maxX, p.sx);
          if (i === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        // хорда береться в тому контурі, де лежить центр підпису
        if (chordW === 0 && pointInPolygon(sh.cx, sh.cz, poly)) {
          chordW = chordThrough(scr, cc.sx, cc.sy, true);
          chordH = chordThrough(scr, cc.sx, cc.sy, false);
        }
      }
    } else {
      const c0 = scrFromWorld(sh.cx, sh.cz);
      const r = Math.max(6, Math.abs(scrFromWorld(sh.cx + DESTROYED_FALLBACK_RADIUS_M, sh.cz).sx - c0.sx));
      ctx.arc(c0.sx, c0.sy, r, 0, Math.PI * 2);
      minX = c0.sx - r;
      maxX = c0.sx + r;
      chordW = chordH = r * 2;
    }
    if (maxX < -50 || minX > W + 50) continue;
    ctx.fillStyle = "rgba(224,49,49,0.58)";
    ctx.fill();
    ctx.strokeStyle = "#a51111";
    ctx.lineWidth = 2;
    ctx.stroke();
    // підпис посередині: лише коли вміщається (на далекому масштабі будівля — крапка)
    const label = t("destroyedLabel");
    ctx.font = '700 12px "IBM Plex Sans Condensed",sans-serif';
    const tw = ctx.measureText(label).width;
    // вміщаємо і за шириною, і за висотою хорди (текст горизонтальний, а будівля може бути повернута)
    const size = Math.min(15, (12 * chordW * 0.9) / tw, chordH * 0.8);
    if (size >= 8) {
      const c1 = scrFromWorld(sh.cx, sh.cz);
      ctx.font = `700 ${size.toFixed(1)}px "IBM Plex Sans Condensed",sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, size / 5);
      ctx.strokeStyle = "rgba(60,0,0,0.85)";
      ctx.strokeText(label, c1.sx, c1.sy);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, c1.sx, c1.sy);
    }
  }
  ctx.restore();
}

/** Довжина перерізу багатокутника (екранні точки) горизонталлю або вертикаллю через (cx, cy), що містить центр. */
function chordThrough(poly: { x: number; y: number }[], cx: number, cy: number, horizontal: boolean): number {
  const hits: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = horizontal ? poly[j] : { x: poly[j].y, y: poly[j].x };
    const b = horizontal ? poly[i] : { x: poly[i].y, y: poly[i].x };
    const line = horizontal ? cy : cx;
    if (a.y > line !== b.y > line) hits.push(a.x + ((line - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  hits.sort((p, q) => p - q);
  const mid = horizontal ? cx : cy;
  for (let k = 0; k + 1 < hits.length; k += 2) {
    if (mid >= hits[k] && mid <= hits[k + 1]) return hits[k + 1] - hits[k];
  }
  // центр випав з полігона (увігнута форма): беремо найширший відрізок
  let best = 0;
  for (let k = 0; k + 1 < hits.length; k += 2) best = Math.max(best, hits[k + 1] - hits[k]);
  return best;
}

/** Яка зруйнована мітка «володіє» точкою екрана (клік по червоній будівлі); null — жодна. */
function hitTestDestroyed(sx: number, sy: number): string | null {
  const w = worldFromScr(sx, sy);
  for (const sh of destroyedShapes()) {
    const hit = sh.polys.length
      ? sh.polys.some((p) => pointInPolygon(w.x, w.z, p))
      : Math.hypot(w.x - sh.cx, w.z - sh.cz) <= DESTROYED_FALLBACK_RADIUS_M;
    if (hit) return sh.markerId;
  }
  return null;
}

function drawSpread(c: Record<string, string>): void {
  const sp = callbacks.spread();
  if (!sp) return;
  const pts = spreadOutline(sp.x, sp.z, sp.ux, sp.uz, sp.a, sp.b).map((p) => scrFromWorld(p.x, p.z));
  ctx.save();
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy)));
  ctx.closePath();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = c.target;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = c.target;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(lightMode ? [] : [5, 4]);
  ctx.stroke();
  ctx.restore();
}

function drawFiringLine(c: Record<string, string>): void {
  const pair = callbacks.firePair();
  if (!pair) return;
  const a = scrFromWorld(pair.m.x, pair.m.z);
  const b = scrFromWorld(pair.t.x, pair.t.z);
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = c.target;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  ctx.lineTo(b.sx, b.sy);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCalibPoints(c: Record<string, string>): void {
  const S = getCurrent();
  if (S.calib.mode !== "points") return;
  for (const key of ["a", "b"] as const) {
    const p = S.calib[key];
    if (!p) continue;
    const s = scrFromPx(p.px, p.py);
    ctx.strokeStyle = c.point;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.sx, s.sy, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = c.point;
    ctx.font = '700 12px "IBM Plex Sans Condensed",sans-serif';
    ctx.fillText(key.toUpperCase(), s.sx + 11, s.sy - 6);
  }
}

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
  const key = [name, tier, px.toFixed(1), col, surface, glow.toFixed(1), dotR.toFixed(1), dpr].join("|");
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
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  const g = canvas.getContext("2d")!;
  g.scale(dpr, dpr);
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

function drawPlaces(c: Record<string, string>): void {
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
      if (s.sx < -80 || s.sy < -20 || s.sx > W + 20 || s.sy > H + 20) continue;
      const col = c["pl-" + p.kind] || c.ink;
      const sp = placeSprite(p.name, tier, px, col, c.surface, glow, dotR);
      ctx.drawImage(sp.canvas, s.sx - sp.ax, s.sy - sp.ay, sp.w, sp.h);
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

function drawMarkers(c: Record<string, string>): void {
  for (const m of getVisibleMarkers()) {
    const s = scrFromWorld(m.x, m.z);
    if (s.sx < -40 || s.sy < -40 || s.sx > W + 40 || s.sy > H + 40) continue;
    const selected = m.id === callbacks.selectedId;
    const size = selected ? 38 : 32;
    const half = size / 2;
    const col = m.aff === "friend" ? c.mortar : m.aff === "hostile" ? c.target : c.point;
    const img = symbolImage(m.aff, m.kind);
    if (m.destroyed) ctx.globalAlpha = 0.55;
    if (img) ctx.drawImage(img, s.sx - half, s.sy - half, size, size);
    if (m.destroyed) {
      // зруйновано: хрест поверх приглушеної мітки
      const k = half * 0.85;
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(s.sx - k, s.sy - k);
      ctx.lineTo(s.sx + k, s.sy + k);
      ctx.moveTo(s.sx + k, s.sy - k);
      ctx.lineTo(s.sx - k, s.sy + k);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (selected) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, half + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = '600 13px "IBM Plex Sans Condensed",sans-serif';
    ctx.textBaseline = "middle";
    const label = m.name || (m.kind === "legacy" ? typeLabel(m.type) : kindLabel(m.kind));
    const tw = ctx.measureText(label).width;
    const lx = s.sx + half + 4;
    ctx.fillStyle = c.surface;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(lx, s.sy - 9, tw + 8, 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.ink;
    if (m.destroyed) ctx.globalAlpha = 0.6;
    ctx.fillText(label, lx + 4, s.sy);
    ctx.globalAlpha = 1;
  }
}

function updateReadout(): void {
  const w = centerWorld();
  $("coords").querySelector(".grid")!.textContent = gridRef(w.x, w.z);
  const u = t("unitM");
  const meta = currentMeta();
  const h = heightAt(meta.id, w.x, w.z, meta.sizeX, meta.sizeZ);
  $("coords").querySelector(".m")!.textContent =
    "X " + fmtM(w.x) + " " + u + "   Z " + fmtM(w.z) + " " + u + (h !== null ? "   h " + fmtM(h) + " " + u : "");
}

// ---------- gestures ----------
export interface TapHandlers {
  onMarkerTap: (id: string) => void;
  /** Чи можна зараз пересунути мітку мишкою чи пальцем (у відділенні після кінця гри — ні). */
  canDragMarker?: (id: string) => boolean;
  /** Мітку пересунуто: застосунок зберігає зміну й перемальовує списки. */
  onMarkerMoved?: (id: string) => void;
}

export function centerPx(): { px: number; py: number } {
  return pxFromScr(W / 2, viewH() / 2);
}
let tapHandlers: TapHandlers | null = null;
export function setTapHandlers(h: TapHandlers): void {
  tapHandlers = h;
}
export function hitTestMarker(sx: number, sy: number): string | null {
  let best: string | null = null;
  let bd = 22;
  for (const m of getVisibleMarkers()) {
    const s = scrFromWorld(m.x, m.z);
    const d = Math.hypot(s.sx - sx, s.sy - sy);
    if (d < bd) {
      bd = d;
      best = m.id;
    }
  }
  return best;
}

const ptrs = new Map<number, { x: number; y: number }>();
type Gesture =
  | { type: "pan"; start: { x: number; y: number }; last: { x: number; y: number }; t: number; moved: boolean }
  | { type: "pinch"; d: number; mid: { x: number; y: number } }
  /** Перетягування виділеної мітки: `grab` — зсув між центром мітки й точкою дотику, щоб вона не стрибала. */
  | { type: "drag"; id: string; grab: { x: number; z: number }; start: { x: number; y: number }; t: number; moved: boolean };
let gesture: Gesture | null = null;

/** Виділена мітка під вказівником (лише вона перетягується; решта жестів рухає карту). */
function selectedMarkerAt(x: number, y: number): Marker | null {
  const id = callbacks.selectedId;
  if (!id || tapHandlers?.canDragMarker?.(id) === false) return null;
  const m = getVisibleMarkers().find((k) => k.id === id);
  if (!m) return null;
  const s = scrFromWorld(m.x, m.z);
  return Math.hypot(s.sx - x, s.sy - y) <= 24 ? m : null;
}

function finishDrag(g: Extract<Gesture, { type: "drag" }>): void {
  if (g.moved) tapHandlers?.onMarkerMoved?.(g.id);
}

function pos(e: PointerEvent) {
  const r = cv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

cv.addEventListener("pointerdown", (e) => {
  cancelFly();
  cv.setPointerCapture(e.pointerId);
  const p = pos(e);
  ptrs.set(e.pointerId, p);
  if (ptrs.size === 1) {
    const hit = selectedMarkerAt(p.x, p.y);
    if (hit) {
      const w = worldFromScr(p.x, p.y);
      gesture = { type: "drag", id: hit.id, grab: { x: hit.x - w.x, z: hit.z - w.z }, start: p, t: Date.now(), moved: false };
    } else gesture = { type: "pan", start: p, last: p, t: Date.now(), moved: false };
  } else if (ptrs.size === 2) {
    if (gesture?.type === "drag") finishDrag(gesture);
    const [a, b] = [...ptrs.values()];
    gesture = { type: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
});
cv.addEventListener("pointermove", (e) => {
  if (!ptrs.size) {
    // наведення мишки на виділену мітку: показуємо, що її можна тягти
    const p = pos(e);
    cv.style.cursor = selectedMarkerAt(p.x, p.y) ? "move" : "";
    return;
  }
  if (!ptrs.has(e.pointerId) || !gesture) return;
  const p = pos(e);
  ptrs.set(e.pointerId, p);
  if (gesture.type === "drag" && ptrs.size === 1) {
    if (!gesture.moved && Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) <= 6) return;
    gesture.moved = true;
    const m = getVisibleMarkers().find((k) => k.id === (gesture as Extract<Gesture, { type: "drag" }>).id);
    if (m) {
      const w = worldFromScr(p.x, p.y);
      m.x = w.x + gesture.grab.x;
      m.z = w.z + gesture.grab.z;
      requestDraw();
    }
  } else if (gesture.type === "pan" && ptrs.size === 1) {
    view.ox += p.x - gesture.last.x;
    view.oy += p.y - gesture.last.y;
    gesture.last = p;
    if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 6) gesture.moved = true;
    requestDraw();
  } else if (gesture.type === "pinch" && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    view.ox += mid.x - gesture.mid.x;
    view.oy += mid.y - gesture.mid.y;
    zoomAt(d / gesture.d, mid.x, mid.y);
    gesture.d = d;
    gesture.mid = mid;
  }
});
function endPtr(e: PointerEvent): void {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (gesture && gesture.type === "drag") {
    finishDrag(gesture);
    if (!gesture.moved && Date.now() - gesture.t < 500 && e.type === "pointerup") tap(gesture.start.x, gesture.start.y);
  }
  if (gesture && gesture.type === "pan" && !gesture.moved && Date.now() - gesture.t < 500 && e.type === "pointerup") {
    tap(gesture.start.x, gesture.start.y);
  }
  if (ptrs.size === 1) {
    const p = [...ptrs.values()][0];
    gesture = { type: "pan", start: p, last: p, t: 0, moved: true };
  } else if (ptrs.size === 0) gesture = null;
}
cv.addEventListener("pointerup", endPtr);
cv.addEventListener("pointercancel", endPtr);
cv.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false }
);

function tap(x: number, y: number): void {
  const id = hitTestMarker(x, y) ?? hitTestDestroyed(x, y);
  if (id) {
    tapHandlers?.onMarkerTap(id);
    return;
  }
  const w = worldFromScr(x, y);
  // тап по будівлі наводить приціл точно в її центр
  const b = buildingIndexFor(currentMeta().id)?.findAt(w.x, w.z, AIM_SNAP_TAP_M);
  if (b) flyToWorld(b.cx, b.cz);
  else flyToWorld(w.x, w.z);
}

$<HTMLButtonElement>("zin").onclick = () => zoomAt(1.6, W / 2, viewH() / 2);
$<HTMLButtonElement>("zout").onclick = () => zoomAt(1 / 1.6, W / 2, viewH() / 2);
$<HTMLButtonElement>("fit").onclick = () => fit();

export function resetView(): void {
  syncImageSize();
  fit();
}
