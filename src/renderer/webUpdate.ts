/**
 * Сповіщення про нову версію для автономних збірок (на ПК є власний механізм — updatePanel):
 *  - веб-версія (PWA): service worker сам завантажує нову збірку; коли вона перебрала керування, пропонуємо перезавантажити;
 *  - Android-застосунок: раз на пів доби дивимось останній реліз на GitHub і пропонуємо завантажити APK.
 */
import { getRoot } from "./state";
import { isTrustedReleaseUrl, swBuildOf, updateFrom, type ReleaseLike } from "@core/appVersion";
import { t } from "./i18n";
import { isNativeApp, isStandalone } from "./platform";

const REPO = "Ingwalde/mortar-tablet";
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const LS_CHECKED = "mortar.upd.checked";
const LS_DISMISSED = "mortar.upd.dismissed";

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // сховище недоступне — просто не запам'ятовуємо
  }
}

export function showBanner(text: string, actionLabel: string, onAction: () => void, onClose?: () => void): void {
  document.getElementById("updateBanner")?.remove();
  const box = document.createElement("div");
  box.id = "updateBanner";
  box.className = "upd";
  box.setAttribute("role", "status");
  const span = document.createElement("span");
  span.textContent = text;
  const act = document.createElement("button");
  act.type = "button";
  act.className = "btn primary";
  act.textContent = actionLabel;
  act.onclick = () => {
    box.remove();
    onAction();
  };
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn";
  close.textContent = "×";
  close.setAttribute("aria-label", t("updClose"));
  close.onclick = () => {
    box.remove();
    onClose?.();
  };
  box.append(span, act, close);
  document.body.appendChild(box);
}

async function openExternal(url: string): Promise<void> {
  if (!isTrustedReleaseUrl(url)) return;
  if (__STANDALONE__ && isNativeApp) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener");
}

async function checkRelease(force = false): Promise<void> {
  if (!getRoot().updateNotice) return;
  const last = Number(lsGet(LS_CHECKED) ?? 0);
  if (!force && Date.now() - last < CHECK_EVERY_MS) return;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: "application/vnd.github+json" } });
    if (!res.ok) return;
    lsSet(LS_CHECKED, String(Date.now()));
    const upd = updateFrom((await res.json()) as ReleaseLike, __APP_VERSION__);
    if (!upd || lsGet(LS_DISMISSED) === upd.version) return;
    showBanner(
      t("webUpdAvailable", { v: upd.version }),
      t("updDownload"),
      () => void openExternal(upd.url),
      () => lsSet(LS_DISMISSED, upd.version)
    );
  } catch {
    // нема інтернету — спробуємо наступного запуску
  }
}

function watchServiceWorker(): void {
  const sw = navigator.serviceWorker;
  // перший запуск (контролера ще нема) — це не оновлення
  const hadController = !!sw.controller;
  sw.addEventListener("controllerchange", () => {
    if (!hadController) return;
    // сторінка вантажиться з мережі першою, тож після оновлення сторінки вона вже нова, а service worker лише наздоганяє:
    // пропонуємо перезавантаження, лише якщо збірка сторінки відрізняється від збірки нового service worker-а
    if (swBuildOf(sw.controller?.scriptURL) === __APP_VERSION__) return;
    if (getRoot().updateNotice) showBanner(t("updReloadText"), t("updReload"), () => location.reload());
  });
  const poll = (): void => {
    void sw.getRegistration().then((reg) => reg?.update().catch(() => undefined));
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") poll();
  });
  setInterval(poll, 6 * 60 * 60 * 1000);
}

export function initWebUpdate(): void {
  if (!isStandalone) return;
  if (isNativeApp) {
    void checkRelease();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void checkRelease();
    });
    return;
  }
  if ("serviceWorker" in navigator && window.isSecureContext) watchServiceWorker();
}
