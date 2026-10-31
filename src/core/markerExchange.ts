/**
 * Обмін мітками за папкою (місією): формат файлу/тексту, розбір і злиття. Без DOM — тестується напряму.
 *
 * Документ: { app, kind:"markers", v:1, terrain, terrainName?, folder, exportedAt, markers[] }.
 * Імпорт приймає також старий «резервний» формат ({markers:[...]} чи просто масив).
 */
import { readCaption, readClass, type Affiliation, type MarkKind } from "./marks";

export type XMarkerType = "mortar" | "target" | "point";

export interface XMarker {
  id: string;
  name: string;
  type: XMarkerType;
  x: number;
  z: number;
  h: number | null;
  w: "M252" | "2B14";
  folder: string;
  u: number;
  /** Ціль/точку позначено зруйнованою (вручну). */
  destroyed?: boolean;
  /** Приналежність і вид (1.1.0); у старих файлах нема — виводяться з `type`. */
  aff?: Affiliation;
  kind?: MarkKind;
  /** Підпис до мітки, до 120 символів. */
  caption?: string;
  /** Час створення, мс. */
  c?: number;
}

export interface ExchangeDoc {
  app: "mortar-tablet";
  kind: "markers";
  v: 1;
  terrain: string;
  terrainName?: string;
  /** Папка, з якої експортували; null — з усіх. */
  folder: string | null;
  exportedAt: number;
  markers: XMarker[];
}

export interface ExportOptions {
  terrain: string;
  terrainName?: string;
  /** null — усі папки. */
  folder: string | null;
  types: ReadonlySet<XMarkerType>;
  now?: number;
}

export function buildExport(markers: readonly XMarker[], opts: ExportOptions): ExchangeDoc {
  const picked = markers.filter((m) => opts.types.has(m.type) && (opts.folder === null || m.folder === opts.folder));
  return {
    app: "mortar-tablet",
    kind: "markers",
    v: 1,
    terrain: opts.terrain,
    terrainName: opts.terrainName,
    folder: opts.folder,
    exportedAt: opts.now ?? Date.now(),
    markers: picked.map((m) => ({ ...m }))
  };
}

export function serializeExport(doc: ExchangeDoc): string {
  return JSON.stringify(doc, null, 1);
}

export type ParseResult =
  | { ok: true; terrain: string | null; terrainName: string | null; folder: string | null; markers: XMarker[]; skipped: number }
  | { ok: false; reason: "empty" | "json" | "shape" | "none" };

/** Найбільша допустима за модулем координата імпортованої мітки, м. */
const MAX_COORD = 1_000_000;
/** Найбільше міток в одному імпорті: більше — файл-сміття, що заморозив би інтерфейс і переповнив сховище. */
export const MAX_IMPORT_MARKERS = 5000;

