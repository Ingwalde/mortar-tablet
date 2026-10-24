import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadStore, saveStore } from "./store";
import { buildTilePyramid, ImportCancelledError, type ImportProgress } from "./tiles/import";
import { downloadFile } from "./tiles/download";
import { convertHeightData, heightsPath, readHeights } from "./tiles/heights";
import { ensureOnlineTile, pyramidDir } from "./protocols";
import { STORAGE_KINDS, listStorage, removeStorage, type StorageKind } from "./tiles/storage";
import {
  approveImagePath,
  consumeApprovedImagePath,
  expectedHeightsUrl,
  expectedImageUrl,
  isApprovedImagePath,
  isSafeId,
  isSafeTerrainSize
} from "./security";
import { findPreset } from "../core/terrains";
import { onlineTileList } from "../core/onlineTiles";
import { isAbsolutePath, isSameOrInside } from "../core/dataRoot";
import { dataRoot, defaultDataRoot, setDataRoot } from "./dataRoot";

/** Лише один імпорт карти одночасно — так само, як в UI прототипу (один прогрес-бар). */
let currentImport: AbortController | null = null;

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("store:load", () => loadStore());
  ipcMain.handle("store:save", (_e, data: unknown) => saveStore(data));

  // Заздалегідне збереження онлайн-тайлів у дисковий кеш (щоб Everon/Arland працювали без інтернету).
  let prefetch: AbortController | null = null;
  ipcMain.handle("tiles:prefetch", async (event, terrainId: string, minLod: number) => {
    const preset = findPreset(String(terrainId));
    if (!preset?.tiles) return { ok: false as const, done: 0, missing: 0, failed: 0, total: 0 };
    if (prefetch) return { ok: false as const, done: 0, missing: 0, failed: 0, total: 0 };
    const ac = new AbortController();
    prefetch = ac;
    const list = onlineTileList(preset.sizeX, preset.sizeZ, preset.tiles.maxLod, Math.max(0, Math.floor(Number(minLod) || 0)));
    let done = 0;
    let missing = 0;
    let failed = 0;
    let next = 0;
    let lastSent = 0;
    const worker = async (): Promise<void> => {
      while (!ac.signal.aborted) {
        const i = next++;
        if (i >= list.length) return;
        const c = list[i];
        const res = await ensureOnlineTile(preset.id, c.lod, c.x, c.y);
        if (res === "ok") done++;
        else if (res === "missing") missing++;
        else failed++;
        const now = Date.now();
        if (now - lastSent > 150 || done + missing + failed === list.length) {
          lastSent = now;
          event.sender.send("tiles:prefetchProgress", { done: done + missing + failed, total: list.length });
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: 6 }, worker));
    } finally {
      prefetch = null;
    }
    return { ok: !ac.signal.aborted, cancelled: ac.signal.aborted, done, missing, failed, total: list.length };
  });
  ipcMain.handle("tiles:prefetchCancel", () => {
    prefetch?.abort();
  });


  ipcMain.handle("dialog:pickImageFile", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win ?? undefined!, {
      title: "Виберіть зображення карти",
      properties: ["openFile"],
      filters: [{ name: "Зображення", extensions: ["png", "jpg", "jpeg", "webp"] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    // лише цей шлях main потім прийме для імпорту (рендерер не може підсунути довільний файл)
    approveImagePath(res.filePaths[0]);
    return res.filePaths[0];
  });

  ipcMain.handle(
    "mapImport:fromFile",
    async (event, terrainId: string, sourcePath: string, sizeX: number, sizeZ: number) => {
      if (!isSafeId(terrainId) || !isSafeTerrainSize(sizeX) || !isSafeTerrainSize(sizeZ)) {
        throw new Error("Некоректні параметри імпорту");
      }
      if (!isApprovedImagePath(sourcePath)) throw new Error("Файл не вибрано через діалог");
      consumeApprovedImagePath(sourcePath);
      return runImport(event.sender, terrainId, sourcePath, sizeX, sizeZ);
    }
  );

  ipcMain.handle(
    "mapImport:downloadAndImport",
    async (event, terrainId: string, imageUrl: string, sizeX: number, sizeZ: number) => {
      if (!isSafeId(terrainId) || !isSafeTerrainSize(sizeX) || !isSafeTerrainSize(sizeZ)) {
        throw new Error("Некоректні параметри імпорту");
      }
      // качаємо лише знімок, вказаний у каталозі для цього терену (не довільний URL із рендерера)
      if (imageUrl !== expectedImageUrl(terrainId)) throw new Error("URL не збігається з каталогом");
      const ac = new AbortController();
      currentImport = ac;
      const tmpPath = join(app.getPath("temp"), `mortar-import-${randomUUID()}.png`);
      try {
        await downloadFile(
          imageUrl,
          tmpPath,
          (p) => event.sender.send("mapImport:progress", { terrainId, phase: "download", ...p }),
          ac.signal
        );
        return await runImport(event.sender, terrainId, tmpPath, sizeX, sizeZ, ac);
      } catch (err) {
        if (ac.signal.aborted) return { ok: false as const, cancelled: true as const };
        throw err;
      } finally {
        await rm(tmpPath, { force: true });
      }
    }
  );

  ipcMain.handle("mapImport:cancel", () => {
    currentImport?.abort();
    currentImport = null;
  });

  ipcMain.handle("mapImport:remove", async (_e, terrainId: string) => {
    if (!isSafeId(terrainId)) throw new Error("Некоректний терен");
    await rm(pyramidDir(terrainId), { recursive: true, force: true });
    await rm(heightsPath(terrainId), { force: true });
  });

  // папка завантажених даних: показати, вибрати (системний діалог) і перенести туди наявні дані
  let approvedRoot: string | null = null;
  ipcMain.handle("storage:root", () => ({ path: dataRoot(), defaultPath: defaultDataRoot(), isDefault: dataRoot() === defaultDataRoot() }));
  ipcMain.handle("storage:chooseRoot", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win ?? undefined!, {
      title: "Виберіть папку для завантажених карт і даних",
      properties: ["openDirectory", "createDirectory"]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    // лише цю папку main потім прийме (рендерер не може підсунути довільний шлях)
    approvedRoot = res.filePaths[0];
    return approvedRoot;
  });
  ipcMain.handle("storage:moveRoot", async (_e, target: string | null) => {
    if (currentImport || prefetch) throw new Error("Спершу дочекайтеся завершення завантаження або імпорту карти");
    const from = dataRoot();
    const to = target === null ? defaultDataRoot() : target;
    if (target !== null && (target !== approvedRoot || !isAbsolutePath(target))) throw new Error("Папку не вибрано через діалог");
    approvedRoot = null;
    if (isSameOrInside(from, to) && isSameOrInside(to, from)) return { moved: false };
    if (isSameOrInside(from, to)) throw new Error("Нова папка не може лежати всередині теперішньої");
    await mkdir(to, { recursive: true });
    // перевірка запису: диск може бути лише для читання
    const probe = join(to, ".write-test");
    await writeFile(probe, "x");
    await rm(probe, { force: true });
    for (const kind of ["tiles", "maps", "heights"]) {
      const src = join(from, kind);
      if (await stat(src).then((s) => s.isDirectory()).catch(() => false)) await cp(src, join(to, kind), { recursive: true, force: false, errorOnExist: false });
    }
    // усе скопійовано: запам'ятовуємо нову папку й лише потім прибираємо стару
    setDataRoot(target);
    for (const kind of ["tiles", "maps", "heights"]) await rm(join(from, kind), { recursive: true, force: true }).catch(() => undefined);
    return { moved: true };
  });

  // менеджер завантажених даних: список із розмірами й видалення за видом (id і вид перевіряються)
  ipcMain.handle("storage:list", () => listStorage());
  ipcMain.handle("storage:remove", async (_e, terrainId: string, kind: string) => {
    if (!isSafeId(terrainId) || !STORAGE_KINDS.includes(kind as StorageKind)) throw new Error("Некоректні параметри");
    await removeStorage(terrainId, kind as StorageKind);
  });

  ipcMain.handle("heights:importFromUrl", (_e, terrainId: string, url: string) => {
    if (!isSafeId(terrainId)) throw new Error("Некоректний терен");
    if (url !== expectedHeightsUrl(terrainId)) throw new Error("URL не збігається з каталогом");
    return convertHeightData(terrainId, url);
  });
  ipcMain.handle("heights:read", (_e, terrainId: string) => (isSafeId(terrainId) ? readHeights(terrainId) : null));
}

async function runImport(
  sender: Electron.WebContents,
  terrainId: string,
  sourcePath: string,
  sizeX: number,
  sizeZ: number,
  ac: AbortController = new AbortController()
) {
  currentImport = ac;
  try {
    const result = await buildTilePyramid(
      sourcePath,
      sizeX,
      sizeZ,
      pyramidDir(terrainId),
      (p: ImportProgress) => sender.send("mapImport:progress", { terrainId, phase: "tile", ...p }),
      ac.signal
    );
    return { ok: true as const, ...result };
  } catch (err) {
    if (err instanceof ImportCancelledError) return { ok: false as const, cancelled: true as const };
    throw err;
  } finally {
    if (currentImport === ac) currentImport = null;
  }
}
