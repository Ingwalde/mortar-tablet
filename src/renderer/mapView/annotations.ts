import { spreadOutline } from "@core/spread";
import { pointInPolygon, polygonArea } from "@core/buildings";
import { buildingIndexFor, buildingsLoading } from "../buildings";
import { currentMeta, getCurrent, getVisibleMarkers } from "../state";
import { t } from "../i18n";
import { centerWorld } from "./viewport";
import { gfx, scrFromPx, scrFromWorld, worldFromScr } from "./state";
import { callbacks } from "./callbacks";

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

export const AIM_SNAP_TAP_M = 1.5;

/** Будівля під прицілом (центр екрана всередині контуру); null — прицілу нічого прив'язувати. */
export function aimBuilding(): { cx: number; cz: number; pts: Float32Array } | null {
  const idx = buildingIndexFor(currentMeta().id);
  if (!idx) return null;
  const w = centerWorld();
  const b = idx.findAt(w.x, w.z, 0.5);
  return b ? { cx: b.cx, cz: b.cz, pts: b.pts } : null;
}

/** Тонка підсвітка будівлі під прицілом: видно, що мітка стане в її центр. */
export function drawAimBuilding(c: Record<string, string>): void {
  const b = aimBuilding();
  if (!b) return;
  let minX = Infinity;
  let maxX = -Infinity;
  gfx.ctx.save();
  gfx.ctx.beginPath();
  for (let i = 0; i < b.pts.length; i += 2) {
    const p = scrFromWorld(b.pts[i], b.pts[i + 1]);
    minX = Math.min(minX, p.sx);
    maxX = Math.max(maxX, p.sx);
    if (i === 0) gfx.ctx.moveTo(p.sx, p.sy);
    else gfx.ctx.lineTo(p.sx, p.sy);
  }
  gfx.ctx.closePath();
  if (maxX - minX >= 6) {
    gfx.ctx.globalAlpha = 0.16;
    gfx.ctx.fillStyle = c.accent;
    gfx.ctx.fill();
    gfx.ctx.globalAlpha = 0.95;
    gfx.ctx.strokeStyle = c.accent;
    gfx.ctx.lineWidth = 2;
    gfx.ctx.stroke();
  }
  gfx.ctx.restore();
}

