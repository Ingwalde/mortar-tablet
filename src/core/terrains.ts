/**
 * Перелік теренів — перенесено з масиву PRESETS у прототипі, доповнено посиланнями
 * на повні супутникові зображення й дані висот з GeNeFRAG/ArmaReforger (MIT),
 * див. scripts/extract-terrains.mjs. Дані генеруються, а не пишуться руками.
 */
import rawData from "./terrains-data.json";
import { placeKind, placeTier, type PlaceKind, type PlaceTier } from "./places";

export interface Place {
  name: string;
  x: number;
  z: number;
  /** Важливість: 1 — головні, 2 — звичайні, 3 — другорядні (див. core/places.ts). */
  tier: PlaceTier;
  /** Категорія (від неї колір підпису), визначається за назвою. */
  kind: PlaceKind;
}

export interface OnlineTiles {
  base: string;
  maxLod: number;
}

export interface TerrainPreset {
  id: string;
  name: string;
  /** Розмір терену в метрах (X — схід, Z — північ). */
  sizeX: number;
  sizeZ: number;
  /** Скільки метрів від (0,0) справді покриває супутниковий знімок, якщо не рівно розмір терену (Gogland: ≈12279 м замість 12288). */
  imageSpan?: number;
  /** Офіційний терен Reforger чи мод-карта. */
  official: boolean;
  /** Онлайн-тайли reforger.recoil.org — наявні лише для Everon і Arland. */
  tiles?: OnlineTiles;
  /** Іменовані пункти (лише Everon/Arland, з EnfusionMapMaker). */
  places?: Place[];
  /**
   * Повне супутникове зображення для ручного/автоматичного імпорту (sharp) — є лише для
   * теренів із GeNeFRAG/ArmaReforger. Мод-карти поза цим каталогом (напр. воркшоп-моди без
   * супутникового знімка в GeNeFRAG) не мають цього поля — імпорт лише вручну, кнопкою
   * «Завантажити карту» з власним скріншотом користувача.
   */
  mapImage?: string;
  /** Дані висот 10x10 м (JSON), якщо є для цього терену в GeNeFRAG. */
  heightData?: string | null;
}

interface RawPreset {
  id: string;
  name: string;
  sizeX: number;
  sizeZ: number;
  imageSpan?: number;
  official: boolean;
  tiles?: OnlineTiles;
  places?: [string, number, number, number?][];
  mapImage?: string;
  heightData?: string | null;
}

export const PRESETS: TerrainPreset[] = (rawData as RawPreset[]).map((t) => ({
  ...t,
  places: t.places?.map(([name, x, z, tier]) => ({ name, x, z, tier: tier === 1 || tier === 2 || tier === 3 ? tier : placeTier(name), kind: placeKind(name) }))
}));

export function findPreset(id: string): TerrainPreset | undefined {
  return PRESETS.find((t) => t.id === id);
}

export const DEFAULT_TERRAIN_ID = "everon";
