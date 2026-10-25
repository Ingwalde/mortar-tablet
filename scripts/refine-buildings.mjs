// Підганяє контури будівель під справжні дахи на карті: у .topo контур — лише орієнтований прямокутник, а дах буває Г-подібним, з прибудовою, заокругленою апсидою.
// Дах знаходиться сегментацією зображення карти за кольором (земля навколо проти даху всередині), потім контур спрощується до ортогонального багатокутника в осях будівлі.
// Будівлі, де дах не відрізняється від землі (сірий дах на асфальті) або сегментація сумнівна, лишаються прямокутниками як у .topo.
//   node scripts/refine-buildings.mjs <id> [--in <файл.ts|.bin>] [--out <файл.ts>] [--preview <x> <z> <радіус м> <картинка.png>]
// Знімок для кожного терену береться так: онлайн-тайли (everon, arland, kolguyev) або локальна піраміда з папки maps застосунку (змінна MORTAR_MAPS, типово %APPDATA%/mortar-tablet/maps).
// Формат результату той самий, що в extract-buildings.mjs ("BLD1"), лише вершин на будівлю може бути більше 4 (до 255).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const id = args[0];
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.slice(i + 1); };
if (!id || id.startsWith("--")) {
  console.error("Використання: node scripts/refine-buildings.mjs <id> [--in файл] [--out файл.ts] [--preview x z радіус картинка.png]");
  process.exit(2);
}
const terrains = JSON.parse(readFileSync(root + "src/core/terrains-data.json", "utf8"));
const terrain = terrains.find((x) => x.id === id);
if (!terrain) { console.error("нема терену " + id); process.exit(2); }
const inPath = opt("--in")?.[0] ?? root + `src/core/buildings/${id}.ts`;
const outPath = opt("--out")?.[0] ?? null;
const preview = opt("--preview");

// ---------- вхідні контури ----------
function decode(path) {
  let bytes = readFileSync(path);
  if (path.endsWith(".ts")) bytes = Buffer.from(/export default "([^"]+)"/.exec(bytes.toString("utf8"))[1], "base64");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  for (let i = 0, o = 8, n0 = dv.getUint32(4, true); i < n0; i++) {
    const n = bytes[o++];
    const pts = [];
    for (let k = 0; k < n; k++) { pts.push([dv.getUint16(o, true) / 4, dv.getUint16(o + 2, true) / 4]); o += 4; }
    out.push(pts);
  }
  return out;
}
const buildings = decode(inPath);

