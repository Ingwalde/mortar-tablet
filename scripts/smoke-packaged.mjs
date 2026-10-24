// «Димовий» тест зібраного застосунку: запускає exe з тимчасовою папкою даних і відкритим портом налагодження Chromium,
// підключається до вікна й перевіряє, що сторінка завантажилась, preload дає API, вбудована карта й висоти читаються.
// Ловить клас помилок «збірка не стартує» (як було з імпортом electron-updater) ще до релізу.
//   node scripts/smoke-packaged.mjs [шлях до exe]      (типово dist/win-unpacked/Планшет мінометника.exe)
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exe = process.argv[2] ?? "dist/win-unpacked/Планшет мінометника.exe";
if (!existsSync(exe)) {
  console.error(`✗ нема файлу: ${exe} (спершу npm run dist:win)`);
  process.exit(2);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const debugPort = await freePort();
const dir = mkdtempSync(join(tmpdir(), "mortar-smoke-"));
// папка даних, вказана інсталятором: data-dir.txt у UTF-16 з BOM (як його пише NSIS), шлях із кирилицею
const customRoot = mkdtempSync(join(tmpdir(), "mortar-карти-"));
mkdirSync(join(customRoot, "tiles", "smoke", "0", "0"), { recursive: true });
writeFileSync(join(customRoot, "tiles", "smoke", "0", "0", "0.jpg"), "x");
writeFileSync(join(dir, "data-dir.txt"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(customRoot + "\r\n", "utf16le")]));
const child = spawn(exe, [`--user-data-dir=${dir}`, `--remote-debugging-port=${debugPort}`], { stdio: "ignore", windowsHide: true });
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failed++;
};

function killTree() {
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  } catch {
    // уже завершився
  }
}

/** Мінімальний клієнт протоколу налагодження Chromium: виконує вираз у сторінці й повертає значення. */
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const waiting = new Map();
    let id = 0;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      const w = waiting.get(msg.id);
      if (w) {
        waiting.delete(msg.id);
        msg.error ? w.reject(new Error(msg.error.message)) : w.resolve(msg.result);
      }
    };
    ws.onerror = () => reject(new Error("не вдалось підключитись до вікна застосунку"));
    ws.onopen = () =>
      resolve({
        evaluate: (expression) =>
          new Promise((res, rej) => {
            const n = ++id;
            waiting.set(n, {
              resolve: (r) => (r.exceptionDetails ? rej(new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description ?? ""))) : res(r.result.value)),
              reject: rej
            });
            ws.send(JSON.stringify({ id: n, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
          }),
        close: () => ws.close()
      });
  });
}

try {
  // 1. чекаємо вікно застосунку
  const t0 = Date.now();
  let target = null;
  while (Date.now() - t0 < 40000 && !target) {
    if (child.exitCode !== null) break;
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      target = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl) ?? null;
    } catch {
      // вікна ще нема
    }
    if (!target) await sleep(250);
  }
  check(!!target, `вікно застосунку відкрилось${target ? ` за ${((Date.now() - t0) / 1000).toFixed(1)} с` : " (не відкрилось: застосунок не стартує)"}`);
  if (!target) throw new Error("не стартував");

  const page = await connect(target.webSocketDebuggerUrl);
  // даємо рендереру завантажитись і виконати старт
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate("!!document.getElementById('cv') && !!window.api")) break;
    await sleep(250);
  }
  check(await page.evaluate("!!document.getElementById('cv')"), "сторінка планшета завантажилась (є полотно карти)");
  check(await page.evaluate("typeof window.api?.store?.load === 'function' && window.api.remote === false"), "preload дає window.api");
  check(
    await page.evaluate("/default-src 'self'/.test(document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')?.content ?? '')"),
    "сторінка має політику вмісту (CSP)"
  );
  check(await page.evaluate("typeof window.require === 'undefined' && typeof window.process === 'undefined'"), "рендерер без доступу до Node (пісочниця)");

  // вбудована карта Novyinovka віддається зі свіжої папки даних (без власного імпорту): тайл читається з пакета застосунку
  const tile = await page.evaluate(
    "fetch('localtile://novyinovka/5/10/10').then(async (r) => ({ status: r.status, type: r.headers.get('content-type') ?? '', len: (await r.arrayBuffer()).byteLength }))"
  );
  check(tile.status === 200 && tile.type.includes("image/webp") && tile.len > 500, "вбудована карта Novyinovka (тайл з архіву застосунку)");
  const heights = await page.evaluate(
    "window.api.heights.read('bystrany').then((b) => (b ? { len: b.length, first: new DataView(b.buffer, b.byteOffset).getInt32(0, true) } : null))"
  );
  check(!!heights && heights.len > 1_000_000 && heights.first > 100, "вбудовані висоти (стиснені) розпаковуються");
  // папка даних із data-dir.txt (як від інсталятора) діє, а «Типова папка» переносить дані назад
  const root = await page.evaluate("window.api.storage.root()");
  check(root.path === customRoot && !root.isDefault, "папка даних береться з data-dir.txt (UTF-16, кирилиця)");
  // діалог «Завантажені дані» показує цю папку й кнопки керування
  await page.evaluate("document.getElementById('storageOpen').click()");
  await sleep(600);
  const shown = await page.evaluate("document.getElementById('storageRootPath').textContent");
  check(shown === customRoot && (await page.evaluate("!document.getElementById('storageRootReset').hidden")), "діалог даних показує папку й кнопку «Типова папка»");
  await page.evaluate("document.getElementById('storageDlg').close()");
  const listed = await page.evaluate("window.api.storage.list().then((l) => l.map((e) => e.id))");
  check(listed.includes("smoke"), "менеджер даних бачить файли в тій папці");
  const moved = await page.evaluate("window.api.storage.moveRoot(null)");
  check(moved.moved === true && existsSync(join(dir, "tiles", "smoke", "0", "0", "0.jpg")) && !existsSync(join(customRoot, "tiles")), "перенесення в типову папку: файли на місці, стара папка очищена");
  check((await page.evaluate("window.api.storage.root()")).isDefault === true, "після перенесення папка даних типова");
  check(!existsSync(join(dir, "data-dir.txt")), "файл data-dir.txt прибрано");
  page.close();

  // 2. запобіжники Electron у зібраному exe
  try {
    const { getCurrentFuseWire, FuseV1Options } = await import("@electron/fuses");
    const wire = await getCurrentFuseWire(exe);
    const on = (o) => wire[o] === 49; // 0x31 = «1» = увімкнено
    check(!on(FuseV1Options.RunAsNode), "fuse: ELECTRON_RUN_AS_NODE вимкнено");
    check(!on(FuseV1Options.EnableNodeOptionsEnvironmentVariable), "fuse: NODE_OPTIONS вимкнено");
    check(!on(FuseV1Options.EnableNodeCliInspectArguments), "fuse: --inspect вимкнено");
    check(on(FuseV1Options.OnlyLoadAppFromAsar), "fuse: лише app.asar");
    check(on(FuseV1Options.EnableEmbeddedAsarIntegrityValidation), "fuse: перевірка цілісності asar");
  } catch (e) {
    check(false, `fuses не прочитано: ${e.message}`);
  }
} catch (e) {
  if (e.message !== "не стартував") {
    console.log(`✗ помилка: ${e.message}`);
    failed++;
  }
} finally {
  killTree();
  await sleep(500);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // файли ще зайняті — тимчасова папка, не страшно
  }
}
console.log(failed ? `\nПровалено перевірок: ${failed}` : "\nУсі перевірки пройдено");
process.exit(failed ? 1 : 0);
