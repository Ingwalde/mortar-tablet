import { PRESETS } from "@core/terrains";
import { MAX_SIZE } from "@core/stateGuard";
import { addCustomTerrain, applyExternalState, takeExternalSummary, currentMeta, getCurrent, getRoot, removeCustomTerrain, scheduleSave, switchTerrain } from "../state";
import { requestDraw, resetView, setDrawCallbacks, setShowPlaces, setTapHandlers, syncImageSize } from "../mapView";
import { $, ask, toast } from "../dom";
import { ensureHeights, ensureMapImage, startMapImportUi } from "../mapImport";
import { onHeightsLoaded } from "../terrainHeight";
import { onLangChange, t } from "../i18n";
import { initImmersive, initSheet } from "../sheet";
import { initWakeLock } from "../wakeLock";
import { initSettings, openSettings } from "../settingsPanel";
import { isNativeApp, isRemote } from "../platform";
import { initOffline } from "../offline";
import { KINDS } from "@core/marks";
import { symbolSvg } from "@core/symbols";
import { markLocked, mayUseSolution } from "../squad";
import { initSquadPanel, render as renderSquadPane } from "../squadPanel";
import { initUpdater, mountUpdateBox } from "../updatePanel";
import { NOTICES_TEXT } from "../licenses";
import { slideIndicator } from "../slider";
import { initRipple, rollNumbersIn } from "../motion";
import { initExchange } from "../exchange";
import { initStoragePanel } from "../storagePanel";
import { fillFireSelects, fillShellOptions, renderFire, renderFireRolling } from "./fireSolution";
import { renderLog } from "./fireLog";
import { getSelectedId, setSelectedId, vibrate } from "./common";
import { renderAll, setRenderAll } from "./renderHub";
import { refreshEditing } from "./markerDialog";
import { renderMarksList, selectMarker } from "./marksList";
import { renderSetup } from "./setupPane";
import { KIND_KEYS, kindLabel, shellName, weaponName } from "./labels";
import { applyPlacesStyle, applyShotSettings } from "./appearance";

// ---------- about ----------
function renderAbout(): void {
  const el = document.querySelector("#aboutDlg .about");
  if (!el) return;
  el.innerHTML = t("aboutHtml");
  mountUpdateBox(el);
  const lic = document.createElement("details");
  lic.className = "about-licenses";
  const sum = document.createElement("summary");
  sum.textContent = t("aboutLicenses");
  const pre = document.createElement("pre");
  pre.textContent = NOTICES_TEXT;
  lic.append(sum, pre);
  el.appendChild(lic);

}

// ---------- static hints ----------
function renderStaticHints(): void {
  $("fireHint").textContent = t("fireHint");
}

// ---------- tabs ----------
type TabName = "marks" | "fire" | "log" | "squad";

const PANES: TabName[] = ["marks", "fire", "log", "squad"];

function showTab(name: TabName): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>(".tabs button")) {
    b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false");
  }
  for (const p of PANES) $("pane-" + p).hidden = p !== name;
  if (name === "fire") {
    fillFireSelects();
    fillShellOptions();
    $("selShell").removeAttribute("data-w");
    renderFireRolling();
  }
  if (name === "log") {
    renderLog();
    rollNumbersIn($("logList"), ".lv b");
  }
  if (name === "marks") rollNumbersIn($("list"), ".gref, .c");
  if (name === "squad") renderSquadPane();
}

/** Солдат у відділенні не бачить розрахунку й журналу. */
function applySquadGating(): void {
  const solution = mayUseSolution();
  for (const b of document.querySelectorAll<HTMLButtonElement>(".tabs button")) {
    if (b.dataset.tab === "fire" || b.dataset.tab === "log") b.hidden = !solution;
  }
  const active = document.querySelector<HTMLButtonElement>('.tabs button[aria-selected="true"]');
  if (active?.hidden) showTab("marks");
}

window.addEventListener("mortar:squad", () => {
  applySquadGating();
  const S = getCurrent();
  const sel = getSelectedId();
  if (sel && !S.markers.some((m) => m.id === sel)) {
    setSelectedId(null);
    setDrawCallbacks({ selectedId: null });
  }
  renderAll();
});

window.addEventListener("mortar:squad-terrain", () => {
  fillTerrainSelect();
  onTerrainSwitched();
});

document.querySelector(".tabs")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (b) showTab(b.dataset.tab as TabName);
});