// ---------- зображення ----------
const mapsDir = process.env.MORTAR_MAPS ?? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "mortar-tablet", "maps");
const OFFSET = 50;
const CACHE = process.env.MORTAR_TILE_CACHE ?? join(root, "node_modules", ".cache", "refine-buildings");
const lruMax = 400;
const lru = new Map();
function lruGet(key) { const v = lru.get(key); if (v !== undefined) { lru.delete(key); lru.set(key, v); } return v; }
function lruPut(key, v) { lru.set(key, v); if (lru.size > lruMax) lru.delete(lru.keys().next().value); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Онлайн-тайли LOD0: 512 px на ≈100 м. */
function onlineSource(t) {
  const SPAN = (12.501 * 256) / 32, PX = 512;
  mkdirSync(join(CACHE, id), { recursive: true });
  return {
    pxPerM: PX / SPAN,
    blur: 1.1,
    locate(x, z) {
      const tx = Math.floor((x + OFFSET) / SPAN), ty = Math.floor((z + OFFSET) / SPAN);
      return { key: tx + "_" + ty, px: ((x + OFFSET) / SPAN - tx) * PX, py: (1 - ((z + OFFSET) / SPAN - ty)) * PX, size: PX, tx, ty };
    },
    async load(loc) {
      const f = join(CACHE, id, loc.key + ".jpg");
      let buf = existsSync(f) ? readFileSync(f) : null;
      for (let attempt = 0; !buf && attempt < 4; attempt++) {
        try {
          const r = await fetch(`${t.tiles.base}0/${loc.tx}/${loc.ty}/tile.jpg`);
          if (r.status === 404) return null;
          if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); writeFileSync(f, buf); }
        } catch { await sleep(500 * (attempt + 1)); }
      }
      return buf ? sharp(buf).resize(PX, PX).blur(this.blur).raw().toBuffer() : null;
    }
  };
}
/** Локальна піраміда sharp (google layout): {z}/{рядок}/{стовпчик}.webp, зображення вкладене у світ [0; sizeX] x [0; sizeZ] як є. */
async function pyramidSource(t) {
  const dir = join(mapsDir, id);
  const zs = readdirSyncSafe(dir).filter((n) => /^\d+$/.test(n)).map(Number);
  if (!zs.length) return null;
  const z = Math.max(...zs), T = 256;
  const rows = readdirSyncSafe(join(dir, String(z))).filter((n) => /^\d+$/.test(n)).map(Number);
  const R = Math.max(...rows) + 1;
  const cols = readdirSyncSafe(join(dir, String(z), "0")).filter((n) => /\.(webp|jpg)$/.test(n)).map((n) => parseInt(n, 10));
  const C = Math.max(...cols) + 1;
  const ext = existsSync(join(dir, String(z), "0", "0.webp")) ? "webp" : "jpg";
  const lastW = (await sharp(join(dir, String(z), "0", `${C - 1}.${ext}`)).metadata()).width;
  const lastH = (await sharp(join(dir, String(z), String(R - 1), `0.${ext}`)).metadata()).height;
  const W = (C - 1) * T + lastW, H = (R - 1) * T + lastH;
  const spanX = t.imageSpan ?? t.sizeX, spanZ = t.imageSpan ?? t.sizeZ; // метрів, які справді покриває знімок
  return {
    pxPerM: Math.min(W / spanX, H / spanZ),
    blur: 0.8,
    W, H,
    locate(x, zz) {
      const ix = (x / spanX) * W, iy = (1 - zz / spanZ) * H;
      const col = Math.min(C - 1, Math.max(0, Math.floor(ix / T))), row = Math.min(R - 1, Math.max(0, Math.floor(iy / T)));
      return { key: row + "_" + col, px: ix - col * T, py: iy - row * T, size: T, row, col };
    },
    async load(loc) {
      const f = join(dir, String(z), String(loc.row), `${loc.col}.${ext}`);
      if (!existsSync(f)) return null;
      const m = await sharp(f).metadata();
      // тайли на краях менші за 256: доповнюємо до повного розміру, щоб індексація px/py була простою
      const img = sharp(f).extend({ right: T - m.width, bottom: T - m.height, background: "#000" }).blur(this.blur);
      return img.raw().toBuffer({ resolveWithObject: false });
    }
  };
}
import { readdirSync } from "node:fs";
function readdirSyncSafe(p) { try { return readdirSync(p); } catch { return []; } }

const source = terrain.tiles ? onlineSource(terrain) : await pyramidSource(terrain);
if (!source) { console.error(`${id}: нема ні онлайн-тайлів, ні локальної піраміди в ${mapsDir}`); process.exit(1); }
// пікселі світу: повертаємо канали 3 (без альфи): sharp .raw() для webp/jpg з альфою може дати 4 канали
const chan = 3;

async function ensure(x0, z0, x1, z1) {
  const need = new Set(), locs = [];
  const step = (256 / source.pxPerM) * 0.9;
  for (let x = x0; x <= x1 + step; x += step) for (let z = z0; z <= z1 + step; z += step) {
    const l = source.locate(Math.min(x, x1), Math.min(z, z1));
    if (!need.has(l.key)) { need.add(l.key); locs.push(l); }
  }
  await Promise.all(locs.map(async (l) => {
    if (lruGet(l.key) !== undefined) return;
    const raw = await source.load(l);
    lruPut(l.key, raw ? { raw, channels: raw.length / (l.size * l.size) } : null);
  }));
}
// sRGB -> Lab
const LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const f3 = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
function lab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const fx = f3((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), fy = f3(0.2126 * R + 0.7152 * G + 0.0722 * B), fz = f3((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Колір у точці світу; тайли мають бути завантажені через ensure(). null — немає зображення. */
function labAt(x, z) {
  const l = source.locate(x, z);
  const t = lruGet(l.key);
  if (!t) return null;
  const px = Math.min(l.size - 1, Math.max(0, Math.floor(l.px))), py = Math.min(l.size - 1, Math.max(0, Math.floor(l.py)));
  const i = (py * l.size + px) * t.channels;
  return lab(t.raw[i], t.raw[i + 1], t.raw[i + 2]);
}
void chan;

function kmeans(pts, k, init, iters = 12) {
  let c = init.map((p) => p.slice());
  for (let it = 0; it < iters; it++) {
    const sum = c.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const d = dE(p, c[j]); if (d < bd) { bd = d; bi = j; } }
      sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2] += p[2]; sum[bi][3]++;
    }
    c = c.map((cc, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : cc));
  }
  return c;
}

