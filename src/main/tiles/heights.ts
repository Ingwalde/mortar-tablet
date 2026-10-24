import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { dataRoot } from "../dataRoot";
import { encodeHeightGrid, parseHeightJson } from "../../core/heightGrid";
// Висоти, яких нема в каталозі GeNeFRAG, але які зібрано з файлів модів і поставляються разом із застосунком
// (scripts/extract-badorb-heights.mjs). Імпорт ?asset копіює файл у out/main і дає шлях до нього.
import badorbBundled from "../../../resources/heights/badorb.bin.gz?asset";
import bystranyBundled from "../../../resources/heights/bystrany.bin.gz?asset";
import ironholdBundled from "../../../resources/heights/ironholdcastle.bin.gz?asset";
import kirovogradBundled from "../../../resources/heights/kirovograd.bin.gz?asset";
import mogadishuBundled from "../../../resources/heights/mogadishu.bin.gz?asset";
import novyinovkaBundled from "../../../resources/heights/novyinovka.bin.gz?asset";

const BUNDLED: Record<string, string> = {
  badorb: badorbBundled,
  bystrany: bystranyBundled,
  ironholdcastle: ironholdBundled,
  kirovograd: kirovogradBundled,
  mogadishu: mogadishuBundled,
  novyinovka: novyinovkaBundled
};

export function heightsPath(terrainId: string): string {
  return join(dataRoot(), "heights", `${terrainId}.bin`);
}

/** Завантажує height_data (JSON) і зберігає компактним бінарним файлом для швидкого читання. */
export async function convertHeightData(terrainId: string, url: string): Promise<{ rows: number; cols: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не вдалося завантажити дані висот: ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  const grid = parseHeightJson(raw);

  const path = heightsPath(terrainId);
  await mkdir(join(dataRoot(), "heights"), { recursive: true });
  await writeFile(path, Buffer.from(encodeHeightGrid(grid)));

  return { rows: grid.rows, cols: grid.cols };
}

export async function readHeights(terrainId: string): Promise<Uint8Array | null> {
  try {
    return await readFile(heightsPath(terrainId));
  } catch {
    const bundled = BUNDLED[terrainId];
    if (!bundled) return null;
    try {
      // вбудовані сітки зберігаються стиснутими (scripts/compress-heights.mjs)
      return new Uint8Array(gunzipSync(await readFile(bundled)));
    } catch {
      return null;
    }
  }
}
