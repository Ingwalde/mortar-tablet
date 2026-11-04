import { describe, expect, it } from "vitest";
import { MAX_IMPORT_MARKERS, buildExport, exchangeFileName, mergeImported, parseExchange, serializeExport, type XMarker } from "./markerExchange";

const mk = (id: string, folder: string, type: XMarker["type"] = "target", extra: Partial<XMarker> = {}): XMarker => ({
  id,
  name: "Ціль " + id,
  type,
  x: 100,
  z: 200,
  h: null,
  w: "M252",
  folder,
  u: 1,
  ...extra
});

describe("buildExport", () => {
  const all = [mk("a", "Місія 1"), mk("b", "Місія 2"), mk("c", "Місія 1", "mortar"), mk("d", "Місія 1", "point")];
  it("бере лише вибрану папку й вибрані типи", () => {
    const doc = buildExport(all, { terrain: "everon", folder: "Місія 1", types: new Set(["target", "point"]) });
    expect(doc.markers.map((m) => m.id)).toEqual(["a", "d"]);
    expect(doc.kind).toBe("markers");
    expect(doc.folder).toBe("Місія 1");
  });
  it("null — усі папки", () => {
    const doc = buildExport(all, { terrain: "everon", folder: null, types: new Set(["target"]) });
    expect(doc.markers.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("parseExchange", () => {
  it("кругова перевірка: експорт -> текст -> розбір", () => {
    const doc = buildExport([mk("a", "М1", "target", { h: 12.5, w: "2B14" })], { terrain: "everon", terrainName: "Everon", folder: "М1", types: new Set(["target"]) });
    const r = parseExchange(serializeExport(doc));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.terrain).toBe("everon");
      expect(r.folder).toBe("М1");
      expect(r.markers[0]).toMatchObject({ id: "a", h: 12.5, w: "2B14", folder: "М1" });
    }
  });
  it("приймає старий формат {markers:[...]} і простий масив", () => {
    expect(parseExchange(JSON.stringify({ markers: [mk("a", "")] })).ok).toBe(true);
    expect(parseExchange(JSON.stringify([mk("a", "")])).ok).toBe(true);
  });
  it("пропускає невалідні мітки й рахує їх", () => {
    const r = parseExchange(JSON.stringify({ markers: [mk("a", ""), { name: "x" }, null, { x: "n", z: 1 }] }));
    expect(r.ok && r.markers.length).toBe(1);
    expect(r.ok && r.skipped).toBe(3);
  });
  it("повідомляє причину помилки", () => {
    expect(parseExchange("  ")).toEqual({ ok: false, reason: "empty" });
    expect(parseExchange("not json")).toEqual({ ok: false, reason: "json" });
    expect(parseExchange('{"a":1}')).toEqual({ ok: false, reason: "shape" });
    expect(parseExchange('{"markers":[{"name":"x"}]}')).toEqual({ ok: false, reason: "none" });
  });
});

describe("mergeImported", () => {
  const opts = { folder: null, now: 1000, newId: () => "new1" } as const;
  it("додає нові, повторний імпорт нічого не дублює", () => {
    const first = mergeImported([], [mk("a", "М1"), mk("b", "М1")], opts);
    expect(first.added).toBe(2);
    const again = mergeImported(first.markers, [mk("a", "М1"), mk("b", "М1")], opts);
    expect(again.added).toBe(0);
    expect(again.unchanged).toBe(2);
    expect(again.markers).toHaveLength(2);
  });
  it("оновлює наявну мітку зі зміненими даними й ставить свіжий u", () => {
    const base = [mk("a", "М1", "target", { u: 5 })];
    const r = mergeImported(base, [mk("a", "М1", "target", { x: 999 })], opts);
    expect(r.updated).toBe(1);
    expect(r.markers[0]).toMatchObject({ x: 999, u: 1000 });
  });
  it("перекладає в обрану папку", () => {
    const r = mergeImported([], [mk("a", "М1"), mk("b", "")], { ...opts, folder: "Нова" });
    expect(r.markers.every((m) => m.folder === "Нова")).toBe(true);
  });
  it("мітці без id видає новий", () => {
    const r = mergeImported([], [{ ...mk("", "М1") }], opts);
    expect(r.markers[0].id).toBe("new1");
  });
});

describe("exchangeFileName", () => {
  it("дає безпечне ім'я з терену, папки й дати", () => {
    const n = exchangeFileName("everon", "Місія 2: Північ/схід", new Date(2026, 9, 14, 12).getTime());
    expect(n).toMatch(/^mortar-everon-.+-20261014\.json$/);
    expect(n).not.toMatch(/[\/:*?"<>|]/);
  });
  it("усі папки", () => {
    expect(exchangeFileName("everon", null, new Date(2026, 0, 2).getTime())).toBe("mortar-everon-all-20260102.json");
  });

  it("координати-сміття (понад мільйон метрів) відкидаються як невалідні мітки", () => {
    const text = JSON.stringify({ markers: [{ id: "a", name: "ok", type: "target", x: 100, z: 200 }, { id: "b", name: "bad", type: "target", x: 1e9, z: 0 }, { id: "c", name: "bad2", type: "target", x: 0, z: -2e6 }] });
    const r = parseExchange(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.markers.map((x) => x.id)).toEqual(["a"]);
      expect(r.skipped).toBe(2);
    }
  });
});

describe("нові поля мітки (приналежність, вид, підпис)", () => {
  it("розбір бере їх, обрізає підпис і виводить type з приналежності та виду", () => {
    const text = JSON.stringify({
      app: "mortar-tablet",
      kind: "markers",
      v: 1,
      terrain: "everon",
      folder: null,
      exportedAt: 1,
      markers: [
        { id: "a", name: "БТР", type: "point", x: 1, z: 2, aff: "hostile", kind: "armour", caption: "  кулемет  на\nвежі " + "я".repeat(200), c: 123 },
        { id: "b", name: "Старий", type: "target", x: 3, z: 4 },
        { id: "c", name: "Сміття", type: "mortar", x: 5, z: 6, aff: "neutral", kind: "tank" }
      ]
    });
    const r = parseExchange(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b, c] = r.markers;
    expect(a).toMatchObject({ type: "target", aff: "hostile", kind: "armour", c: 123 });
    expect(a.caption!.length).toBe(120);
    expect(a.caption!.startsWith("кулемет на вежі")).toBe(true);
    expect(b).toMatchObject({ type: "target", aff: "hostile", kind: "infantry" });
    expect(c).toMatchObject({ type: "mortar", aff: "friend", kind: "mortar" });
  });
});

describe("parseExchange: межа кількості", () => {
  it("зайві мітки відкидаються й рахуються як пропущені", () => {
    const many = Array.from({ length: MAX_IMPORT_MARKERS + 25 }, (_, i) => ({ id: "m" + i, name: "n", type: "target", x: i, z: i }));
    const r = parseExchange(JSON.stringify({ markers: many }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.markers).toHaveLength(MAX_IMPORT_MARKERS);
      expect(r.skipped).toBe(25);
    }
  });
});
