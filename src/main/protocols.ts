import { app, net, protocol } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findPreset } from "../core/terrains";
import { bundledMap } from "../core/bundledMaps";
import { tileUrl } from "../core/onlineTiles";
import { dataRoot } from "./dataRoot";

/** Викликати ДО app.whenReady() — реєструє схеми як привілейовані (fetch/CORS з рендерера). */
export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: "tile", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
    { scheme: "localtile", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
  ]);
}

function tileCacheDir(terrainId: string): string {
  return join(dataRoot(), "tiles", terrainId);
}

export function pyramidDir(terrainId: string): string {
  return join(dataRoot(), "maps", terrainId);
}

/** Онлайн-тайл reforger.recoil.org з дисковим кешем; null — нема такого тайла чи мережа недоступна. */
export async function getOnlineTile(terrainId: string, lod: number, x: number, y: number): Promise<Buffer | null> {
  const preset = findPreset(terrainId);
  if (!preset?.tiles || !Number.isInteger(lod) || !Number.isInteger(x) || !Number.isInteger(y)) return null;

  const cachePath = join(tileCacheDir(terrainId), String(lod), String(x), `${y}.jpg`);
  if (existsSync(cachePath)) return readFile(cachePath);

  try {
    const remote = await net.fetch(tileUrl(preset.tiles.base, lod, x, y));
    if (!remote.ok) return null;
    const buf = Buffer.from(await remote.arrayBuffer());
    await mkdir(join(tileCacheDir(terrainId), String(lod), String(x)), { recursive: true });
    await writeFile(cachePath, buf);
    return buf;
  } catch {
    return null;
  }
}

export type EnsureTileResult = "ok" | "missing" | "failed";

/**
 * Гарантує, що онлайн-тайл лежить у дисковому кеші (без читання файлу).
 * "missing" — сервер каже, що такого тайла нема (404: за межами карти, море), це не помилка;
 * "failed" — мережева чи серверна помилка (одна повторна спроба).
 */
export async function ensureOnlineTile(terrainId: string, lod: number, x: number, y: number): Promise<EnsureTileResult> {
  const preset = findPreset(terrainId);
  if (!preset?.tiles) return "failed";
  const cachePath = join(tileCacheDir(terrainId), String(lod), String(x), `${y}.jpg`);
  if (existsSync(cachePath)) return "ok";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const remote = await net.fetch(tileUrl(preset.tiles.base, lod, x, y));
      if (remote.status === 404) return "missing";
      if (!remote.ok) continue;
      const buf = Buffer.from(await remote.arrayBuffer());
      await mkdir(join(tileCacheDir(terrainId), String(lod), String(x)), { recursive: true });
      await writeFile(cachePath, buf);
      return "ok";
    } catch {
      // мережа — пробуємо ще раз
    }
  }
  return "failed";
}

export interface PyramidTile {
  data: Buffer;
  type: string;
}

/**
 * Тайл імпортованої піраміди (sharp .tile google layout: {z}/{row}/{col}.webp). Старі піраміди з JPEG
 * (.jpg) теж читаються — до конвертації scripts/convert-pyramids-webp.mjs.
 */
/** Каталог вбудованої з застосунком піраміди (resources/maps/<id>; у зібраному застосунку — всередині app.asar). */
export function bundledPyramidDir(terrainId: string): string {
  return join(app.getAppPath(), "resources", "maps", terrainId);
}

export async function getPyramidTile(terrainId: string, z: string, row: string, col: string): Promise<PyramidTile | null> {
  // terrainId/z/row/col приходять з URL — лише прості сегменти, без виходу з каталогу піраміди.
  for (const seg of [terrainId, z, row, col]) if (!/^[A-Za-z0-9_-]+$/.test(seg)) return null;
  // власний імпорт користувача має пріоритет, далі — карта, що йде разом із застосунком
  const dirs = [pyramidDir(terrainId), ...(bundledMap(terrainId) ? [bundledPyramidDir(terrainId)] : [])];
  for (const dir of dirs) {
    const base = join(dir, z, row, col);
    for (const [ext, type] of [
      [".webp", "image/webp"],
      [".jpg", "image/jpeg"]
    ] as const) {
      const filePath = base + ext;
      if (existsSync(filePath)) return { data: await readFile(filePath), type };
    }
  }
  return null;
}

const notFound = () => new Response("Not found", { status: 404 });
const jpeg = (buf: Buffer) => new Response(buf, { headers: { "content-type": "image/jpeg" } });

/** Викликати ПІСЛЯ app.whenReady() — реєструє самі обробники. */
export function registerProtocolHandlers(): void {
  // tile://{terrainId}/{lod}/{x}/{y} — онлайн-тайли.
  protocol.handle("tile", async (request) => {
    const url = new URL(request.url);
    const [, lodStr, xStr, yStr] = url.pathname.split("/");
    const buf = await getOnlineTile(url.hostname, Number(lodStr), Number(xStr), Number(yStr));
    return buf ? jpeg(buf) : notFound();
  });

  // localtile://{terrainId}/{z}/{row}/{col} — імпортована піраміда.
  protocol.handle("localtile", async (request) => {
    const url = new URL(request.url);
    const [, z, row, col] = url.pathname.split("/");
    if (!z || !row || !col) return notFound();
    const tile = await getPyramidTile(url.hostname, z, row, col);
    return tile ? new Response(tile.data, { headers: { "content-type": tile.type } }) : notFound();
  });
}