// ---------- terrain select ----------
function fillTerrainSelect(): void {
  const sel = $<HTMLSelectElement>("terrainSel");
  sel.textContent = "";
  const g1 = document.createElement("optgroup");
  g1.label = t("groupOfficial");
  const g2 = document.createElement("optgroup");
  g2.label = t("groupMods");
  const g3 = document.createElement("optgroup");
  g3.label = t("groupCustom");
  for (const p of PRESETS) (p.official ? g1 : g2).appendChild(new Option(p.name, p.id));
  for (const c of getRoot().customTerrains) g3.appendChild(new Option(c.name, c.id));
  sel.append(g1, g2);
  if (g3.children.length) sel.appendChild(g3);
  // Налаштування карти (розмір, калібрування, зображення) — лише на ПК, тож і додавати власний терен звідси нема сенсу.
  if (!isRemote) sel.add(new Option(t("addOtherTerrain"), "__add"));
  sel.value = getRoot().cur;
}

$<HTMLSelectElement>("terrainSel").onchange = async (e) => {
  const sel = e.target as HTMLSelectElement;
  const v = sel.value;
  if (v === "__add") {
    sel.value = getRoot().cur;
    const r = await ask(
      t("otherTerrainTitle"),
      t("otherTerrainText"),
      t("addBtn"),
      [
        { key: "name", label: t("fieldTerrainName") },
        { key: "size", label: t("fieldTerrainSize"), type: "number", value: "10240" }
      ]
    );
    const name = r ? String(r.name || "").trim().slice(0, 40) : "";
    if (!name) return;
    const size = parseFloat(r!.size);
    const ok = size >= 100 && size <= MAX_SIZE;
    const id = addCustomTerrain(name, ok ? size : 12800, ok ? size : 12800);
    switchTerrain(id);
    fillTerrainSelect();
    onTerrainSwitched();
    if (!isRemote) openSettings("data");
    toast(t("terrainAdded", { name }));
    return;
  }
  switchTerrain(v);
  onTerrainSwitched();
};

$<HTMLButtonElement>("delTerrain")?.addEventListener("click", async () => {
  const meta = currentMeta();
  if (!getRoot().customTerrains.some((c) => c.id === meta.id)) return;
  const ok = await ask(t("delTerrainTitle"), t("delTerrainText", { name: meta.name }), t("deleteBtn"));
  if (!ok) return;
  removeCustomTerrain(meta.id);
  fillTerrainSelect();
  onTerrainSwitched();
});

function onTerrainSwitched(): void {
  setSelectedId(null);
  setDrawCallbacks({ selectedId: null });
  resetView();
  renderAll();
  void ensureHeights(renderAll);
  void ensureMapImage(renderAll);
}

function mapKey(): string {
  return getRoot().cur + ":" + JSON.stringify(getCurrent().map ?? null);
}

/** Інша вкладка змінила стан — перечитуємо його й перемальовуємо UI. */
export async function reloadFromStore(): Promise<void> {
  const before = mapKey();
  const result = applyExternalState(await window.api.store.load());
  if (result === "skipped") return;
  fillTerrainSelect();
  if (result === "terrain-changed") {
    onTerrainSwitched();
    return;
  }
  const S = getCurrent();
  const sel = getSelectedId();
  if (sel && !S.markers.some((m) => m.id === sel)) {
    setSelectedId(null);
    setDrawCallbacks({ selectedId: null });
  }
  refreshEditing(S.markers);
  if (mapKey() !== before) resetView();
  else syncImageSize();
  renderAll();
  announceExternal(takeExternalSummary());
}

function listNames(names: string[]): string {
  const shown = names.slice(0, 2).map((n) => `«${n}»`).join(", ");
  return names.length > 2 ? shown + t("extMore", { n: names.length - 2 }) : shown;
}

/** Показує, що змінилось в іншій вкладці, без перезавантаження. */
function announceExternal(sum: ReturnType<typeof takeExternalSummary>): void {
  if (!sum) return;
  const parts: string[] = [];
  if (sum.added.length) parts.push(t("extAdded", { list: listNames(sum.added) }));
  if (sum.changed.length) parts.push(t("extChanged", { list: listNames(sum.changed) }));
  if (sum.removed.length) parts.push(t("extRemoved", { list: listNames(sum.removed) }));
  if (sum.logAdded) parts.push(t("extLog", { n: sum.logAdded }));
  if (!parts.length) return;
  toast(`${t("extOtherTab")}: ${parts.join("; ")}`, 4500);
  vibrate(40);
}

function renderEverything(): void {
  renderMarksList();
  if (!$("pane-fire").hidden) {
    fillFireSelects();
    renderFire();
  }
  if (!$("pane-log").hidden) renderLog();
  if ($<HTMLDialogElement>("settingsDlg").open) renderSetup();
  requestDraw();
}

function onLanguageChanged(): void {
  fillTerrainSelect();
  renderStaticHints();
  if ($<HTMLDialogElement>("aboutDlg").open) renderAbout();
  renderAll();
}

