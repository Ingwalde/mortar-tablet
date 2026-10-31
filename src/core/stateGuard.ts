/**
 * Перевірка полів збереженого стану терену (прив'язка, карта, вибір, висоти). Стан читається з файлу чи сховища, його може змінити інший
 * пристрій або випадкове пошкодження: нечислове чи від'ємне значення тут не повинно дійти до геометрії карти й зламати малювання.
 * Без DOM — тестується напряму.
 */
import type { Calib, CalibPoint } from "./geometry";

const MAX_SIZE = 1_000_000;

function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function positive(v: unknown, max = MAX_SIZE): number | null {
  const n = finite(v);
  return n !== null && n > 0 && n <= max ? n : null;
}

function readPoint(v: unknown): CalibPoint | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const px = finite(r.px);
  const py = finite(r.py);
  const x = finite(r.x);
  const z = finite(r.z);
  return px !== null && py !== null && x !== null && z !== null ? { px, py, x, z } : null;
}

/** Прив'язка карти: невалідні поля замінюються значеннями за замовчуванням (`base`). */
export function sanitizeCalib(raw: unknown, base: Calib): Calib {
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  return {
    mode: r.mode === "points" ? "points" : "size",
    size: positive(r.size) ?? base.size,
    sizeZ: positive(r.sizeZ) ?? base.sizeZ,
    a: readPoint(r.a),
    b: readPoint(r.b)
  };
}

export type MapStateLike = { kind: "none" } | { kind: "pyramid"; width: number; height: number };

/** Стан карти терену: null — ще не вирішено; нерозпізнане теж дає null (тоді береться типова карта). */
export function sanitizeMapState(raw: unknown): MapStateLike | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === "none") return { kind: "none" };
  if (r.kind === "pyramid") {
    const w = positive(r.width);
    const h = positive(r.height);
    if (w !== null && h !== null && Number.isInteger(w) && Number.isInteger(h)) return { kind: "pyramid", width: w, height: h };
  }
  return null;
}

/** Розмір сітки висот: два додатні цілі. */
export function sanitizeHeightsInfo(raw: unknown): { rows: number; cols: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rows = positive(r.rows, 100_000);
  const cols = positive(r.cols, 100_000);
  return rows !== null && cols !== null && Number.isInteger(rows) && Number.isInteger(cols) ? { rows, cols } : null;
}

export interface SelectionLike {
  m: string | null;
  t: string;
  shell: string;
  charge: number | null;
  folder: string;
  mortarFolder: string;
  targetFolder: string;
}

/** Вибір у розрахунку: лише відомі поля потрібних типів, решта береться з `base`. */
export function sanitizeSel(raw: unknown, base: SelectionLike): SelectionLike {
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, d: string, max = 64): string => (typeof v === "string" && v.length <= max ? v : d);
  return {
    m: r.m === null ? null : typeof r.m === "string" && r.m.length <= 64 ? r.m : base.m,
    t: str(r.t, base.t),
    shell: str(r.shell, base.shell),
    charge: r.charge === null ? null : (finite(r.charge) ?? base.charge),
    folder: str(r.folder, base.folder, 200),
    mortarFolder: str(r.mortarFolder, base.mortarFolder, 200),
    targetFolder: str(r.targetFolder, base.targetFolder, 200)
  };
}