function clean(m: unknown, fallbackFolder: string): XMarker | null {
  if (!m || typeof m !== "object") return null;
  const r = m as Record<string, unknown>;
  const x = Number(r.x);
  const z = Number(r.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  // карти — десятки кілометрів; значення на порядки більші — явне сміття або спроба зламати малювання
  if (Math.abs(x) > MAX_COORD || Math.abs(z) > MAX_COORD) return null;
  const h = r.h === null || r.h === undefined || r.h === "" ? null : Number(r.h);
  const cls = readClass(r);
  const type: XMarkerType = cls.type;
  const caption = readCaption(r.caption);
  const created = Number(r.c);
  return {
    id: typeof r.id === "string" && r.id.length > 0 && r.id.length <= 64 ? r.id : "",
    name: typeof r.name === "string" ? r.name.slice(0, 40) : "",
    type,
    x,
    z,
    h: h !== null && Number.isFinite(h) ? h : null,
    w: r.w === "2B14" ? "2B14" : "M252",
    folder: typeof r.folder === "string" ? r.folder.slice(0, 40) : fallbackFolder,
    u: Number.isFinite(Number(r.u)) ? Number(r.u) : 0,
    ...(r.destroyed === true && type !== "mortar" ? { destroyed: true } : {}),
    ...(cls.aff ? { aff: cls.aff } : {}),
    kind: cls.kind,
    ...(caption ? { caption } : {}),
    ...(Number.isFinite(created) && created > 0 ? { c: created } : {})
  };
}

/** Розбирає текст/файл обміну. Невалідні мітки пропускає й рахує. */
export function parseExchange(text: string): ParseResult {
  const src = text.trim();
  if (!src) return { ok: false, reason: "empty" };
  let raw: unknown;
  try {
    raw = JSON.parse(src);
  } catch {
    return { ok: false, reason: "json" };
  }
  let arr: unknown[] | null = null;
  let terrain: string | null = null;
  let terrainName: string | null = null;
  let folder: string | null = null;
  if (Array.isArray(raw)) arr = raw;
  else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.markers)) arr = o.markers;
    if (typeof o.terrain === "string") terrain = o.terrain;
    if (typeof o.terrainName === "string") terrainName = o.terrainName;
    if (typeof o.folder === "string") folder = o.folder;
  }
  if (!arr) return { ok: false, reason: "shape" };
  const markers: XMarker[] = [];
  let skipped = 0;
  for (const item of arr) {
    const m = markers.length < MAX_IMPORT_MARKERS ? clean(item, folder ?? "") : null;
    if (m) markers.push(m);
    else skipped++;
  }
  if (!markers.length) return { ok: false, reason: "none" };
  return { ok: true, terrain, terrainName, folder, markers, skipped };
}

export interface MergeOptions {
  /** Папка призначення для всіх імпортованих міток; null — залишити ту, що у файлі. */
  folder: string | null;
  now: number;
  /** Генератор нових id (для міток без id). */
  newId: () => string;
}

export interface MergeResult {
  markers: XMarker[];
  added: number;
  updated: number;
  unchanged: number;
  /** id, для яких треба прибрати надгробок (мітку «воскресили» імпортом). */
  revived: string[];
}

function same(a: XMarker, b: XMarker): boolean {
  return a.name === b.name && a.type === b.type && a.x === b.x && a.z === b.z && a.h === b.h && a.w === b.w && a.folder === b.folder && !!a.destroyed === !!b.destroyed && a.aff === b.aff && a.kind === b.kind && (a.caption ?? "") === (b.caption ?? "");
}

/**
 * Зливає імпортовані мітки в наявні за id: нова — додається, наявна з іншим вмістом — оновлюється,
 * ідентична — пропускається (повторний імпорт нічого не дублює). Усі змінені отримують свіжий `u`,
 * щоб синхронізація між ПК і телефоном вважала їх найновішими.
 */
export function mergeImported(existing: readonly XMarker[], incoming: readonly XMarker[], opts: MergeOptions): MergeResult {
  const out = existing.map((m) => ({ ...m }));
  const byId = new Map(out.map((m, i) => [m.id, i]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const revived: string[] = [];
  for (const raw of incoming) {
    const m: XMarker = { ...raw, id: raw.id || opts.newId(), folder: opts.folder === null ? raw.folder : opts.folder };
    const at = byId.get(m.id);
    if (at === undefined) {
      out.push({ ...m, u: opts.now });
      byId.set(m.id, out.length - 1);
      revived.push(m.id);
      added++;
    } else if (same(out[at], m)) {
      unchanged++;
    } else {
      out[at] = { ...m, u: opts.now };
      updated++;
    }
  }
  return { markers: out, added, updated, unchanged, revived };
}

/** Безпечне ім'я файлу з назви папки/терену. */
export function exchangeFileName(terrain: string, folder: string | null, now: number): string {
  const slug = (s: string): string =>
    s
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "marks";
  const d = new Date(now);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `mortar-${slug(terrain)}-${folder === null ? "all" : slug(folder || "no-folder")}-${stamp}.json`;
}
