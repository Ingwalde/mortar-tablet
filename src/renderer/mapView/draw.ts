import { setBuildingsLoadedHook } from "../buildings";
import { currentMeta, getCurrent } from "../state";
import { clearRedrawFlag, requestDraw, setDrawFn } from "./redraw";
import { beginTileFrame, cancelStale, drawOnlineTiles, drawPyramid, tileGeneration, tilesFading } from "./tiles";
import { cv, gfx, mainCtx, mapColors, ov, overlayCtx, usesOnlineTiles, view } from "./state";
import { monitorFrame, updateReadout } from "./viewport";
import { drawGrid } from "./grid";
import { drawRangeRings, drawShots, isAnimating } from "./shots";
import { drawAimBuilding, drawCalibPoints, drawDestroyed, drawFiringLine, drawSpread } from "./annotations";
import { drawPlaces } from "./places";
import { drawMarkers } from "./markers";

/** Буфер базового шару (тайли + сітка): перемальовується лише коли змінився вид, тайли чи тема. */
const baseCanvas = document.createElement("canvas");

const baseCtx = baseCanvas.getContext("2d")!;

let baseKey = "";

function draw(): void {
  clearRedrawFlag();
  beginTileFrame();
  if (!gfx.W) return;
  const c = mapColors();
  const S = getCurrent();

  const key = [
    cv.width,
    cv.height,
    gfx.dpr,
    view.k.toFixed(6),
    view.ox.toFixed(2),
    view.oy.toFixed(2),
    tileGeneration(),
    S.map ? JSON.stringify(S.map) : "",
    JSON.stringify(S.calib),
    currentMeta().id,
    c.blank,
    c.grid,
    c.fine
  ].join("|");

  const moving = monitorFrame(`${cv.width}x${cv.height}|${view.k.toFixed(6)}|${view.ox.toFixed(2)}|${view.oy.toFixed(2)}`);
  const drawBase = (): void => {
    gfx.ctx.setTransform(gfx.dpr, 0, 0, gfx.dpr, 0, 0);
    gfx.ctx.globalAlpha = 1;
    gfx.ctx.fillStyle = c.blank;
    gfx.ctx.fillRect(0, 0, gfx.W, gfx.H);
    if (S.map?.kind === "pyramid") drawPyramid();
    else if (usesOnlineTiles()) drawOnlineTiles();
    drawGrid(c);
  };

  let renderedBase = false;
  if (moving) {
    // Карта рухається: кожен кадр і так новий, буфер лише додав би копіювання на весь екран.
    renderedBase = true;
    gfx.ctx = mainCtx;
    drawBase();
    baseKey = ""; // для наступного нерухомого кадру буфер перебудується
  } else {
    if (key !== baseKey) {
      renderedBase = true;
      if (baseCanvas.width !== cv.width || baseCanvas.height !== cv.height) {
        baseCanvas.width = cv.width;
        baseCanvas.height = cv.height;
      }
      gfx.ctx = baseCtx;
      drawBase();
      gfx.ctx = mainCtx;
      // Поки тайли з'являються плавно, шар не вважаємо готовим — наступний кадр його перемалює.
      baseKey = tilesFading() ? "" : key;
    }
    gfx.ctx.setTransform(1, 0, 0, 1, 0, 0);
    gfx.ctx.drawImage(baseCanvas, 0, 0);
  }
  const baseDpr = gfx.dpr;
  if (gfx.overlayActive) {
    // шар підписів: чистимо й малюємо в повній роздільності (спрайти тексту беруть dpr звідси)
    gfx.dpr = gfx.overlayDpr;
    gfx.ctx = overlayCtx;
    gfx.ctx.setTransform(1, 0, 0, 1, 0, 0);
    gfx.ctx.clearRect(0, 0, ov.width, ov.height);
  }
  try {
    gfx.ctx.setTransform(gfx.dpr, 0, 0, gfx.dpr, 0, 0);
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
    if (gfx.overlayActive) {
      gfx.dpr = baseDpr;
      gfx.ctx = mainCtx;
    }
  }
  updateReadout();
  // запити скасовуємо лише коли набір потрібних тайлів перераховано в цьому кадрі
  if (renderedBase) cancelStale();
  // тайли ще з'являються плавно або міна в польоті — домалювати наступний кадр
  if (tilesFading() || isAnimating()) requestDraw();
}

setDrawFn(draw);

// дані будівель підвантажились — перемалювати зруйновані
setBuildingsLoadedHook(requestDraw);
