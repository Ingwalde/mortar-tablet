import { describe, expect, it } from "vitest";
import { PRESETS } from "./terrains";

describe("terrains", () => {
  it("imageSpan, якщо заданий, лише трохи відрізняється від розміру терену", () => {
    for (const t of PRESETS) {
      if (t.imageSpan === undefined) continue;
      expect(t.imageSpan).toBeGreaterThan(t.sizeX * 0.99);
      expect(t.imageSpan).toBeLessThan(t.sizeX * 1.01);
    }
  });
  it("Gogland: знімок покриває ≈12279 м, а не 12288", () => {
    expect(PRESETS.find((t) => t.id === "gogland")?.imageSpan).toBe(12279);
  });
});