/** Прямокутник будівлі: центр, осі (u — уздовж довшої сторони), півдовжини. */
function rectOf(pts) {
  const c = [0, 0];
  for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; }
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!best || len > best.len) best = { len, ux: (b[0] - a[0]) / len, uz: (b[1] - a[1]) / len };
  }
  const u = [best.ux, best.uz], v = [-best.uz, best.ux];
  let a = 0, b = 0;
  for (const p of pts) { a = Math.max(a, Math.abs((p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1])); b = Math.max(b, Math.abs((p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1])); }
  return { c, u, v, a, b };
}
const inRect = (r, x, z, grow = 0) => { const s = (x - r.c[0]) * r.u[0] + (z - r.c[1]) * r.u[1], t = (x - r.c[0]) * r.v[0] + (z - r.c[1]) * r.v[1]; return Math.abs(s) <= r.a + grow && Math.abs(t) <= r.b + grow; };

const DE_EDGE = Number(process.env.DE_EDGE ?? 6), CONTRAST_MIN = Number(process.env.CONTRAST_MIN ?? 0.55);
const RES = 0.25; // м на клітинку сітки сегментації
const M = 4; // запас навколо прямокутника, м
function segment(r, neigh) {
  const nx = Math.ceil((2 * (r.a + M)) / RES), nz = Math.ceil((2 * (r.b + M)) / RES);
  const L = new Array(nx * nz), zone = new Uint8Array(nx * nz); // zone: 1 — у своєму прямокутнику, 2 — кільце землі навколо, 0 — решта або чужі контури
  const world = (i, j) => { const s = -r.a - M + (i + 0.5) * RES, t = -r.b - M + (j + 0.5) * RES; return [r.c[0] + s * r.u[0] + t * r.v[0], r.c[1] + s * r.u[1] + t * r.v[1], s, t]; };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const [x, z, s, t] = world(i, j);
    L[j * nx + i] = labAt(x, z);
    const own = Math.abs(s) <= r.a && Math.abs(t) <= r.b;
    const other = neigh.some((q) => inRect(q, x, z, 0.2));
    const d = Math.max(Math.abs(s) - r.a, Math.abs(t) - r.b);
    zone[j * nx + i] = other && !own ? 0 : own ? 1 : d > 1.2 && d < M ? 2 : 0;
  }
  const ground = [], inside = [];
  for (let k = 0; k < L.length; k++) { if (!L[k]) return null; if (zone[k] === 2) ground.push(L[k]); else if (zone[k] === 1) inside.push(L[k]); }
  if (ground.length < 30 || inside.length < 20) return null;
  const sg = [...ground].sort((a, b) => a[0] - b[0]);
  const gc = kmeans(ground, 3, [sg[Math.floor(sg.length * 0.15)], sg[Math.floor(sg.length * 0.5)], sg[Math.floor(sg.length * 0.85)]]);
  const gd = (p) => Math.min(dE(p, gc[0]), dE(p, gc[1]), dE(p, gc[2]));
  const cand = inside.filter((p) => gd(p) > 13);
  if (cand.length < inside.length * 0.12) return { fail: "same-as-ground" };
  const sc = [...cand].sort((a, b) => a[0] - b[0]);
  const rc = kmeans(cand, 2, [sc[Math.floor(sc.length * 0.25)], sc[Math.floor(sc.length * 0.75)]]);
  const mask = new Uint8Array(nx * nz);
  for (let k = 0; k < L.length; k++) {
    if (zone[k] === 0) continue;
    const dRoof = Math.min(dE(L[k], rc[0]), dE(L[k], rc[1]));
    mask[k] = dRoof < gd(L[k]) * 0.92 && dRoof < 28 ? 1 : 0;
  }
  return { nx, nz, mask, world };
}

