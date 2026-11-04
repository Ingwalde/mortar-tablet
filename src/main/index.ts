import { app, BrowserWindow, Menu, nativeTheme, session, shell } from "electron";
import { isAllowedExternalUrl } from "./security";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { registerPrivilegedSchemes, registerProtocolHandlers } from "./protocols";
import { registerIpcHandlers } from "./ipc";
import { registerUpdater } from "./updater";

/** Версії до 1.0.1 зберігали тут налаштування й закритий ключ режиму «Перегляд з телефона»; режиму більше нема, файли прибираємо. */
async function removeLegacyLanFiles(): Promise<void> {
  const dir = app.getPath("userData");
  for (const name of ["lan.json", "lan-ca.json", "lan-leaf.json"]) await rm(join(dir, name), { force: true }).catch(() => undefined);
}

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
/** Висота власної смуги вікна (px). Рідні кнопки керування на піксель нижчі, щоб нижня лінія смуги йшла через усю ширину. */
export const TITLE_BAR_HEIGHT = 36;

if (isDev) app.commandLine.appendSwitch("remote-debugging-port", "9222");

registerPrivilegedSchemes();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // темний заголовок і фон до завантаження сторінки (без білого спалаху); у dev значок береться з build/, у збірці — з exe
    backgroundColor: "#161c18",
    // власна смуга замість стандартного чорного заголовка: Windows і Linux лишають рідні кнопки (колір задає застосунок), macOS — світлофор
    titleBarStyle: "hidden",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 14, y: 10 } }
      : { titleBarOverlay: { color: "#161c18", symbolColor: "#e3e1d4", height: TITLE_BAR_HEIGHT - 1 } }),
    ...(isDev ? { icon: join(app.getAppPath(), "build/icon.png") } : {}),
    webPreferences: {
      preload: join(app.getAppPath(), "out/preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Пісочниця рендерера: preload збирається як CommonJS і користується лише contextBridge/ipcRenderer.
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  if (isDev) {
    mainWindow.webContents.on("console-message", (_e, _level, message, line, sourceId) => {
      console.log(`[renderer] ${message} (${sourceId}:${line})`);
    });
  }

  // Нові вікна не відкриваємо; у браузер системи йдуть лише http(s)-посилання.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isAllowedExternalUrl(details.url)) void shell.openExternal(details.url);
    return { action: "deny" };
  });
  // Жодних переходів поза застосунком: сторінка планшета не повинна вести кудись інде.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const here = mainWindow?.webContents.getURL() ?? "";
    // та сама сторінка (перезавантаження, якір) дозволена; інший file:// — ні: вікно має привілеї, довільний локальний файл у ньому не потрібен
    const page = (u: string): string => u.split("#")[0].split("?")[0];
    if (page(url) !== page(here) && !url.startsWith(process.env.ELECTRON_RENDERER_URL ?? "\u0000")) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    }
  });
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(app.getAppPath(), "out/renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  // Застосунок завжди темний: темний системний заголовок вікна, без стандартного меню Electron (File/Edit/View/Window).
  nativeTheme.themeSource = "dark";
  if (!isDev && process.platform !== "darwin") Menu.setApplicationMenu(null);
  // Дозволи сторінки: лише запис у буфер обміну (кнопки «Копіювати»); камера, геолокація тощо не потрібні.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "clipboard-sanitized-write");
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "clipboard-sanitized-write");
  registerProtocolHandlers();
  registerIpcHandlers(() => mainWindow);
  registerUpdater(() => mainWindow);
  void removeLegacyLanFiles();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
