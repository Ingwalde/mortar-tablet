import { buildingIndexFor } from "../buildings";
import { currentMeta, getVisibleMarkers, type Marker } from "../state";
import { $ } from "../dom";
import { cv, gfx, pxFromScr, scrFromWorld, syncImageSize, view, viewH, worldFromScr } from "./state";
import { callbacks } from "./callbacks";
import { cancelFly, fit, flyToWorld, zoomAt } from "./viewport";
import { requestDraw } from "./redraw";
import { AIM_SNAP_TAP_M, hitTestDestroyed } from "./annotations";

// ---------- gestures ----------
export interface TapHandlers {
  onMarkerTap: (id: string) => void;
  /** Чи можна зараз пересунути мітку мишкою чи пальцем (у відділенні після кінця гри — ні). */
  canDragMarker?: (id: string) => boolean;
  /** Мітку пересунуто: застосунок зберігає зміну й перемальовує списки. */
  onMarkerMoved?: (id: string) => void;
}

export function centerPx(): { px: number; py: number } {
  return pxFromScr(gfx.W / 2, viewH() / 2);
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

$<HTMLButtonElement>("zin").onclick = () => zoomAt(1.6, gfx.W / 2, viewH() / 2);

$<HTMLButtonElement>("zout").onclick = () => zoomAt(1 / 1.6, gfx.W / 2, viewH() / 2);

$<HTMLButtonElement>("fit").onclick = () => fit();

export function resetView(): void {
  syncImageSize();
  fit();
}