// ---------- морфологія ----------
function dilate(m, nx, nz, rr) { const o = new Uint8Array(m.length); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { if (!m[j * nx + i]) continue; for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < nz && di * di + dj * dj <= rr * rr) o[b * nx + a] = 1; } } return o; }
function erode(m, nx, nz, rr) { return dilate(m.map((v) => 1 - v), nx, nz, rr).map((v) => 1 - v); }
function majority(m, nx, nz, rr) {
  const o = new Uint8Array(m.length);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let c = 0, n = 0;
    for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; n++; c += m[b * nx + a]; }
    o[j * nx + i] = c * 2 > n ? 1 : 0;
  }
  return o;
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function largestCC(m, nx, nz, seedMask) {
  const lab = new Int32Array(m.length).fill(-1), comps = [];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || lab[s] >= 0) continue;
    const cid = comps.length, st = [s]; lab[s] = cid; let seed = 0;
    while (st.length) { const p = st.pop(); if (seedMask[p]) seed++; const i = p % nx, j = (p - i) / nx; for (const [di, dj] of N4) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const q = b * nx + a; if (m[q] && lab[q] < 0) { lab[q] = cid; st.push(q); } } }
    comps.push(seed);
  }
  if (!comps.length) return null;
  let best = 0; for (let i = 1; i < comps.length; i++) if (comps[i] > comps[best]) best = i;
  return comps[best] ? m.map((v, p) => (lab[p] === best ? 1 : 0)) : null;
}
function fillHoles(m, nx, nz) {
  const outside = new Uint8Array(m.length), st = [];
  const push = (i, j) => { const p = j * nx + i; if (!m[p] && !outside[p]) { outside[p] = 1; st.push(p); } };
  for (let i = 0; i < nx; i++) { push(i, 0); push(i, nz - 1); }
  for (let j = 0; j < nz; j++) { push(0, j); push(nx - 1, j); }
  while (st.length) { const p = st.pop(), i = p % nx, j = (p - i) / nx; for (const [di, dj] of N4) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < nz) push(a, b); } }
  return m.map((v, p) => (v || !outside[p] ? 1 : 0));
}
/** Зовнішній контур маски: ланцюжок вершин ґратки (кожна клітинка — квадрат 1x1). */
function traceOuter(m, nx, nz) {
  const at = (i, j) => (i >= 0 && j >= 0 && i < nx && j < nz ? m[j * nx + i] : 0);
  const next = new Map();
  const add = (a, b) => { const k = a[0] + "," + a[1]; if (!next.has(k)) next.set(k, []); next.get(k).push(b); };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!at(i, j)) continue;
    if (!at(i, j - 1)) add([i, j], [i + 1, j]);
    if (!at(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
    if (!at(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
    if (!at(i - 1, j)) add([i, j + 1], [i, j]);
  }
  const used = new Set();
  let bestLoop = null;
  for (const k0 of next.keys()) {
    if (used.has(k0)) continue;
    const loop = [];
    let k = k0, prev = null;
    for (let guard = 0; guard < 200000; guard++) {
      used.add(k);
      const [i, j] = k.split(",").map(Number);
      loop.push([i, j]);
      const outs = next.get(k) || [];
      if (!outs.length) break;
      let pick = outs[0];
      if (outs.length > 1 && prev) pick = outs.map((o) => ({ o, c: prev[0] * (o[1] - j) - prev[1] * (o[0] - i) })).sort((a, b) => b.c - a.c)[0].o;
      prev = [pick[0] - i, pick[1] - j];
      const nk = pick[0] + "," + pick[1];
      if (nk === k0) break;
      k = nk;
    }
    if (!bestLoop || loop.length > bestLoop.length) bestLoop = loop;
  }
  return bestLoop;
}
/** Кути ортогонального контуру; сходинки коротші за minLen клітинок зрізаються (зсув коротшого з сусідніх ребер). */
function rectSimplify(loop, minLen) {
  let P = [];
  const n0 = loop.length;
  for (let i = 0; i < n0; i++) {
    const a = loop[(i + n0 - 1) % n0], b = loop[i], c = loop[(i + 1) % n0];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) P.push(b.slice());
  }
  const clean = () => {
    for (let changed = true; changed && P.length > 4; ) {
      changed = false;
      for (let i = 0; i < P.length; i++) {
        const a = P[(i + P.length - 1) % P.length], b = P[i], c = P[(i + 1) % P.length];
        if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]) || (a[0] === b[0] && a[1] === b[1])) { P.splice(i, 1); changed = true; break; }
      }
    }
  };
  for (let guard = 0; guard < 500 && P.length > 4; guard++) {
    const n = P.length;
    let bi = -1, bl = Infinity;
    for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; const l = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]); if (l < bl) { bl = l; bi = i; } }
    if (bl >= minLen) break;
    const g = (k) => P[((k % n) + n) % n];
    const horiz = g(bi)[1] === g(bi + 1)[1];
    const lenPrev = Math.abs(g(bi)[0] - g(bi - 1)[0]) + Math.abs(g(bi)[1] - g(bi - 1)[1]);
    const lenNext = Math.abs(g(bi + 2)[0] - g(bi + 1)[0]) + Math.abs(g(bi + 2)[1] - g(bi + 1)[1]);
    const i0 = bi % n, i1 = (bi + 1) % n;
    if (lenNext <= lenPrev) { const t = g(bi + 2), p = g(bi - 1); P[(bi + 2) % n] = horiz ? [p[0], t[1]] : [t[0], p[1]]; }
    else { const t = g(bi - 1), q = g(bi + 1); P[(((bi - 1) % n) + n) % n] = horiz ? [q[0], t[1]] : [t[0], q[1]]; }
    P = P.filter((_, k) => k !== i0 && k !== i1);
    clean();
  }
  return P;
}
const areaOf = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(s) / 2; };

