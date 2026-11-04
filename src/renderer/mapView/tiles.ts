import { tileIndexForWorld, tileSpan } from "@core/onlineTiles";
import { PYRAMID_TILE_SIZE, type PyramidPlan } from "@core/tilePyramid";
import { currentMeta } from "../state";
import { isRemote, onlineTileSrc, pyramidTileSrc } from "../platform";
import { gfx, scrFromPx, scrFromWorld, view, worldFromScr } from "./state";
import { requestDraw } from "./redraw";
import { interacting } from "./viewport";

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

export function cancelStale(): void {
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
  if (gfx.lightMode) return 1;
  const e = tileCache.get(url);
  if (!e?.loadedAt) return 1;
  const a = (performance.now() - e.loadedAt) / TILE_FADE_MS;
  if (a >= 1) return 1;
  fading = true;
  return Math.max(0.05, a);
}

let fading = false;

/** Початок кадру: скидає прапорець плавної появи й набір потрібних тайлів. */
export function beginTileFrame(): void {
  fading = false;
  wantedThisFrame = new Set<string>();
}

export function tileGeneration(): number {
  return tileGen;
}

/** Чи є тайли, що ще з'являються плавно: тоді наступний кадр треба домалювати. */
export function tilesFading(): boolean {
  return fading;
}

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
      // найновіше використаний — у кінець черги: вилучається найдавніший, а не завжди той самий грубий оглядовий тайл
      tileCache.delete(url);
      tileCache.set(url, e);
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
      if (pending.has(k)) continue; // ще вантажиться: не вилучаємо, інакше його запросять удруге
      tileCache.delete(k);
    }
  }
  return null;
}

export function drawOnlineTiles(): void {
  const maxLod = currentMeta().preset!.tiles!.maxLod;
  const pxPerM = Math.abs(scrFromWorld(100, 0).sx - scrFromWorld(0, 0).sx) / 100;
  let lod = Math.floor(Math.log2(256 / (tileSpan(0) * pxPerM * Math.min(gfx.dpr, 2))));
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
  const w1 = worldFromScr(gfx.W, gfx.H);
  const min = tileIndexForWorld(Math.min(w0.x, w1.x), Math.min(w0.z, w1.z), lod);
  const max = tileIndexForWorld(Math.max(w0.x, w1.x), Math.max(w0.z, w1.z), lod);
  const tx0 = Math.max(0, min.x);
  const tx1 = Math.min(Math.ceil(meta.sizeX / span), max.x);
  const ty0 = Math.max(0, min.y);
  const ty1 = Math.min(Math.ceil(meta.sizeZ / span), max.y);
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 400) return;
  if (prefetch && fetchIt && !gfx.lightMode && !interacting()) {
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
      const prevA = gfx.ctx.globalAlpha;
      gfx.ctx.globalAlpha = prevA * tileAlpha(url);
      gfx.ctx.drawImage(im, a.sx, a.sy, b.sx - a.sx + 0.6, b.sy - a.sy + 0.6);
      gfx.ctx.globalAlpha = prevA;
    }
  }
}

function pickPyramidLevel(plan: PyramidPlan): number {
  const need = gfx.imgW * view.k * gfx.dpr * 0.85;
  for (const l of plan.levels) if (l.width >= need) return l.z;
  return plan.maxLevel;
}

function drawPyramidLevel(z: number, fetchIt: boolean, prefetch = false): boolean {
  if (!gfx.pyramidPlan) return false;
  const level = gfx.pyramidPlan.levels[z];
  const fx = gfx.imgW / level.width;
  const fy = gfx.imgH / level.height;
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
      if (a.sx > gfx.W || a.sy > gfx.H || a.sx + w < 0 || a.sy + h < 0) {
        // поза екраном, але впритул — завантажуємо наперед (без малювання й без індикатора)
        if (prefetch && fetchIt && !gfx.lightMode && !interacting() && a.sx < gfx.W + w && a.sy < gfx.H + h && a.sx + w > -w && a.sy + h > -h) {
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
        const prevA = gfx.ctx.globalAlpha;
        gfx.ctx.globalAlpha = prevA * tileAlpha(url);
        gfx.ctx.drawImage(im, 0, 0, tileSrcW, tileSrcH, a.sx, a.sy, w + 0.6, h + 0.6);
        gfx.ctx.globalAlpha = prevA;
      } else all = false;
    }
  }
  return all;
}

export function drawPyramid(): void {
  if (!gfx.pyramidPlan) return;
  const z = pickPyramidLevel(gfx.pyramidPlan);
  // грубий рівень 0 одразу як підклад, тоді ціль зверху — щоб не блимало порожнечею,
  // поки вантажаться тайли потрібної деталізації.
  drawPyramidLevel(0, true);
  if (z >= 2) drawPyramidLevel(z - 1, false);
  if (z > 0) drawPyramidLevel(z, true, true);
}