/** Довідка «?» на вкладці міток: що означають знаки (рамка й п'ять видів). */
const CAPTION_KEYS = { infantry: "capInfantry", armour: "capArmour", mortar: "capMortar", helicopter: "capHelicopter", retreat: "capRetreat" } as const;

function initLegend(): void {
  const dlg = $<HTMLDialogElement>("legendDlg");
  $<HTMLButtonElement>("legendBtn").onclick = () => {
    const ul = $("legendList");
    ul.textContent = "";
    for (const k of KINDS) {
      const li = document.createElement("li");
      const pair = document.createElement("span");
      pair.className = "pair";
      // знаки — статичний SVG власної розмітки
      pair.innerHTML = symbolSvg("friend", k) + symbolSvg("hostile", k);
      const text = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = t(KIND_KEYS[k]);
      const cap = document.createElement("div");
      cap.textContent = t(CAPTION_KEYS[k]);
      text.append(title, cap);
      li.append(pair, text);
      ul.appendChild(li);
    }
    dlg.showModal();
  };
  $<HTMLButtonElement>("legendClose").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
}

function initAboutDialog(): void {
  const dlg = $<HTMLDialogElement>("aboutDlg");
  $<HTMLButtonElement>("aboutBtn").onclick = () => {
    renderAbout();
    dlg.showModal();
    // фокус на нижніх елементах прокручує діалог униз: повертаємо початок тексту
    dlg.scrollTop = 0;
    (document.activeElement as HTMLElement | null)?.blur?.();
  };
  $<HTMLButtonElement>("aboutClose").onclick = () => dlg.close();
  // Клік по затемненню поза вікном теж закриває.
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
}

/** Розгорнуті/згорнуті картки вкладки «Карта» запам'ятовуються на пристрої. */
function initCards(): void {
  const KEY = "mortar.cards.v1";
  let saved: Record<string, boolean> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    saved = {};
  }
  document.querySelectorAll<HTMLDetailsElement>("details.card[data-card]").forEach((el) => {
    const id = el.dataset.card!;
    if (id in saved) el.open = saved[id];
    el.addEventListener("toggle", () => {
      saved[id] = el.open;
      try {
        localStorage.setItem(KEY, JSON.stringify(saved));
      } catch {
        // сховище недоступне — картки просто не запам'ятаються
      }
    });
  });
}

export function initPanels(): void {
  initCards();
  setShowPlaces(getRoot().showPlaces);
  applyPlacesStyle();
  applyShotSettings();
  initOffline();
  initUpdater();
  if (!isRemote) initStoragePanel({ onMapChanged: () => { resetView(); renderAll(); } });
  initExchange({
    renderAll,
    switchTerrain: (id) => {
      switchTerrain(id);
      fillTerrainSelect();
      onTerrainSwitched();
    }
  });
  fillTerrainSelect();
  renderStaticHints();
  setTapHandlers({
    onMarkerTap: (id) => selectMarker(id, true),
    canDragMarker: (id) => {
      const m = getCurrent().markers.find((x) => x.id === id);
      return !!m && !markLocked(m);
    },
    onMarkerMoved: (id) => {
      const m = getCurrent().markers.find((x) => x.id === id);
      if (!m) return;
      m.u = Date.now();
      scheduleSave();
      renderAll();
      toast(t("markMoved", { n: m.name || kindLabel(m) }));
    }
  });
  startMapImportUi(() => onTerrainSwitched());
  onLangChange(onLanguageChanged);
  onHeightsLoaded(() => renderAll());
  initSheet();
  initImmersive();
  initAboutDialog();
  // сайт у браузері: кнопка в шапці на сторінку завантаження застосунків (у застосунку на ПК й в APK її нема)
  $<HTMLAnchorElement>("downloadBtn").hidden = !(isRemote && !isNativeApp);
  initLegend();
  initSquadPanel({
    showTab: () => showTab("squad"),
    afterTerrainSwitch: () => {
      fillTerrainSelect();
      onTerrainSwitched();
    }
  });
  applySquadGating();
  initWakeLock();
  slideIndicator(document.querySelector<HTMLElement>(".tabs"), { active: 'button[aria-selected="true"]' });
  for (const seg of document.querySelectorAll<HTMLElement>(".seg")) slideIndicator(seg, { active: 'button[aria-pressed="true"]' });
  initRipple();
  // iOS: щипок по інтерфейсу (не по карті) не має масштабувати сторінку
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  initSettings({
    applyAll: () => {
      applyShotSettings();
      applyPlacesStyle();
      fillShellOptions();
      $("selShell").removeAttribute("data-w");
      renderAll();
    },
    shellLabel: shellName,
    weaponLabel: weaponName,
    renderSetup
  });
  window.api.store.onChanged(() => void reloadFromStore());
  renderAll();
}

setRenderAll(renderEverything);