/** Червона будівля (або круг, якщо контуру нема) з підписом «Зруйновано» посередині. */
export function drawDestroyed(): void {
  const shapes = destroyedShapes();
  if (!shapes.length) return;
  gfx.ctx.save();
  for (const sh of shapes) {
    let minX = Infinity;
    let maxX = -Infinity;
    // горизонтальна й вертикальна «хорда» через центр: стільки місця реально є під підпис
    let chordW = 0;
    let chordH = 0;
    gfx.ctx.beginPath();
    if (sh.polys.length) {
      const cc = scrFromWorld(sh.cx, sh.cz);
      for (const poly of sh.polys) {
        const scr: { x: number; y: number }[] = [];
        for (let i = 0; i < poly.length; i += 2) {
          const p = scrFromWorld(poly[i], poly[i + 1]);
          scr.push({ x: p.sx, y: p.sy });
          minX = Math.min(minX, p.sx);
          maxX = Math.max(maxX, p.sx);
          if (i === 0) gfx.ctx.moveTo(p.sx, p.sy);
          else gfx.ctx.lineTo(p.sx, p.sy);
        }
        gfx.ctx.closePath();
        // хорда береться в тому контурі, де лежить центр підпису
        if (chordW === 0 && pointInPolygon(sh.cx, sh.cz, poly)) {
          chordW = chordThrough(scr, cc.sx, cc.sy, true);
          chordH = chordThrough(scr, cc.sx, cc.sy, false);
        }
      }
    } else {
      const c0 = scrFromWorld(sh.cx, sh.cz);
      const r = Math.max(6, Math.abs(scrFromWorld(sh.cx + DESTROYED_FALLBACK_RADIUS_M, sh.cz).sx - c0.sx));
      gfx.ctx.arc(c0.sx, c0.sy, r, 0, Math.PI * 2);
      minX = c0.sx - r;
      maxX = c0.sx + r;
      chordW = chordH = r * 2;
    }
    if (maxX < -50 || minX > gfx.W + 50) continue;
    gfx.ctx.fillStyle = "rgba(224,49,49,0.58)";
    gfx.ctx.fill();
    gfx.ctx.strokeStyle = "#a51111";
    gfx.ctx.lineWidth = 2;
    gfx.ctx.stroke();
    // підпис посередині: лише коли вміщається (на далекому масштабі будівля — крапка)
    const label = t("destroyedLabel");
    gfx.ctx.font = '700 12px "IBM Plex Sans Condensed",sans-serif';
    const tw = gfx.ctx.measureText(label).width;
    // вміщаємо і за шириною, і за висотою хорди (текст горизонтальний, а будівля може бути повернута)
    const size = Math.min(15, (12 * chordW * 0.9) / tw, chordH * 0.8);
    if (size >= 8) {
      const c1 = scrFromWorld(sh.cx, sh.cz);
      gfx.ctx.font = `700 ${size.toFixed(1)}px "IBM Plex Sans Condensed",sans-serif`;
      gfx.ctx.textAlign = "center";
      gfx.ctx.textBaseline = "middle";
      gfx.ctx.lineWidth = Math.max(2, size / 5);
      gfx.ctx.strokeStyle = "rgba(60,0,0,0.85)";
      gfx.ctx.strokeText(label, c1.sx, c1.sy);
      gfx.ctx.fillStyle = "#ffffff";
      gfx.ctx.fillText(label, c1.sx, c1.sy);
    }
  }
  gfx.ctx.restore();
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
export function hitTestDestroyed(sx: number, sy: number): string | null {
  const w = worldFromScr(sx, sy);
  for (const sh of destroyedShapes()) {
    const hit = sh.polys.length
      ? sh.polys.some((p) => pointInPolygon(w.x, w.z, p))
      : Math.hypot(w.x - sh.cx, w.z - sh.cz) <= DESTROYED_FALLBACK_RADIUS_M;
    if (hit) return sh.markerId;
  }
  return null;
}

export function drawSpread(c: Record<string, string>): void {
  const sp = callbacks.spread();
  if (!sp) return;
  const pts = spreadOutline(sp.x, sp.z, sp.ux, sp.uz, sp.a, sp.b).map((p) => scrFromWorld(p.x, p.z));
  gfx.ctx.save();
  gfx.ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? gfx.ctx.moveTo(p.sx, p.sy) : gfx.ctx.lineTo(p.sx, p.sy)));
  gfx.ctx.closePath();
  gfx.ctx.globalAlpha = 0.16;
  gfx.ctx.fillStyle = c.target;
  gfx.ctx.fill();
  gfx.ctx.globalAlpha = 0.9;
  gfx.ctx.strokeStyle = c.target;
  gfx.ctx.lineWidth = 1.5;
  gfx.ctx.setLineDash(gfx.lightMode ? [] : [5, 4]);
  gfx.ctx.stroke();
  gfx.ctx.restore();
}

export function drawFiringLine(c: Record<string, string>): void {
  const pair = callbacks.firePair();
  if (!pair) return;
  const a = scrFromWorld(pair.m.x, pair.m.z);
  const b = scrFromWorld(pair.t.x, pair.t.z);
  gfx.ctx.setLineDash([7, 5]);
  gfx.ctx.strokeStyle = c.target;
  gfx.ctx.lineWidth = 2;
  gfx.ctx.beginPath();
  gfx.ctx.moveTo(a.sx, a.sy);
  gfx.ctx.lineTo(b.sx, b.sy);
  gfx.ctx.stroke();
  gfx.ctx.setLineDash([]);
}

export function drawCalibPoints(c: Record<string, string>): void {
  const S = getCurrent();
  if (S.calib.mode !== "points") return;
  for (const key of ["a", "b"] as const) {
    const p = S.calib[key];
    if (!p) continue;
    const s = scrFromPx(p.px, p.py);
    gfx.ctx.strokeStyle = c.point;
    gfx.ctx.lineWidth = 2;
    gfx.ctx.beginPath();
    gfx.ctx.arc(s.sx, s.sy, 9, 0, Math.PI * 2);
    gfx.ctx.stroke();
    gfx.ctx.fillStyle = c.point;
    gfx.ctx.font = '700 12px "IBM Plex Sans Condensed",sans-serif';
    gfx.ctx.fillText(key.toUpperCase(), s.sx + 11, s.sy - 6);
  }
}