/** Частка точок контуру, де колір просто всередині помітно відрізняється від кольору просто зовні (справжній край даху). */
function edgeContrast(poly, others) {
  let sgn = 0;
  for (let i = 0; i < poly.length; i++) { const q = poly[(i + 1) % poly.length]; sgn += poly[i][0] * q[1] - q[0] * poly[i][1]; }
  const k = sgn > 0 ? 1 : -1;
  let good = 0, tot = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.5) continue;
    const nx = (k * (b[1] - a[1])) / len, nz = (-k * (b[0] - a[0])) / len;
    const steps = Math.max(1, Math.floor(len / 0.6));
    for (let s = 0; s < steps; s++) {
      const f = (s + 0.5) / steps, x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
      if (others.some((q) => inRect(q, x + nx * 0.7, z + nz * 0.7, 0.3))) continue; // впритул до сусідньої будівлі
      const li = labAt(x - nx * 0.7, z - nz * 0.7), lo = labAt(x + nx * 0.7, z + nz * 0.7);
      if (!li || !lo) continue;
      tot++;
      if (dE(li, lo) > DE_EDGE) good++;
    }
  }
  return tot >= 4 ? good / tot : 0;
}

function refineOne(pts, r, neigh) {
  const sg = segment(r, neigh.map((n) => n.rect));
  if (!sg) return { pts, status: "no-data" };
  if (sg.fail) return { pts, status: sg.fail };
  const { nx, nz, world } = sg;
  const seed = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const [, , s, t] = world(i, j); if (Math.abs(s) < r.a * 0.8 && Math.abs(t) < r.b * 0.8) seed[j * nx + i] = 1; }
  let m = majority(sg.mask, nx, nz, 2);
  m = erode(dilate(m, nx, nz, 4), nx, nz, 4); // закриття ~1 м: дерева, що перекривають дах
  m = dilate(erode(m, nx, nz, 3), nx, nz, 3); // відкриття
  m = largestCC(m, nx, nz, seed);
  if (!m) return { pts, status: "empty" };
  m = fillHoles(m, nx, nz);
  const loop = traceOuter(m, nx, nz);
  if (!loop || loop.length < 8) return { pts, status: "no-contour" };
  const poly = rectSimplify(loop, 4);
  if (poly.length < 3 || poly.length > 64) return { pts, status: "degenerate" };
  const res = poly.map(([i, j]) => { const s = -r.a - M + i * RES, t = -r.b - M + j * RES; return [r.c[0] + s * r.u[0] + t * r.v[0], r.c[1] + s * r.u[1] + t * r.v[1]]; });
  const ratio = areaOf(res) / areaOf(pts);
  if (ratio < 0.38 || ratio > 1.6) return { pts, status: "area" };
  const close = neigh.filter((n) => Math.hypot(n.rect.c[0] - r.c[0], n.rect.c[1] - r.c[1]) < r.a + r.b + n.rect.a + n.rect.b + 6).map((n) => n.rect);
  const contrast = edgeContrast(res, close);
  if (contrast < CONTRAST_MIN) return { pts, status: "contrast", dbg: `new ${contrast.toFixed(2)} ratio ${ratio.toFixed(2)}` };
  // прямокутник з .topo, що вже збігається з виявленим дахом (перетин/об'єднання), не чіпаємо
  let inter = 0, nm = 0, nown = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const [, , s, t] = world(i, j);
    const own = Math.abs(s) <= r.a && Math.abs(t) <= r.b;
    if (own) nown++;
    if (m[j * nx + i]) { nm++; if (own) inter++; }
  }
  const iou = inter / (nm + nown - inter);
  if (iou > 0.86) return { pts, status: "fits", dbg: `iou ${iou.toFixed(2)}` };
  return { pts: res, status: "ok", dbg: `iou ${iou.toFixed(2)}` };
}

