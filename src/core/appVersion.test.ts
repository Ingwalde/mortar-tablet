import { describe, expect, it } from "vitest";
import { apkUrlOf, isNewerVersion, isTrustedReleaseUrl, parseVersion, swBuildOf, updateFrom } from "./appVersion";

const R = "https://github.com/Ingwalde/mortar-tablet/releases";

describe("swBuildOf", () => {
  it("читає збірку з адреси service worker-а", () => {
    expect(swBuildOf("https://x.github.io/mortar-tablet/sw.js?v=1.1.2")).toBe("1.1.2");
    expect(swBuildOf("https://x.github.io/mortar-tablet/sw.js")).toBeNull();
    expect(swBuildOf("not a url")).toBeNull();
    expect(swBuildOf(undefined)).toBeNull();
  });
});

describe("appVersion", () => {
  it("розбирає версії з префіксом v і без", () => {
    expect(parseVersion("v0.11.0")).toEqual([0, 11, 0]);
    expect(parseVersion("1.2.3-beta")).toEqual([1, 2, 3]);
    expect(parseVersion("android-test")).toBeNull();
  });

  it("порівнює числово, а не рядково", () => {
    expect(isNewerVersion("v0.10.0", "0.9.0")).toBe(true);
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(false);
    expect(isNewerVersion("0.10.0", "0.10.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
    expect(isNewerVersion("garbage", "0.1.0")).toBe(false);
  });

  it("оновлення: лише стабільний новіший реліз; APK має пріоритет над сторінкою релізу", () => {
    const rel = {
      tag_name: "v0.11.0",
      html_url: `${R}/tag/v0.11.0`,
      assets: [
        { name: "MortarTablet-Setup-0.11.0.exe", browser_download_url: `${R}/download/v0.11.0/setup.exe` },
        { name: "MortarTablet-0.11.0.apk", browser_download_url: `${R}/download/v0.11.0/app.apk` }
      ]
    };
    expect(apkUrlOf(rel)).toBe(`${R}/download/v0.11.0/app.apk`);
    expect(updateFrom(rel, "0.10.0")).toEqual({ version: "0.11.0", url: `${R}/download/v0.11.0/app.apk` });
    expect(updateFrom({ ...rel, assets: [] }, "0.10.0")).toEqual({ version: "0.11.0", url: rel.html_url });
    expect(updateFrom(rel, "0.11.0")).toBeNull();
    expect(updateFrom({ ...rel, prerelease: true }, "0.10.0")).toBeNull();
    expect(updateFrom({ ...rel, draft: true }, "0.10.0")).toBeNull();
    expect(updateFrom(null, "0.10.0")).toBeNull();
  });

  it("довіряє лише https github.com у межах нашого репозиторію", () => {
    expect(isTrustedReleaseUrl(`${R}/download/v1.0.0/a.apk`)).toBe(true);
    expect(isTrustedReleaseUrl("http://github.com/Ingwalde/mortar-tablet/releases")).toBe(false);
    expect(isTrustedReleaseUrl("https://evil.example/Ingwalde/mortar-tablet/releases")).toBe(false);
    expect(isTrustedReleaseUrl("https://github.com/other/repo/releases")).toBe(false);
    expect(isTrustedReleaseUrl("https://github.com.evil.example/Ingwalde/mortar-tablet/x")).toBe(false);
    expect(isTrustedReleaseUrl("https://user:pw@github.com/Ingwalde/mortar-tablet/x")).toBe(false);
    expect(isTrustedReleaseUrl("javascript:alert(1)")).toBe(false);
    expect(isTrustedReleaseUrl("не url")).toBe(false);
  });

  it("підмінене посилання в API не стає оновленням", () => {
    const evil = { tag_name: "v9.9.9", html_url: "https://evil.example/x", assets: [{ name: "a.apk", browser_download_url: "https://evil.example/a.apk" }] };
    expect(updateFrom(evil, "0.10.0")).toBeNull();
    // APK підмінено, сторінка релізу справжня — лишається сторінка
    const half = { tag_name: "v9.9.9", html_url: `${R}/tag/v9.9.9`, assets: [{ name: "a.apk", browser_download_url: "https://evil.example/a.apk" }] };
    expect(updateFrom(half, "0.10.0")).toEqual({ version: "9.9.9", url: `${R}/tag/v9.9.9` });
  });
});
