
// ---------- main draw ----------
/** Кільця дальності вибраного міномета: усі заряди вибраного снаряда. */
export interface RingSpec {
  x: number;
  z: number;
  rings: { level: number; min: number; max: number; active: boolean }[];
}

export interface DrawCallbacks {
  selectedId: string | null;
  firePair: () => { m: { x: number; z: number }; t: { x: number; z: number } } | null;
  rings: () => RingSpec | null;
  /** Еліпс розкиду навколо цілі: центр, напрямок вогню (одиничний вектор) і радіуси в метрах. */
  spread: () => { x: number; z: number; ux: number; uz: number; a: number; b: number } | null;
}

export const callbacks: DrawCallbacks = { selectedId: null, firePair: () => null, rings: () => null, spread: () => null };

export function setDrawCallbacks(cb: Partial<DrawCallbacks>): void {
  Object.assign(callbacks, cb);
}
