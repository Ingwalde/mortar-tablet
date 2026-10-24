/**
 * Менеджер завантажених даних на ПК: що лежить у папці даних (кеш онлайн-тайлів, імпортовані карти, висоти) і скільки місця займає.
 * Видалення працює лише з відомими видами даних і безпечними id терену.
 */
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { isSafeId } from "../security";
import { dataRoot } from "../dataRoot";
import { heightsPath } from "./heights";

export type StorageKind = "tiles" | "map" | "heights";
export const STORAGE_KINDS: readonly StorageKind[] = ["tiles", "map", "heights"];

export interface StorageEntry {
  id: string;
  tilesBytes: number;
  tilesFiles: number;
  mapBytes: number;
  mapFiles: number;
  heightsBytes: number;
}

interface DirSize {
  bytes: number;
  files: number;
}

/** Рекурсивний розмір каталогу (байти й кількість файлів); відсутній каталог — нулі. */
export async function dirSize(dir: string): Promise<DirSize> {
  let bytes = 0;
  let files = 0;
  const walk = async (d: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    const subdirs: string[] = [];
    const fileEntries: string[] = [];
    for (const e of entries) {
      if (e.isDirectory()) subdirs.push(join(d, e.name));
      else if (e.isFile()) fileEntries.push(join(d, e.name));
    }
    // пакетами: тисячі тайлів не повинні відкривати тисячі дескрипторів одночасно
    for (let i = 0; i < fileEntries.length; i += 64) {
      const sizes = await Promise.all(fileEntries.slice(i, i + 64).map((f) => stat(f).then((s) => s.size).catch(() => 0)));
      for (const s of sizes) {
        bytes += s;
        files++;
      }
    }
    for (const sd of subdirs) await walk(sd);
  };
  await walk(dir);
  return { bytes, files };
}

function dataDir(kind: "tiles" | "maps", id: string): string {
  return join(dataRoot(), kind, id);
}

async function subdirNames(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory() && isSafeId(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function listStorage(): Promise<StorageEntry[]> {
  const userData = dataRoot();
  const ids = new Set<string>([...(await subdirNames(join(userData, "tiles"))), ...(await subdirNames(join(userData, "maps")))]);
  try {
    for (const f of await readdir(join(userData, "heights"))) {
      const m = /^([A-Za-z0-9_-]+)\.bin$/.exec(f);
      if (m) ids.add(m[1]);
    }
  } catch {
    // папки з висотами ще нема
  }
  const out: StorageEntry[] = [];
  for (const id of [...ids].sort()) {
    const [tiles, map, h] = await Promise.all([
      dirSize(dataDir("tiles", id)),
      dirSize(dataDir("maps", id)),
      stat(heightsPath(id)).then((s) => s.size).catch(() => 0)
    ]);
    if (tiles.bytes + map.bytes + h > 0) {
      out.push({ id, tilesBytes: tiles.bytes, tilesFiles: tiles.files, mapBytes: map.bytes, mapFiles: map.files, heightsBytes: h });
    }
  }
  return out;
}

export async function removeStorage(id: string, kind: StorageKind): Promise<void> {
  if (!isSafeId(id)) throw new Error("Некоректний терен");
  if (!STORAGE_KINDS.includes(kind)) throw new Error("Некоректний вид даних");
  if (kind === "tiles") await rm(dataDir("tiles", id), { recursive: true, force: true });
  else if (kind === "map") await rm(dataDir("maps", id), { recursive: true, force: true });
  else await rm(heightsPath(id), { force: true });
}
