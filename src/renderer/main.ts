import "./platform";
import { getRoot, loadState } from "./state";
import { releaseDraw, requestDraw, resetView } from "./mapView";
import { initPanels } from "./panels";
import { $, toast } from "./dom";
import { isOwnShareUrl } from "@core/shareLink";
import { openIncomingShare } from "./exchange";
import { isNativeApp } from "./platform";
import { initWebUpdate } from "./webUpdate";
import { applyStaticTranslations, getLang, onLangChange, setLangSilent, t } from "./i18n";
import { reducedMotion } from "./motion";
import { initSelectSheets } from "./selectSheet";
import { parseInvite } from "@core/squad/config";
import { openInvite } from "./squadPanel";

/**
 * Чекає, поки анімація емблеми на заставці догра до кінця — хоч коли вона стартувала (на телефоні сторінка
 * може почати малюватись із запізненням) — і ще мить тримає готову емблему. Запобіжник — 2,5 с.
 * Важку ініціалізацію запускаємо після цього: вона блокує потік і рвала б анімацію посеред кадрів.
 */
function splashPlayed(): Promise<void> {
  const el = document.getElementById("splash");
  if (!el || reducedMotion()) return Promise.resolve();
  const own = document.getAnimations().filter((a) => {
    const target = (a.effect as KeyframeEffect | null)?.target;
    return !!target && el.contains(target);
  });
  const done = Promise.all(own.map((a) => a.finished.catch(() => undefined)));
  const guard = new Promise<void>((resolve) => setTimeout(resolve, 2500));
  return Promise.race([done, guard]).then(() => new Promise<void>((resolve) => setTimeout(resolve, 150)));
}

/** Заставку з іконкою знімаємо, щойно стан завантажено й інтерфейс готовий. */
function hideSplash(): void {
  const el = document.getElementById("splash");
  if (!el) return;
  el.classList.add("done");
  setTimeout(() => el.remove(), 400);
}

function updateStatus(): void {
  $("status").textContent = t("statusSaved");
}
window.addEventListener("mortar:storage-error", () => toast(t("storageFailed")));

/** ПК-застосунок: власна смуга вікна замість стандартного заголовка. */
function initTitleBar(): void {
  if (!window.api.titleBar.enabled) return;
  document.documentElement.classList.add("framed", "tb-" + window.api.titleBar.platform);
}

async function boot(): Promise<void> {
  initTitleBar();
  const stateLoaded = loadState();
  await splashPlayed();
  await stateLoaded;
  setLangSilent(getRoot().lang);
  document.documentElement.lang = getLang();
  applyStaticTranslations();
  resetView();
  initPanels();
  initSelectSheets();
  onLangChange(updateStatus);
  updateStatus();
  // перший кадр малюємо вже під заставкою, а знімаємо її після нього — зникнення тоді не смикається
  releaseDraw();
  requestDraw();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  hideSplash();

  // Посилання обміну в адресі сторінки (#s=…): відкрити імпорт і прибрати фрагмент з адреси.
  const takeShareFromHash = (): void => {
    if (!location.hash.includes("s=")) return;
    void openIncomingShare(location.hash).then((handled) => {
      if (handled) history.replaceState(null, "", location.pathname + location.search);
    });
  };
  takeShareFromHash();
  window.addEventListener("hashchange", takeShareFromHash);
  // Запрошення у відділення (#squad=…): відкрити вкладку з підставленим посиланням і прибрати фрагмент з адреси
  const takeInviteFromHash = (): void => {
    if (!location.hash.includes("squad=")) return;
    const inv = parseInvite(location.hash);
    if (inv && openInvite(inv)) history.replaceState(null, "", location.pathname + location.search);
  };
  takeInviteFromHash();
  window.addEventListener("hashchange", takeInviteFromHash);
  if (__STANDALONE__ && isNativeApp) {
    // Android: посилання, відкрите через застосунок
    void import("@capacitor/app").then(({ App }) => {
      void App.addListener("appUrlOpen", (e) => {
        if (isOwnShareUrl(e.url)) void openIncomingShare(e.url);
      });
    });
  }
  initWebUpdate();

}

void boot().catch((e) => {
  releaseDraw();
  hideSplash();
  throw e;
});
