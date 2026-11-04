import { describe, expect, it } from "vitest";
import type { Calib } from "./geometry";
import { MAX_SIZE, sanitizeCalib, sanitizeHeightsInfo, sanitizeMapState, sanitizeSel, type SelectionLike } from "./stateGuard";

const baseCalib: Calib = { mode: "size", size: 12800, sizeZ: 12800, a: null, b: null };
const baseSel: SelectionLike = { m: null, t: "__center", shell: "HE", charge: null, folder: "__all", mortarFolder: "__all", targetFolder: "__all" };

describe("sanitizeCalib", () => {
  it("лишає коректну прив'язку", () => {
    const raw = { mode: "points", size: 5120, sizeZ: 5000, a: { px: 1, py: 2, x: 3, z: 4 }, b: { px: 10, py: 20, x: 30, z: 40 } };
    expect(sanitizeCalib(raw, baseCalib)).toEqual(raw);
  });
  it("нечислові, від'ємні й нескінченні значення замінюються типовими", () => {
    const got = sanitizeCalib({ mode: "weird", size: -5, sizeZ: "12", a: { px: NaN, py: 0, x: 0, z: 0 }, b: "x" }, baseCalib);
    expect(got).toEqual({ mode: "size", size: 12800, sizeZ: 12800, a: null, b: null });
  });
  it("розмір понад межу (1e300 тощо) замінюється типовим", () => {
    const got = sanitizeCalib({ mode: "size", size: 1e300, sizeZ: MAX_SIZE + 1 }, baseCalib);
    expect(got.size).toBe(12800);
    expect(got.sizeZ).toBe(12800);
    expect(sanitizeCalib({ mode: "size", size: MAX_SIZE, sizeZ: MAX_SIZE }, baseCalib).size).toBe(MAX_SIZE);
  });
  it("не-об'єкт дає типове", () => {
    expect(sanitizeCalib(null, baseCalib)).toBe(baseCalib);
    expect(sanitizeCalib("x", baseCalib)).toBe(baseCalib);
  });
  it("чужі ключі, зокрема __proto__, не потрапляють у результат", () => {
    const raw = JSON.parse('{"mode":"size","size":100,"sizeZ":100,"__proto__":{"polluted":true},"evil":1}');
    const got = sanitizeCalib(raw, baseCalib) as unknown as Record<string, unknown>;
    expect(Object.keys(got).sort()).toEqual(["a", "b", "mode", "size", "sizeZ"]);
    expect(got.polluted).toBeUndefined();
  });
});

describe("sanitizeMapState", () => {
  it("піраміда з цілими додатними розмірами", () => {
    expect(sanitizeMapState({ kind: "pyramid", width: 8192, height: 4096 })).toEqual({ kind: "pyramid", width: 8192, height: 4096 });
  });
  it("none лишається none, сміття дає null", () => {
    expect(sanitizeMapState({ kind: "none" })).toEqual({ kind: "none" });
    expect(sanitizeMapState({ kind: "pyramid", width: 0, height: 10 })).toBeNull();
    expect(sanitizeMapState({ kind: "pyramid", width: 1.5, height: 10 })).toBeNull();
    expect(sanitizeMapState({ kind: "pyramid", width: "100", height: 10 })).toBeNull();
    expect(sanitizeMapState({ kind: "pyramid", width: 1e9, height: 10 })).toBeNull();
    expect(sanitizeMapState(null)).toBeNull();
    expect(sanitizeMapState({ kind: "x" })).toBeNull();
  });
});

describe("sanitizeHeightsInfo", () => {
  it("цілі додатні rows і cols", () => {
    expect(sanitizeHeightsInfo({ rows: 1280, cols: 1280 })).toEqual({ rows: 1280, cols: 1280 });
    expect(sanitizeHeightsInfo({ rows: 0, cols: 5 })).toBeNull();
    expect(sanitizeHeightsInfo({ rows: 2.5, cols: 5 })).toBeNull();
    expect(sanitizeHeightsInfo("x")).toBeNull();
  });
});

describe("sanitizeSel", () => {
  it("відомі поля потрібних типів проходять", () => {
    const raw = { m: "abc", t: "def", shell: "SMOKE", charge: 3, folder: "A", mortarFolder: "B", targetFolder: "C" };
    expect(sanitizeSel(raw, baseSel)).toEqual(raw);
  });
  it("неправильні типи замінюються, зайві поля відкидаються", () => {
    const got = sanitizeSel({ m: 5, t: {}, shell: null, charge: "2", folder: 1, extra: true }, baseSel) as unknown as Record<string, unknown>;
    expect(got).toEqual(baseSel);
    expect(got.extra).toBeUndefined();
  });
  it("null для міномета й заряду зберігається", () => {
    expect(sanitizeSel({ m: null, charge: null }, { ...baseSel, m: "x", charge: 2 })).toMatchObject({ m: null, charge: null });
  });
});
