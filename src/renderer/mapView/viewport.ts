import { fmtM, gridRef, metersPerPx, pxFromWorld, type Vec2 } from "@core/geometry";
import { FrameMonitor } from "@core/frameMonitor";
import { currentMeta } from "../state";
import { $ } from "../dom";
import { t } from "../i18n";
import { reducedMotion } from "../motion";
import { isRemote } from "../platform";
import { heightAt, onHeightsLoaded } from "../terrainHeight";
import { cv, geometry, gfx, ov, pxFromScr, view, viewH, worldFromScr } from "./state";
import { requestDraw } from "./redraw";

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

gfx.lightMode = readLight() ?? false;

/** Користувач явно вибрав режим — автоматика більше його не змінює. */
let lightManual = readLight() !== null;

export function isLightMode(): boolean {
  return gfx.lightMode;
}

export function setLightMode(on: boolean, manual = true): void {
  if (gfx.lightMode === on) {
    if (manual) lightManual = true;
    return;
  }
  gfx.lightMode = on;
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

export function monitorFrame(sig: string): boolean {
  const now = performance.now();
  const moving = sig !== lastViewSig;
  lastViewSig = sig;
  const slow = frameMonitor.frame(now, moving);
  if (moving) lastViewChangeAt = now;
  if (slow && !gfx.lightMode && !lightManual) setLightMode(true, false);
  return moving;
}

/** Карта зараз рухається (жест/зум/анімація): у цей час не завантажуємо тайли наперед. */
export function interacting(): boolean {
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
  return worldFromScr(gfx.W / 2, viewH() / 2);
}

function kLimits() {
  const fitK = Math.min(gfx.W / gfx.imgW, viewH() / gfx.imgH);
  return { min: fitK * 0.5, max: Math.max(fitK * 2, 60 * metersPerPx(geometry())) };
}

export function fit(): void {
  cancelFly();
  if (!gfx.W) return;
  const vh = viewH();
  view.k = Math.min(gfx.W / gfx.imgW, vh / gfx.imgH) * 0.96;
  view.ox = (gfx.W - gfx.imgW * view.k) / 2;
  view.oy = (vh - gfx.imgH * view.k) / 2;
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
export function cancelFly(): void {
  if (flyId !== null) cancelAnimationFrame(flyId);
  flyId = null;
}

/** Плавно їде до точки: карта прискорюється й гальмує замість того, щоб стрибнути. */
export function flyToWorld(x: number, z: number): void {
  const p = pxFromWorld(geometry(), x, z);
  const tx = gfx.W / 2 - p.px * view.k;
  const ty = viewH() / 2 - p.py * view.k;
  cancelFly();
  const sx = view.ox;
  const sy = view.oy;
  const dist = Math.hypot(tx - sx, ty - sy);
  if (!gfx.W || dist < 3 || reducedMotion()) {
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
  view.ox = gfx.W / 2 - p.px * view.k;
  view.oy = viewH() / 2 - p.py * view.k;
  requestDraw();
}

function resize(): void {
  const r = cv.getBoundingClientRect();
  // На телефоні (3× екран) полотно в 3× важке для перемальовування щокадру; 2× майже не відрізнити, а тече плавніше.
  gfx.dpr = gfx.lightMode ? 1 : Math.min(window.devicePixelRatio || 1, isRemote ? 2 : 4);
  // у економному режимі підписи малюємо окремим шаром у повній (до 2×) роздільності: це дешево, а текст не розмивається
  gfx.overlayDpr = Math.min(window.devicePixelRatio || 1, 2);
  gfx.overlayActive = gfx.lightMode && gfx.overlayDpr > gfx.dpr;
  const first = gfx.W === 0;
  // Світова точка під центром (під прицілом) лишається на місці, коли розмір карти міняється
  // (бровка панелі, режим на весь екран, зміна вікна) — інакше приціл зсувався б із цілі.
  const cx = first ? 0 : (gfx.W / 2 - view.ox) / view.k;
  const cy = first ? 0 : (viewH() / 2 - view.oy) / view.k;
  gfx.W = r.width;
  gfx.H = r.height;
  cv.width = Math.round(gfx.W * gfx.dpr);
  cv.height = Math.round(gfx.H * gfx.dpr);
  ov.hidden = !gfx.overlayActive;
  if (gfx.overlayActive) {
    ov.width = Math.round(gfx.W * gfx.overlayDpr);
    ov.height = Math.round(gfx.H * gfx.overlayDpr);
  }
  if (first) fit();
  else {
    view.ox = gfx.W / 2 - cx * view.k;
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

export function updateReadout(): void {
  const w = centerWorld();
  $("coords").querySelector(".grid")!.textContent = gridRef(w.x, w.z);
  const u = t("unitM");
  const meta = currentMeta();
  const h = heightAt(meta.id, w.x, w.z, meta.sizeX, meta.sizeZ);
  $("coords").querySelector(".m")!.textContent =
    "X " + fmtM(w.x) + " " + u + "   Z " + fmtM(w.z) + " " + u + (h !== null ? "   h " + fmtM(h) + " " + u : "");
}
