import { t } from "../i18n";
import { requestDraw } from "./redraw";
import { gfx, scrFromWorld } from "./state";
import { callbacks } from "./callbacks";

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

/** Чи летить хоч одна міна: тоді наступний кадр треба домалювати. */
export function isAnimating(): boolean {
  return animating;
}

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

export function drawShots(c: Record<string, string>): void {
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
      gfx.ctx.save();
      // пляма на землі: темніє одразу й повільно блякне
      gfx.ctx.globalAlpha = 0.3 * Math.min(1, k * 8) * (1 - Math.max(0, (k - 0.45) / 0.55));
      gfx.ctx.fillStyle = "#000";
      gfx.ctx.beginPath();
      gfx.ctx.ellipse(b.sx, b.sy, 9 + e1 * 5, 6 + e1 * 3.5, 0, 0, Math.PI * 2);
      gfx.ctx.fill();
      // яскравий спалах у перші мілісекунди
      if (k < 0.3) {
        const f = 1 - k / 0.3;
        const g = gfx.ctx.createRadialGradient(b.sx, b.sy, 0, b.sx, b.sy, 10 + (1 - f) * 26);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.4, "rgba(255,190,110,0.8)");
        g.addColorStop(1, "rgba(255,140,60,0)");
        gfx.ctx.globalAlpha = f;
        gfx.ctx.fillStyle = g;
        gfx.ctx.beginPath();
        gfx.ctx.arc(b.sx, b.sy, 10 + (1 - f) * 26, 0, Math.PI * 2);
        gfx.ctx.fill();
      }
      // дві ударні хвилі
      gfx.ctx.strokeStyle = c.target;
      for (const [delay, maxR, lw] of [
        [0, 56, 3.4],
        [0.1, 36, 2.2]
      ]) {
        const kk = (k - delay) / (1 - delay);
        if (kk <= 0) continue;
        const ee = 1 - Math.pow(1 - kk, 3);
        gfx.ctx.globalAlpha = (1 - kk) * 0.85;
        gfx.ctx.lineWidth = lw * (1 - kk) + 0.8;
        gfx.ctx.beginPath();
        gfx.ctx.arc(b.sx, b.sy, 6 + ee * maxR, 0, Math.PI * 2);
        gfx.ctx.stroke();
      }
      // уламки: короткі промені, що розлітаються
      gfx.ctx.lineCap = "round";
      gfx.ctx.lineWidth = 1.6;
      for (let i = 0; i < 10; i++) {
        const ang = i * 0.628 + 0.3;
        const r0 = 4 + e1 * 30 * (0.7 + 0.15 * (i % 3));
        const len = Math.max(0, 10 * (1 - k));
        gfx.ctx.globalAlpha = 1 - k;
        gfx.ctx.beginPath();
        gfx.ctx.moveTo(b.sx + Math.cos(ang) * r0, b.sy + Math.sin(ang) * r0);
        gfx.ctx.lineTo(b.sx + Math.cos(ang) * (r0 + len), b.sy + Math.sin(ang) * (r0 + len));
        gfx.ctx.stroke();
      }
      // дим: кілька кіл, що здіймаються й розпливаються
      gfx.ctx.fillStyle = c.ink;
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.256 + 0.7;
        gfx.ctx.globalAlpha = 0.22 * (1 - k) * Math.min(1, k * 6);
        gfx.ctx.beginPath();
        gfx.ctx.arc(b.sx + Math.cos(ang) * (6 + e1 * 14), b.sy + Math.sin(ang) * (4 + e1 * 8) - e1 * 16, 4 + e1 * 9, 0, Math.PI * 2);
        gfx.ctx.fill();
      }
      gfx.ctx.restore();
      continue;
    }
    gfx.ctx.save();
    // траєкторія — тонка пунктирна дуга
    gfx.ctx.globalAlpha = 0.35;
    gfx.ctx.strokeStyle = c.ink;
    gfx.ctx.lineWidth = 1;
    gfx.ctx.setLineDash([3, 5]);
    gfx.ctx.beginPath();
    for (let k = 0; k <= 1.001; k += 0.04) {
      const p = at(Math.min(1, k));
      if (k === 0) gfx.ctx.moveTo(p.x, p.y);
      else gfx.ctx.lineTo(p.x, p.y);
    }
    gfx.ctx.stroke();
    gfx.ctx.setLineDash([]);
    // слід за міною, що меркне
    for (let j = 10; j >= 1; j--) {
      const kk = Math.max(0, u - j * 0.012);
      const p = at(kk);
      gfx.ctx.globalAlpha = (1 - j / 11) * 0.5;
      gfx.ctx.fillStyle = c.target;
      gfx.ctx.beginPath();
      gfx.ctx.arc(p.x, p.y, 2.6 * (1 - j / 14), 0, Math.PI * 2);
      gfx.ctx.fill();
    }
    // тінь на землі й сама міна: вузький корпус зі стабілізатором, носом уздовж руху
    const p = at(u);
    const alt = 4 * u * (1 - u);
    gfx.ctx.globalAlpha = 0.35;
    gfx.ctx.fillStyle = c.ink;
    gfx.ctx.beginPath();
    gfx.ctx.ellipse(p.ground.x, p.ground.y, 7 - alt * 2.5, 2.6 - alt, 0, 0, Math.PI * 2);
    gfx.ctx.fill();
    // напрям руху: похідна дуги (по екрану) — міна «дивиться» вперед і на вершині перекидається вниз
    const vx = b.sx - a.sx;
    const vy = b.sy - a.sy - 4 * arcH * (1 - 2 * u);
    drawShellIcon(gfx.ctx, p.x, p.y, Math.atan2(vy, vx), 1 + alt * 0.28, c);
    gfx.ctx.restore();
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
  const x1 = gfx.W + m;
  const y1 = gfx.H + m;
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
  gfx.ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const ang = i * step;
    const px = cx + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r;
    const inside = px >= x0 && px <= x1 && py >= y0 && py <= y1;
    if (inside) {
      if (!pen) gfx.ctx.moveTo(px, py);
      else gfx.ctx.lineTo(px, py);
      pen = true;
    } else {
      pen = false;
    }
  }
  gfx.ctx.stroke();
}

