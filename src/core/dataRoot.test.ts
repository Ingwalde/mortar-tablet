import { describe, expect, it } from "vitest";
import { decodeDataRootBytes, isAbsolutePath, isSameOrInside, parseDataRootFile } from "./dataRoot";

describe("dataRoot", () => {
  it("абсолютні шляхи Windows і POSIX", () => {
    expect(isAbsolutePath("D:\\Maps")).toBe(true);
    expect(isAbsolutePath("d:/maps")).toBe(true);
    expect(isAbsolutePath("\\\\server\\share\\maps")).toBe(true);
    expect(isAbsolutePath("/data/maps")).toBe(true);
    expect(isAbsolutePath("maps")).toBe(false);
    expect(isAbsolutePath("..\\maps")).toBe(false);
    expect(isAbsolutePath("D:maps")).toBe(false);
    expect(isAbsolutePath("\\\\server")).toBe(false);
    expect(isAbsolutePath("")).toBe(false);
  });

  it("читає файл налаштування: BOM, пробіли, кінцеві слеші, перший рядок", () => {
    expect(parseDataRootFile("\uFEFF D:\\Карти\\Mortar \r\nзайве")).toBe("D:\\Карти\\Mortar");
    expect(parseDataRootFile("D:\\Maps\\\n")).toBe("D:\\Maps");
    expect(parseDataRootFile("/data/maps/")).toBe("/data/maps");
  });

  it("файл від інсталятора (UTF-16 з BOM) і від застосунку (UTF-8) читаються однаково", () => {
    const text = "D:\\Карти\\Mortar\r\n";
    const utf16 = new Uint8Array([0xff, 0xfe, ...[...text].flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])]);
    const utf8 = new TextEncoder().encode(text);
    expect(parseDataRootFile(decodeDataRootBytes(utf16))).toBe("D:\\Карти\\Mortar");
    expect(parseDataRootFile(decodeDataRootBytes(utf8))).toBe("D:\\Карти\\Mortar");
  });

  it("порожнє, відносне й підозріле відкидається", () => {
    expect(parseDataRootFile("")).toBeNull();
    expect(parseDataRootFile("   \n")).toBeNull();
    expect(parseDataRootFile("maps\\x")).toBeNull();
    expect(parseDataRootFile("D:\\a\0b")).toBeNull();
  });

  it("вкладеність папок без урахування регістру й напрямку слешів", () => {
    expect(isSameOrInside("D:\\Maps", "d:/maps")).toBe(true);
    expect(isSameOrInside("D:\\Maps", "D:\\Maps\\tiles")).toBe(true);
    expect(isSameOrInside("D:\\Maps", "D:\\Maps2")).toBe(false);
    expect(isSameOrInside("D:\\Maps\\tiles", "D:\\Maps")).toBe(false);
  });
});
