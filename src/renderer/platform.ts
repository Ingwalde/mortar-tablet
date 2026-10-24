/**
 * Платформа: у вікні Electron `window.api` дає preload; у браузері (сайт, APK) його немає — тут створюється
 * веб-замінник з тим самим інтерфейсом: стан у localStorage, висоти й карти з власного сайту.
 * Імпортувати цей модуль треба першим (main.ts), до будь-якого використання window.api.
 */
import type { MortarApi } from "../preload/index";
import { tileUrl } from "@core/onlineTiles";
import { findPreset } from "@core/terrains";
import { modMapTilePath, webHeightsPath, webModMap } from "@core/webMirror";

/** Автономна веб-версія (PWA на Pages / APK): без ПК, стан лише на пристрої. Підставляється збіркою. */
export const isStandalone: boolean = typeof __STANDALONE__ !== "undefined" && __STANDALONE__;

/** Усередині Android-застосунку (Capacitor): карта й висоти вже в пакеті, service worker не потрібен. */
export const isNativeApp: boolean = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

const LS_STATE = "mortar.state.v1";

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Розпаковує gzip (сітки висот на сайті лежать стиснутими; DecompressionStream є в усіх сучасних браузерах). */
async function gunzip(bytes: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function createStandaloneApi(): MortarApi {
  const noImport = (): never => {
    throw new Error("Імпорт карт доступний лише в застосунку на ПК");
  };
  const heightsCache = new Map<string, Promise<Uint8Array | null>>();
  return {
    remote: true,
    store: {
      async load() {
        const raw = lsGet(LS_STATE);
        if (!raw) return null;
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return null;
        }
      },
      async save(data) {
        try {
          localStorage.setItem(LS_STATE, JSON.stringify(data));
        } catch {
          window.dispatchEvent(new CustomEvent("mortar:storage-error"));
        }
        return false;
      },
      onChanged(cb) {
        // той самий застосунок, відкритий у другій вкладці
        const h = (e: StorageEvent): void => {
          if (e.key === LS_STATE) cb();
        };
        window.addEventListener("storage", h);
        return () => window.removeEventListener("storage", h);
      }
    },
    heights: {
      importFromUrl: noImport,
      read(terrainId) {
        let p = heightsCache.get(terrainId);
        if (!p) {
          p = (async () => {
            try {
              const res = await fetch(webHeightsPath(terrainId));
              if (!res.ok) return null;
              return await gunzip(await res.arrayBuffer());
            } catch {
              return null;
            }
          })();
          heightsCache.set(terrainId, p);
        }
        return p;
      }
    },
    dialogs: { pickImageFile: async () => null },
    mapImport: {
      fromFile: noImport,
      downloadAndImport: noImport,
      cancel: async () => undefined,
      remove: async () => undefined,
      onProgress: () => () => undefined
    },
    updater: {
      status: async () => ({ state: "unsupported" }),
      check: async () => ({ state: "unsupported" }),
      install: async () => undefined,
      onStatus: () => () => undefined
    },
    tiles: {
      prefetch: async () => ({ ok: false, done: 0, missing: 0, failed: 0, total: 0 }),
      cancelPrefetch: async () => undefined,
      onPrefetchProgress: () => () => undefined
    },
    storage: {
      list: async () => [],
      remove: async () => undefined,
      root: async () => ({ path: "", defaultPath: "", isDefault: true }),
      chooseRoot: async () => null,
      moveRoot: async () => ({ moved: false })
    },
    versions: { node: "", chrome: "", electron: "" }
  };
}

if (typeof (window as { api?: unknown }).api === "undefined") window.api = createStandaloneApi();

export const isRemote: boolean = window.api.remote;

if (isRemote) {
  document.documentElement.classList.add("remote");
  markShortViewport();
  // Офлайн-режим: service worker (лише у збірці й лише в безпечному контексті — HTTPS або localhost).
  if ("serviceWorker" in navigator && window.isSecureContext && import.meta.env.PROD && !isNativeApp) {
    // відносний шлях: сайт може лежати на підшляху (GitHub Pages), service worker береться з тієї ж папки
    // ревізія збірки в межах однієї версії: міняє адресу service worker-а, щоб клієнти отримали виправлену оболонку
    void navigator.serviceWorker.register(`sw.js?v=${__APP_VERSION__}`).catch(() => undefined);
    void navigator.storage?.persist?.().catch(() => undefined);
  }
}

/**
 * iOS, режим «На екран Додому» з прозорим статус-баром: вікно сторінки на висоту статус-бару коротше
 * за екран (innerHeight 797 при screen 844), а нижня смуга лежить поза вікном — сторінка в неї не
 * малює. Тоді відступ під домашню смугу вже "всередині" смуги, тож CSS не має додавати його ще раз
 * (клас ios-short), а панель знизу зафарбована кольором фону, щоб зливатися зі смугою.
 */
function markShortViewport(): void {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone !== true) return;
  const check = (): void => {
    const portrait = window.innerHeight >= window.innerWidth;
    const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    document.documentElement.classList.toggle("ios-short", full - window.innerHeight > 20);
  };
  check();
  window.addEventListener("resize", check);
  window.addEventListener("orientationchange", () => setTimeout(check, 250));
}

/** URL тайла онлайн-карти: у Electron — кастомний протокол; на сайті — прямо з першоджерела. */
export function onlineTileSrc(terrainId: string, lod: number, x: number, y: number): string {
  if (isStandalone) {
    // автономна версія: тайли вантажаться напряму з першоджерела (на свій сайт не копіюються)
    const base = findPreset(terrainId)?.tiles?.base;
    if (base) return tileUrl(base, lod, x, y);
  }
  return isRemote ? `/tile/${terrainId}/${lod}/${x}/${y}` : `tile://${terrainId}/${lod}/${x}/${y}`;
}

/** URL тайла імпортованої піраміди ({z}/{row}/{col}). */
export function pyramidTileSrc(terrainId: string, z: number, row: number, col: number): string {
  if (isStandalone && webModMap(terrainId)) return modMapTilePath(terrainId, z, row, col);
  return isRemote ? `/localtile/${terrainId}/${z}/${row}/${col}` : `localtile://${terrainId}/${z}/${row}/${col}`;
}