/** Кільця дальності: зовнішнє — максимум заряду, внутрішнє пунктиром — мінімум; активний заряд яскравіший. */
export function drawRangeRings(c: Record<string, string>): void {
  if (!ringsVisible) return;
  const spec = callbacks.rings();
  if (!spec || !spec.rings.length) return;
  const center = scrFromWorld(spec.x, spec.z);
  const pxPerM = Math.abs(scrFromWorld(100, 0).sx - scrFromWorld(0, 0).sx) / 100;
  gfx.ctx.save();
  gfx.ctx.lineJoin = "round";
  for (const r of spec.rings) {
    const outer = r.max * pxPerM;
    const inner = r.min * pxPerM;
    if (outer < 3 || outer > 40000) continue;
    // заливка зони дії (мін–макс) лише коли обидва кола помірні: гігантський кільцевий шлях сильно гальмує
    if (r.active && !gfx.lightMode && outer < 3000) {
      gfx.ctx.globalAlpha = 0.07;
      gfx.ctx.fillStyle = c.mortar;
      gfx.ctx.beginPath();
      gfx.ctx.arc(center.sx, center.sy, outer, 0, Math.PI * 2);
      gfx.ctx.arc(center.sx, center.sy, inner, 0, Math.PI * 2, true);
      gfx.ctx.fill("evenodd");
    }
    gfx.ctx.globalAlpha = r.active ? 0.95 : 0.3;
    gfx.ctx.strokeStyle = c.mortar;
    gfx.ctx.lineWidth = r.active ? 2 : 1;
    // пунктир — лише в звичайному режимі й для невеликих кіл; поза екраном нічого не малюємо
    gfx.ctx.setLineDash(r.active || gfx.lightMode || outer > 3000 ? [] : [5, 5]);
    strokeArcInView(center.sx, center.sy, outer);
    if (r.active && inner > 3) {
      gfx.ctx.setLineDash(gfx.lightMode || inner > 3000 ? [] : [7, 5]);
      gfx.ctx.lineWidth = 1.5;
      strokeArcInView(center.sx, center.sy, inner);
    }
  }
  // підписи лише активного кільця, над ним (на півночі)
  const active = spec.rings.find((r) => r.active);
  if (active) {
    gfx.ctx.setLineDash([]);
    gfx.ctx.globalAlpha = 1;
    gfx.ctx.font = '600 11.5px "IBM Plex Sans Condensed",sans-serif';
    gfx.ctx.textAlign = "center";
    gfx.ctx.textBaseline = "bottom";
    gfx.ctx.shadowColor = c.surface;
    gfx.ctx.shadowBlur = 4;
    gfx.ctx.fillStyle = c.mortar;
    const outer = active.max * pxPerM;
    if (outer > 24) {
      gfx.ctx.fillText(t("ringLabelCharge", { c: active.level, max: active.max }), center.sx, center.sy - outer - 4);
    }
    const inner = active.min * pxPerM;
    if (inner > 24) gfx.ctx.fillText(t("ringLabelMin", { min: active.min }), center.sx, center.sy - inner - 4);
    gfx.ctx.shadowBlur = 0;
    gfx.ctx.textAlign = "left";
  }
  gfx.ctx.restore();
}
