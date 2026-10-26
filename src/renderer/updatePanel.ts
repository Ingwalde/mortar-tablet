import { toast } from "./dom";
import { t } from "./i18n";
import { isRemote } from "./platform";
import { showBanner } from "./webUpdate";

type Status = { state: string; version?: string; percent?: number; message?: string; url?: string };

let last: Status = { state: "idle" };
let box: HTMLElement | null = null;

function text(s: Status): string {
  switch (s.state) {
    case "checking":
      return t("updChecking");
    case "available":
      return t("updAvailable", { v: s.version ?? "" });
    case "downloading":
      return t("updProgress", { p: s.percent ?? 0 });
    case "ready":
      return t("updReady", { v: s.version ?? "" });
    case "manual":
      return t("updManual", { v: s.version ?? "" });
    case "none":
      return t("updNone");
    case "error":
      return t("updError");
    case "unsupported":
      return t("updUnsupported");
    default:
      return "";
  }
}

function paint(): void {
  if (!box) return;
  box.textContent = "";
  const line = document.createElement("p");
  line.className = "hint";
  line.textContent = `${t("updCurrent", { v: __APP_VERSION__ })}${text(last) ? " · " + text(last) : ""}`;
  box.appendChild(line);
  if (last.state === "ready") {
    const b = document.createElement("button");
    b.className = "btn primary";
    b.textContent = t("updInstallBtn");
    b.onclick = () => void window.api.updater.install();
    box.appendChild(b);
  } else if (last.state === "manual" && last.url) {
    const url = last.url;
    const b = document.createElement("button");
    b.className = "btn primary";
    b.textContent = t("updOpenPage");
    b.onclick = () => window.open(url, "_blank", "noopener");
    box.appendChild(b);
  } else if (last.state !== "unsupported") {
    const b = document.createElement("button");
    b.className = "btn small";
    b.textContent = t("updCheckBtn");
    b.disabled = last.state === "checking" || last.state === "downloading";
    b.onclick = () => void window.api.updater.check();
    box.appendChild(b);
  }
}

/** Рядок «Версія … · стан оновлення» з кнопками — у діалозі «Про програму» (лише на ПК). */
export function mountUpdateBox(container: Element): void {
  if (isRemote) return;
  box = document.createElement("div");
  box.className = "update-box";
  container.prepend(box);
  paint();
  void window.api.updater.status().then((s) => {
    last = s;
    paint();
  });
}

export function initUpdater(): void {
  if (isRemote) return;
  // оновлення могло завантажитися ще до відкриття вікна
  void window.api.updater.status().then((s) => {
    if (s.state === "ready" && last.state !== "ready") showBanner(t("updReady", { v: s.version ?? "" }), t("updInstallBtn"), () => void window.api.updater.install());
    last = s;
  });
  window.api.updater.onStatus((s) => {
    const was = last.state;
    last = s;
    paint();
    // оновлення завантажене: помітна смужка з кнопкою, бо інакше воно чекає виходу з програми й залишається непоміченим
    if (s.state === "ready" && was !== "ready") showBanner(t("updReady", { v: s.version ?? "" }), t("updInstallBtn"), () => void window.api.updater.install());
    // macOS і .deb: самі не оновлюємось, тож один раз сповіщаємо про нову версію
    if (s.state === "manual" && was !== "manual") {
      const url = (s as { url?: string }).url;
      if (url) showBanner(t("updManual", { v: s.version ?? "" }), t("updOpenPage"), () => window.open(url, "_blank", "noopener"));
      else toast(t("updManual", { v: s.version ?? "" }));
    }
  });
}
