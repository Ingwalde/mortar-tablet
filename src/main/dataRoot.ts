import { app } from "electron";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeDataRootBytes, parseDataRootFile } from "../core/dataRoot";

const FILE = "data-dir.txt";
let cached: string | null = null;

export function defaultDataRoot(): string {
  return app.getPath("userData");
}

function fileOf(): string {
  return join(app.getPath("userData"), FILE);
}

/** Папка завантажених даних: з `data-dir.txt`, якщо вона є й доступна, інакше папка даних застосунку. */
export function dataRoot(): string {
  if (cached) return cached;
  let root = defaultDataRoot();
  try {
    const custom = parseDataRootFile(decodeDataRootBytes(readFileSync(fileOf())));
    if (custom) {
      mkdirSync(custom, { recursive: true });
      root = custom;
    }
  } catch {
    // файлу нема або папка недоступна (відключений диск): працюємо з типовою
  }
  cached = root;
  return root;
}

/** Запам'ятовує нову папку; null — повернутися до типової. */
export function setDataRoot(path: string | null): void {
  if (path === null) rmSync(fileOf(), { force: true });
  else {
    mkdirSync(path, { recursive: true });
    writeFileSync(fileOf(), path + "\n", "utf8");
  }
  cached = null;
}
