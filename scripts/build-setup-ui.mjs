// Збирає MortarTablet-Setup-<версія>.exe: власне вікно установки (installer/*.cs) з вбудованим NSIS-інсталятором.
//   node scripts/build-setup-ui.mjs [--payload <файл>] [--out <файл>] [--no-latest]
// Без параметрів бере dist/MortarTablet-Payload-<версія>.exe (його робить electron-builder, ціль nsis) і пише
// dist/MortarTablet-Setup-<версія>.exe та переписує dist/latest.yml під цей файл (його завантажує автооновлення: файл у тихому режимі /S
// просто запускає вбудований інсталятор). Потрібен лише класичний компілятор C# з Windows (csc, .NET Framework 4, є в кожній системі).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const payload = resolve(arg("--payload") ?? join(root, "dist", `MortarTablet-Payload-${version}.exe`));
const out = resolve(arg("--out") ?? join(root, "dist", `MortarTablet-Setup-${version}.exe`));
const writeLatest = !process.argv.includes("--no-latest");

if (!existsSync(payload)) {
  console.error(`✗ нема інсталятора-рушія: ${payload} (спершу electron-builder --win nsis)`);
  process.exit(2);
}
const csc = join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
if (!existsSync(csc)) {
  console.error(`✗ нема компілятора C#: ${csc}`);
  process.exit(2);
}

/** Розмір розпакованої програми — за ним вікно показує справжній відсоток копіювання. */
function dirBytes(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return total;
}
const unpacked = join(root, "dist", "win-unpacked");
const expected = existsSync(unpacked) ? dirBytes(unpacked) : 600_000_000;

const tmp = join(root, "dist", "setup-ui");
mkdirSync(tmp, { recursive: true });
const versionFile = join(tmp, "version.txt");
const expectedFile = join(tmp, "expected.txt");
writeFileSync(versionFile, version);
writeFileSync(expectedFile, String(expected));

mkdirSync(dirname(out), { recursive: true });
const args = [
  "/nologo",
  "/target:winexe",
  "/optimize+",
  `/out:${out}`,
  `/win32icon:${join(root, "build", "icon.ico")}`,
  `/win32manifest:${join(root, "installer", "app.manifest")}`,
  "/r:System.Windows.Forms.dll",
  "/r:System.Drawing.dll",
  `/resource:${payload},payload.exe`,
  `/resource:${versionFile},version.txt`,
  `/resource:${expectedFile},expected.txt`,
  `/resource:${join(root, "src", "renderer", "public", "icons", "icon-512.png")},emblem.png`,
  ...readdirSync(join(root, "installer"))
    .filter((f) => f.endsWith(".cs"))
    .sort()
    .map((f) => join(root, "installer", f))
];
try {
  execFileSync(csc, args, { stdio: "inherit" });
} catch {
  console.error("✗ компіляція вікна установки не вдалась");
  process.exit(1);
}
const size = statSync(out).size;
console.log(`✓ ${out} (${(size / 1048576).toFixed(1)} МБ)`);

if (writeLatest) {
  const sha512 = createHash("sha512").update(readFileSync(out)).digest("base64");
  const name = out.slice(out.lastIndexOf("\\") + 1).slice(out.lastIndexOf("/") + 1);
  const yml = `version: ${version}
files:
  - url: ${name}
    sha512: ${sha512}
    size: ${size}
path: ${name}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`;
  writeFileSync(join(dirname(out), "latest.yml"), yml);
  console.log("✓ latest.yml оновлено під цей файл");
}