// ---------- основний цикл ----------
const CELL = 128;
const grid = new Map();
const items = buildings.map((pts) => {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const it = { pts, rect: rectOf(pts), x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), area: areaOf(pts) };
  for (let gx = Math.floor(it.x0 / CELL); gx <= Math.floor(it.x1 / CELL); gx++) for (let gz = Math.floor(it.z0 / CELL); gz <= Math.floor(it.z1 / CELL); gz++) { const k = gx + "," + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(it); }
  return it;
});
function neighbours(it) {
  const seen = new Set([it]), out = [];
  for (let gx = Math.floor((it.x0 - 12) / CELL); gx <= Math.floor((it.x1 + 12) / CELL); gx++) for (let gz = Math.floor((it.z0 - 12) / CELL); gz <= Math.floor((it.z1 + 12) / CELL); gz++) for (const q of grid.get(gx + "," + gz) ?? []) {
    if (seen.has(q)) continue;
    seen.add(q);
    if (q.x1 > it.x0 - 12 && q.x0 < it.x1 + 12 && q.z1 > it.z0 - 12 && q.z0 < it.z1 + 12) out.push(q);
  }
  return out;
}

/** Діагностика: зсув контурів відносно зображення (dx, dz, м), що дає найрізкіший край уздовж периметрів у вікні. */
async function offsetSearch(cx, cz, rad) {
  const sel = items.filter((it) => it.area >= 12 && it.x0 > cx - rad && it.x1 < cx + rad && it.z0 > cz - rad && it.z1 < cz + rad);
  await ensure(cx - rad - 15, cz - rad - 15, cx + rad + 15, cz + rad + 15);
  const samples = [];
  for (const it of sel) for (let i = 0; i < it.pts.length; i++) {
    const a = it.pts[i], b = it.pts[(i + 1) % it.pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len;
    for (let k = 0; k < Math.max(1, Math.floor(len / 0.5)); k++) { const f = (k + 0.5) / Math.max(1, Math.floor(len / 0.5)); samples.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, nx, nz]); }
  }
  const score = (dx, dz) => {
    let s = 0, n = 0;
    for (const [x, z, nx, nz] of samples) {
      const li = labAt(x + dx - nx * 0.8, z + dz - nz * 0.8), lo = labAt(x + dx + nx * 0.8, z + dz + nz * 0.8);
      if (li && lo) { s += dE(li, lo); n++; }
    }
    return n ? s / n : 0;
  };
  let best = { s: -1 };
  const base = score(0, 0);
  for (let dx = -12; dx <= 12.001; dx += 0.5) for (let dz = -12; dz <= 12.001; dz += 0.5) { const s = score(dx, dz); if (s > best.s) best = { s, dx, dz }; }
  for (let dx = best.dx - 1; dx <= best.dx + 1.001; dx += 0.1) for (let dz = best.dz - 1; dz <= best.dz + 1.001; dz += 0.1) { const s = score(dx, dz); if (s > best.s) best = { s, dx: Math.round(dx * 10) / 10, dz: Math.round(dz * 10) / 10 }; }
  console.log(`${id} @ ${cx},${cz}: ${sel.length} будівель; найкращий зсув dx=${best.dx} dz=${best.dz}, контраст ${best.s.toFixed(1)} проти ${base.toFixed(1)} без зсуву`);
}
const offOpt = opt("--offset");
if (offOpt) {
  await offsetSearch(Number(offOpt[0]), Number(offOpt[1]), Number(offOpt[2] ?? 100));
  process.exit(0);
}

