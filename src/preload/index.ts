import { contextBridge, ipcRenderer } from "electron";

export interface MapImportProgress {
  terrainId: string;
  phase: "download" | "tile";
  done: number;
  total: number;
}

export interface MapImportResult {
  ok: boolean;
  cancelled?: boolean;
  plan?: unknown;
  croppedWidth?: number;
  croppedHeight?: number;
}

export interface StorageEntry {
  id: string;
  tilesBytes: number;
  tilesFiles: number;
  mapBytes: number;
  mapFiles: number;
  heightsBytes: number;
}

const api = {
  /** true лише в браузерних збірках (сайт, APK): там нема імпорту карт і файлових діалогів. */
  remote: false,
  store: {
    load: (): Promise<unknown> => ipcRenderer.invoke("store:load"),
    /** true — стан змінився при злитті з чужими правками, його треба перечитати. */
    save: (data: unknown): Promise<boolean> => ipcRenderer.invoke("store:save", data),
    /** Стан змінив інша вкладка (лише в браузерних збірках); у застосунку на ПК стан пише тільки його вікно. */
    onChanged: (_cb: () => void): (() => void) => () => undefined
  },
  dialogs: {
    pickImageFile: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickImageFile")
  },
  mapImport: {
    fromFile: (terrainId: string, sourcePath: string, sizeX: number, sizeZ: number): Promise<MapImportResult> =>
      ipcRenderer.invoke("mapImport:fromFile", terrainId, sourcePath, sizeX, sizeZ),
    downloadAndImport: (
      terrainId: string,
      imageUrl: string,
      sizeX: number,
      sizeZ: number
    ): Promise<MapImportResult> =>
      ipcRenderer.invoke("mapImport:downloadAndImport", terrainId, imageUrl, sizeX, sizeZ),
    cancel: (): Promise<void> => ipcRenderer.invoke("mapImport:cancel"),
    remove: (terrainId: string): Promise<void> => ipcRenderer.invoke("mapImport:remove", terrainId),
    onProgress: (cb: (p: MapImportProgress) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, p: MapImportProgress) => cb(p);
      ipcRenderer.on("mapImport:progress", listener);
      return () => ipcRenderer.removeListener("mapImport:progress", listener);
    }
  },
  updater: {
    status: (): Promise<{ state: string; version?: string; percent?: number; message?: string }> =>
      ipcRenderer.invoke("updater:status"),
    check: (): Promise<{ state: string; version?: string; percent?: number; message?: string }> =>
      ipcRenderer.invoke("updater:check"),
    install: (): Promise<void> => ipcRenderer.invoke("updater:install"),
    onStatus: (cb: (s: { state: string; version?: string; percent?: number; message?: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, s: { state: string; version?: string; percent?: number; message?: string }) => cb(s);
      ipcRenderer.on("updater:status", listener);
      return () => ipcRenderer.removeListener("updater:status", listener);
    }
  },
  tiles: {
    prefetch: (
      terrainId: string,
      minLod: number
    ): Promise<{ ok: boolean; cancelled?: boolean; done: number; missing: number; failed: number; total: number }> =>
      ipcRenderer.invoke("tiles:prefetch", terrainId, minLod),
    cancelPrefetch: (): Promise<void> => ipcRenderer.invoke("tiles:prefetchCancel"),
    onPrefetchProgress: (cb: (p: { done: number; total: number }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, p: { done: number; total: number }) => cb(p);
      ipcRenderer.on("tiles:prefetchProgress", listener);
      return () => ipcRenderer.removeListener("tiles:prefetchProgress", listener);
    }
  },
  storage: {
    list: (): Promise<StorageEntry[]> => ipcRenderer.invoke("storage:list"),
    remove: (terrainId: string, kind: "tiles" | "map" | "heights"): Promise<void> => ipcRenderer.invoke("storage:remove", terrainId, kind),
    root: (): Promise<{ path: string; defaultPath: string; isDefault: boolean }> => ipcRenderer.invoke("storage:root"),
    chooseRoot: (): Promise<string | null> => ipcRenderer.invoke("storage:chooseRoot"),
    /** null — повернутися до типової папки; шлях має бути щойно вибраний через `chooseRoot`. */
    moveRoot: (target: string | null): Promise<{ moved: boolean }> => ipcRenderer.invoke("storage:moveRoot", target)
  },
  heights: {
    importFromUrl: (terrainId: string, url: string): Promise<{ rows: number; cols: number }> =>
      ipcRenderer.invoke("heights:importFromUrl", terrainId, url),
    read: (terrainId: string): Promise<Uint8Array | null> => ipcRenderer.invoke("heights:read", terrainId)
  },
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
};

contextBridge.exposeInMainWorld("api", api);

export type MortarApi = typeof api;
