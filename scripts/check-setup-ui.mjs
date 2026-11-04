// Перевірка тихого режиму власного вікна установки (installer/*.cs): саме так його запускає автооновлення.
//   node scripts/check-setup-ui.mjs
// Збирає вікно з тестовим «інсталятором» (він записує свої параметри й повертає код 7), запускає з /S і перевіряє, що параметри
// дійшли дослівно (включно з /D=... із пробілом і без лапок), код завершення передався, а тимчасова папка прибрана.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("пропущено: перевірка лише для Windows");
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const csc = join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
const work = mkdtempSync(join(tmpdir(), "mortar-setup-check-"));
const outDir = join(work, "out dir");
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failed++;
};
const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith("mortar-tablet-setup-")).length;

try {
  writeFileSync(
    join(work, "payload.cs"),
    `using System; using System.IO;
class P { static int Main(string[] a) {
  File.WriteAllText(Path.Combine(Environment.GetEnvironmentVariable("MORTAR_TEST_OUT"), "args.txt"), Environment.CommandLine);
  return 7;
} }`
  );
  execFileSync(csc, ["/nologo", `/out:${join(work, "payload.exe")}`, join(work, "payload.cs")], { stdio: "ignore" });
  const setup = join(work, "Setup.exe");
  execFileSync(process.execPath, [join(root, "scripts", "build-setup-ui.mjs"), "--payload", join(work, "payload.exe"), "--out", setup, "--no-latest"], { stdio: "ignore" });
  check(existsSync(setup), "вікно установки збирається");

  execFileSync("cmd.exe", ["/c", "mkdir", outDir], { stdio: "ignore" });
  const before = leftovers();
  let code = 0;
  const rawArgs = `/S --updated /currentuser /D=${join(work, "my app")}`;
  try {
    // аргументи передаються одним рядком, щоб пробіл у /D=... не розбивався
    execFileSync("cmd.exe", ["/d", "/s", "/c", `"${setup}" ${rawArgs}`], { stdio: "ignore", env: { ...process.env, MORTAR_TEST_OUT: outDir }, windowsVerbatimArguments: true });
  } catch (e) {
    code = e.status ?? -1;
  }
  check(code === 7, `код завершення інсталятора передано (${code})`);
  const argsFile = join(outDir, "args.txt");
  const got = existsSync(argsFile) ? readFileSync(argsFile, "utf8") : "";
  check(got.endsWith(rawArgs), "параметри дійшли дослівно, /D=... без лапок");
  check(leftovers() === before, "тимчасова папка прибрана");
} catch (e) {
  console.log(`✗ помилка: ${e.message}`);
  failed++;
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(failed ? `\nПровалено перевірок: ${failed}` : "\nУсі перевірки пройдено");
process.exit(failed ? 1 : 0);