let todo = items;
if (preview) {
  const [cx, cz, rad] = preview.slice(0, 3).map(Number);
  todo = items.filter((it) => it.x0 > cx - rad && it.x1 < cx + rad && it.z0 > cz - rad && it.z1 < cz + rad);
}
const stat = {};
const t0 = Date.now();
// порядок за просторовою близькістю (тайли лишаються в кеші LRU)
todo = [...todo].sort((a, b) => Math.floor(a.x0 / 256) - Math.floor(b.x0 / 256) || a.z0 - b.z0);
let done = 0;
for (const it of todo) {
  if (it.area < 10) { it.res = { pts: it.pts, status: "tiny" }; }
  else {
    const m = M + 3;
    await ensure(it.x0 - m, it.z0 - m, it.x1 + m, it.z1 + m);
    it.res = refineOne(it.pts, it.rect, neighbours(it));
  }
  stat[it.res.status] = (stat[it.res.status] || 0) + 1;
  if (process.env.DBG) console.log(it.res.status, it.rect.c.map((v) => v.toFixed(0)).join(","), it.res.dbg ?? "");
  if (++done % 250 === 0) console.log(`${done}/${todo.length}  ${Math.round((Date.now() - t0) / 1000)} с`);
}
console.log(id, JSON.stringify(stat), `${Math.round((Date.now() - t0) / 1000)} с`);

if (preview) {
  const [cx, cz, rad, png] = [Number(preview[0]), Number(preview[1]), Number(preview[2]), preview[3]];
  const S = source.pxPerM;
  const ppm = Number(process.env.PREVIEW_PPM ?? Math.min(S, 8));
  const w = Math.round(2 * (rad + 10) * ppm), h = w;
  const x0 = cx - rad - 10, z1 = cz + rad + 10;
  await ensure(x0, z1 - 2 * (rad + 10), x0 + 2 * (rad + 10), z1);
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const wx = x0 + x / ppm, wz = z1 - y / ppm;
    const l = source.locate(wx, wz), t = lruGet(l.key);
    if (!t) continue;
    const px = Math.min(l.size - 1, Math.max(0, Math.floor(l.px))), py = Math.min(l.size - 1, Math.max(0, Math.floor(l.py)));
    const i = (py * l.size + px) * t.channels, o = (y * w + x) * 3;
    buf[o] = t.raw[i]; buf[o + 1] = t.raw[i + 1]; buf[o + 2] = t.raw[i + 2];
  }
  const X = (x) => ((x - x0) * ppm).toFixed(1), Z = (z) => ((z1 - z) * ppm).toFixed(1);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
  for (const it of todo) {
    svg += `<polygon points="${it.pts.map((q) => `${X(q[0])},${Z(q[1])}`).join(" ")}" fill="none" stroke="#ff2fd0" stroke-width="1.4" stroke-opacity="0.85"/>`;
    if (it.res.status === "ok") svg += `<polygon points="${it.res.pts.map((q) => `${X(q[0])},${Z(q[1])}`).join(" ")}" fill="none" stroke="#3dff9a" stroke-width="2.2"/>`;
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).composite([{ input: Buffer.from(svg + "</svg>") }]).png().toFile(png);
  process.exit(0);
}

if (outPath) {
  const polys = items.map((it) => it.res?.pts ?? it.pts);
  let size = 8;
  for (const p of polys) size += 1 + p.length * 4;
  const buf = Buffer.alloc(size);
  buf.write("BLD1", 0, "latin1");
  buf.writeUInt32LE(polys.length, 4);
  let w = 8;
  for (const p of polys) {
    buf[w++] = p.length;
    for (const [x, z] of p) { buf.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(x * 4))), w); buf.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(z * 4))), w + 2); w += 4; }
  }
  writeFileSync(outPath, `// Згенеровано scripts/extract-buildings.mjs і scripts/refine-buildings.mjs (${id}): контури будівель із .topo, підігнані під дахи за зображенням карти
export default "${buf.toString("base64")}";
`);
  console.log(`${id}: записано ${polys.length} контурів, ${(size / 1024).toFixed(0)} КБ -> ${outPath}`);
}
