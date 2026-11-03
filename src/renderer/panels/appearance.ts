import { clampPlacesScale, normalizePlacesLevel } from "@core/places";
import { parseExchange } from "@core/markerExchange";
import { currentMeta, getCurrent, getRoot, markDeleted, scheduleSave, uid, type Marker, type ThemeName } from "../state";
import { requestDraw, setRingsVisible, setLightMode, isLightMode, setShowPlaces, setPlacesStyle } from "../mapView";
import { $, ask, toast } from "../dom";
import { t } from "../i18n";
import { setKeepAwake } from "../wakeLock";
import { playTestSound, setShotMuted, setShotVolume } from "../shotAudio";
import { copyText, setSelectedId } from "./common";
import { renderAll } from "./renderHub";

// ---------- backup ----------
$<HTMLButtonElement>("copyJson").onclick = () => copyText(JSON.stringify({ markers: getCurrent().markers }, null, 1));

$<HTMLButtonElement>("importJson").onclick = () => {
  // той самий розбір, що й в «Імпорті…» за папкою: межі координат і довжин, ліміт кількості, підпис і «зруйновано» не губляться
  const pr = parseExchange($<HTMLTextAreaElement>("json").value);
  if (!pr.ok) {
    toast(t("importedNotMarks"));
    return;
  }
  const S = getCurrent();
  const ids = new Set(S.markers.map((m) => m.id));
  const now = Date.now();
  for (const m of pr.markers) {
    // мітка з уже наявним (або повторним у файлі) id отримує новий — імпорт нічого не перезаписує
    const id = m.id && !ids.has(m.id) ? m.id : uid();
    ids.add(id);
    S.markers.push({ ...m, id, u: now } as Marker);
  }
  scheduleSave();
  renderAll();
  $<HTMLTextAreaElement>("json").value = "";
  toast(t("importedCount", { n: pr.markers.length }));
};

$<HTMLButtonElement>("wipe").onclick = async () => {
  const S = getCurrent();
  if (!S.markers.length) return;
  const ok = await ask(t("wipeTitle"), t("wipeText", { n: S.markers.length, terrain: currentMeta().name }), t("deleteBtn"));
  if (ok) {
    for (const m of S.markers) markDeleted(m.id);
    S.markers = [];
    setSelectedId(null);
    scheduleSave();
    renderAll();
  }
};

/** Застосовує колірну тему інтерфейсу: атрибут на <html> (палітра), колір рядка стану й стан кнопок. Карта лишається природною. */
const THEME_BAR_COLOR: Record<ThemeName, string> = { green: "#161c18", red: "#1c1716", blue: "#16181c" };

function applyTheme(): void {
  const r = getRoot();
  const el = document.documentElement;
  // зелена — типова палітра; червона й синя — hue-зсув від неї, усі темні
  if (r.theme === "green") delete el.dataset.theme;
  else el.dataset.theme = r.theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_BAR_COLOR[r.theme];
  // рідні кнопки керування вікном (ПК) у колір смуги поточної теми
  if (window.api.titleBar.enabled) void window.api.titleBar.setColor(THEME_BAR_COLOR[r.theme]).catch(() => undefined);
  for (const b of document.querySelectorAll<HTMLButtonElement>("#settingsDlg [data-theme-pick]")) {
    b.setAttribute("aria-pressed", String(b.dataset.themePick === r.theme));
  }
}

for (const b of document.querySelectorAll<HTMLButtonElement>("#settingsDlg [data-theme-pick]")) {
  b.onclick = () => {
    getRoot().theme = b.dataset.themePick as ThemeName;
    applyTheme();
    scheduleSave();
  };
}

export function applyShotSettings(): void {
  const r = getRoot();
  applyTheme();
  setRingsVisible(r.showRings);
  ($("ringsToggle") as HTMLInputElement).checked = r.showRings;
  ($("lightToggle") as HTMLInputElement).checked = isLightMode();
  $("soundBtn").setAttribute("aria-pressed", String(r.soundShots));
  setShotMuted(!r.soundShots);
  setShotVolume(r.soundVolume);
  setKeepAwake(r.keepAwake);
}

// Автоматичне вмикання економного режиму (кадри просіли): оновлюємо перемикач і кажемо про це.
window.addEventListener("mortar:light", (e) => {
  const d = (e as CustomEvent<{ on: boolean; manual: boolean }>).detail;
  ($("lightToggle") as HTMLInputElement).checked = d.on;
  if (!d.manual && d.on) toast(t("lightAuto"), 4000);
});

$<HTMLInputElement>("lightToggle").onchange = (e) => {
  setLightMode((e.target as HTMLInputElement).checked, true);
  toast(t(isLightMode() ? "lightOn" : "lightOff"));
  requestDraw();
};

$<HTMLInputElement>("ringsToggle").onchange = (e) => {
  getRoot().showRings = (e.target as HTMLInputElement).checked;
  applyShotSettings();
  scheduleSave();
};

$<HTMLButtonElement>("soundBtn").onclick = () => {
  const r = getRoot();
  r.soundShots = !r.soundShots;
  applyShotSettings();
  scheduleSave();
  toast(t(r.soundShots ? "soundOn" : "soundOff"));
  // увімкнули — одразу чути короткий звук (і аудіо розблоковується жестом)
  if (r.soundShots) void playTestSound();
};

export function applyPlacesStyle(): void {
  const r = getRoot();
  setPlacesStyle(r.placesScale, r.placesLevel);
  ($("placesScale") as HTMLInputElement).value = String(Math.round(r.placesScale * 100));
  $("placesScaleVal").textContent = `${Math.round(r.placesScale * 100)}%`;
  ($("placesLevel") as HTMLSelectElement).value = String(r.placesLevel);
  ($("placesToggle") as HTMLInputElement).checked = r.showPlaces;
  setShowPlaces(r.showPlaces);
}

$<HTMLInputElement>("placesScale").oninput = (e) => {
  getRoot().placesScale = clampPlacesScale(Number((e.target as HTMLInputElement).value) / 100);
  applyPlacesStyle();
  scheduleSave();
  requestDraw();
};

$<HTMLSelectElement>("placesLevel").onchange = (e) => {
  getRoot().placesLevel = normalizePlacesLevel(Number((e.target as HTMLSelectElement).value));
  applyPlacesStyle();
  scheduleSave();
  requestDraw();
};

function onPlacesToggle(e: Event): void {
  getRoot().showPlaces = (e.target as HTMLInputElement).checked;
  setShowPlaces(getRoot().showPlaces);
  scheduleSave();
  requestDraw();
}

$<HTMLInputElement>("placesToggle").onchange = onPlacesToggle;
