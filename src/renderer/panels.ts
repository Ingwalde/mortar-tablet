import { clampPlacesScale, normalizePlacesLevel } from "@core/places";
import { fmtM, gridRef, parseGrid, parseGridCorner } from "@core/geometry";
import { PRESETS } from "@core/terrains";
import { parseExchange } from "@core/markerExchange";
import { TABLES, bearing, shellRange, solve, type WeaponId } from "@core/ballistics";
import { gameRangeSpread, spreadRadii } from "@core/spread";
import { allowedShells, pickShell } from "@core/settings";
import { nearestPlace } from "@core/places";
import {
  addCustomTerrain,
  addFireLogEntry,
  ALL_FOLDERS,
  applyExternalState,
  takeExternalSummary,
  currentMeta,
  getCurrent,
  getFolderNames,
  getRoot,
  getVisibleMarkers,
  markDeleted,
  markersInFolder,
  removeCustomTerrain,
  scheduleSave,
  switchTerrain,
  uid,
  type Marker,
  type MarkerType,
  type ThemeName,
  VALID_SHELLS
} from "./state";
import {
  aimBuilding,
  flyToWorld,
  centerPx,
  centerWorld,
  requestDraw,
  resetView,
  setDrawCallbacks,
  launchShot,
  setRingsVisible,
  setLightMode,
  isLightMode,
  setShowPlaces,
  setPlacesStyle,
  setTapHandlers,
  syncImageSize
} from "./mapView";
import { $, ask, showModalNoKeyboard, toast } from "./dom";
import { ensureHeights, ensureMapImage, getAutoHeight, startMapImportUi } from "./mapImport";
import { heightAt, onHeightsLoaded } from "./terrainHeight";
import { onLangChange, t } from "./i18n";
import { initImmersive, initSheet } from "./sheet";
import { initWakeLock, setKeepAwake } from "./wakeLock";
import { closeSettings, initSettings, openSettings } from "./settingsPanel";
import { isNativeApp, isRemote } from "./platform";
import { initOffline } from "./offline";
import { CAPTION_MAX, KINDS, isMortarMark, isTargetable, readClass, typeOf, type Affiliation, type MarkKind } from "@core/marks";
import { symbolSvg } from "@core/symbols";
import { dangerRadius, friendlyWarnings, type DangerRadius, type FriendlyWarning } from "@core/shellEffects";
import { ageOf } from "@core/age";
import { markAuthor, markLocked, markRights, mayUseSolution, memberName, shareLog, squadScope } from "./squad";
import { initSquadPanel, render as renderSquadPane } from "./squadPanel";
import { initUpdater, mountUpdateBox } from "./updatePanel";
import { NOTICES_TEXT } from "./licenses";
import { ruinedBuildingIcon } from "./icons";
import { vibrate as haptic } from "./haptics";
import { slideIndicator } from "./slider";
import { beginListRender, initRipple, reducedMotion, rollElement, rollNumbersIn, tweenNumber } from "./motion";
import { initExchange } from "./exchange";
import { initStoragePanel } from "./storagePanel";
import { playShot, playTestSound, setShotMuted, setShotVolume } from "./shotAudio";

function typeLabel(type: MarkerType): string {
  return { mortar: t("typeMortar"), target: t("typeTarget"), point: t("typePoint") }[type];
}
const KIND_KEYS = { infantry: "kindInfantry", armour: "kindArmour", mortar: "kindMortar", helicopter: "kindHelicopter", retreat: "kindRetreat" } as const;
/** Підпис виду мітки; для старої довільної точки — «Точка». */
function kindLabel(m: { kind: MarkKind; type: MarkerType }): string {
  return m.kind === "legacy" ? typeLabel(m.type) : t(KIND_KEYS[m.kind]);
}
function weaponName(w: WeaponId): string {
  return { M252: t("weaponShortM252"), "2B14": t("weaponShort2B14") }[w];
}
function shellName(k: string): string {
  return ({ HE: t("shellHE"), Smoke: t("shellSmoke"), Illumination: t("shellIllumination") } as Record<string, string>)[k] ?? k;
}

let selectedId: string | null = null;

function nextName(aff: Affiliation | undefined, kind: MarkKind): string {
  const n = getCurrent().markers.filter((m) => m.aff === aff && m.kind === kind).length + 1;
  return kindLabel({ kind, type: typeOf(aff, kind) }) + " " + n;
}

// ---------- folders/missions ----------
function fillFolderSelect(): void {
  const sel = $<HTMLSelectElement>("folderSel");
  const S = getCurrent();
  sel.textContent = "";
  sel.add(new Option(t("allFolders"), ALL_FOLDERS));
  for (const f of getFolderNames()) sel.add(new Option(f || t("noFolder"), f));
  if (![...sel.options].some((o) => o.value === S.sel.folder)) S.sel.folder = ALL_FOLDERS;
  sel.value = S.sel.folder;
}
$<HTMLSelectElement>("folderSel").onchange = (e) => {
  getCurrent().sel.folder = (e.target as HTMLSelectElement).value;
  scheduleSave();
  renderAll();
};

/** Останньо використана папка — типове значення для нової мітки. */
function lastUsedFolder(): string {
  const S = getCurrent();
  return S.sel.folder === ALL_FOLDERS ? "" : S.sel.folder;
}

// ---------- marks list ----------
// тексти чисел кожної мітки з попереднього перемальовування: нові рядки докручуються від нуля, змінені — від старих значень
let markNumPrev = new Map<string, string[]>();

function animateMarkNumbers(ul: HTMLElement): void {
  const active = !$("pane-marks").hidden && !document.hidden && !reducedMotion();
  const next = new Map<string, string[]>();
  for (const li of Array.from(ul.querySelectorAll<HTMLElement>("li[data-id]"))) {
    const id = li.dataset.id as string;
    const els = Array.from(li.querySelectorAll<HTMLElement>(".gref, .c"));
    const texts = els.map((e) => e.textContent ?? "");
    next.set(id, texts);
    if (!active) continue;
    const prev = markNumPrev.get(id);
    els.forEach((el, k) => {
      if (!prev) {
        if (li.classList.contains("anim-in")) rollElement(el);
      } else if (prev.length === texts.length && prev[k] !== texts[k]) rollElement(el, prev[k]);
    });
  }
  markNumPrev = next;
}

export function renderMarksList(): void {
  const ul = $("list");
  const done = beginListRender(ul);
  renderMarksListInner();
  done();
  animateMarkNumbers(ul);
}

function renderMarksListInner(): void {
  fillFolderSelect();
  const ul = $("list");
  ul.textContent = "";
  const S = getCurrent();
  const visible = getVisibleMarkers();
  if (!visible.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = S.markers.length ? t("emptyListFiltered") : t("emptyListNone");
    ul.appendChild(li);
    return;
  }
  for (const m of visible) {
    const li = document.createElement("li");
    li.dataset.id = m.id;
    if (m.id === selectedId) li.className = "sel";
    if (m.destroyed) li.classList.add("destroyed");
    const badge = document.createElement("div");
    badge.className = "badge sym";
    // знак — статичний SVG власної розмітки (без введеного користувачем тексту)
    badge.innerHTML = symbolSvg(m.aff, m.kind);
    const info = document.createElement("div");
    info.className = "info";
    info.tabIndex = 0;
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = m.name || kindLabel(m);
    const sub = document.createElement("div");
    sub.className = "sub";
    const part = (cls: string, text: string): HTMLSpanElement => {
      const el = document.createElement("span");
      el.className = cls;
      el.textContent = text;
      return el;
    };
    const tags = document.createElement("div");
    tags.className = "tags";
    if (S.sel.folder === ALL_FOLDERS) tags.appendChild(part("tag", m.folder || t("noFolder")));
    if (m.type === "mortar") tags.appendChild(part("tag", weaponName(m.w)));
    const coords = document.createElement("div");
    coords.className = "coords-line";
    coords.append(part("gref", gridRef(m.x, m.z)), part("c", "X " + fmtM(m.x)), part("c", "Z " + fmtM(m.z)));
    if (m.h !== null && isFinite(m.h)) coords.appendChild(part("c", "h " + fmtM(m.h)));
    sub.append(...(tags.childElementCount ? [tags] : []), coords);
    const parts: HTMLElement[] = [name];
    if (m.caption) {
      const cap = document.createElement("div");
      cap.className = "cap";
      cap.textContent = m.caption;
      parts.push(cap);
    }
    const author = m.sq ? markAuthor(m.id) : null;
    if (author && author.name) {
      const by = document.createElement("div");
      by.className = "by";
      by.textContent = t("squadAuthor", { who: author.name, age: ageText(author.at) });
      parts.push(by);
    }
    info.append(...parts, sub);
    info.onclick = () => selectMarker(m.id, true);
    info.onkeydown = (e) => {
      if (e.key === "Enter") selectMarker(m.id, true);
    };
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn small";
    copyBtn.textContent = t("copyBtn");
    copyBtn.onclick = () => copyText(gridRef(m.x, m.z) + " (X " + Math.round(m.x) + ", Z " + Math.round(m.z) + ")");
    const editBtn = document.createElement("button");
    editBtn.className = "btn small";
    editBtn.textContent = t("editBtn");
    editBtn.onclick = () => openMarkerDialog(m);
    li.append(badge, info);
    const acts = document.createElement("div");
    acts.className = "acts";
    if (m.type !== "mortar") {
      // швидка позначка «зруйновано» (і повернення назад) без відкриття діалогу
      const dBtn = document.createElement("button");
      dBtn.className = "btn small icon-only destroy-btn";
      dBtn.appendChild(ruinedBuildingIcon());
      dBtn.title = m.destroyed ? t("restoreBtn") : t("destroyBtn");
      dBtn.setAttribute("aria-label", dBtn.title);
      dBtn.setAttribute("aria-pressed", String(!!m.destroyed));
      dBtn.onclick = () => toggleDestroyed(m.id);
      acts.append(dBtn);
    }
    acts.append(copyBtn, editBtn);
    li.append(acts);
    ul.appendChild(li);
  }
}

/** Позначає ціль/точку зруйнованою або повертає назад; синхронізується як звичайна правка мітки. */
function toggleDestroyed(id: string): void {
  const m = getCurrent().markers.find((x) => x.id === id);
  if (!m || m.type === "mortar") return;
  if (m.destroyed) delete m.destroyed;
  else m.destroyed = true;
  m.u = Date.now();
  scheduleSave();
  renderAll();
  toast(t(m.destroyed ? "markDestroyed" : "markRestored", { n: m.name || kindLabel(m) }));
}

export function selectMarker(id: string, center: boolean): void {
  selectedId = id;
  setDrawCallbacks({ selectedId });
  const m = getCurrent().markers.find((x) => x.id === id);
  if (m && center) flyToWorld(m.x, m.z);
  renderMarksList();
  requestDraw();
  document.querySelector(`#list li[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(t("copied"));
  } catch {
    if (isRemote) {
      // На телефоні поля резервної копії нема — показуємо текст у діалозі.
      await ask(t("copyManualTitle"), "", t("closeBtn"), [{ key: "v", label: t("copyManualLabel"), value: text }]);
      return;
    }
    const box = $<HTMLTextAreaElement>("json");
    box.value = text;
    openSettings("backup");
    box.select();
    toast(t("copyFromField"));
  }
}

/** Вібрація, якщо вона ввімкнена в налаштуваннях і підтримується пристроєм. */
function vibrate(ms: number): void {
  if (getRoot().vibration) haptic(ms);
}

// ---------- marker dialog ----------
const dlg = $<HTMLDialogElement>("dlg");
let editing: Marker | null = null;
let dlgAff: Affiliation | undefined = "hostile";
let dlgKind: MarkKind = "infantry";
let dlgWeapon: WeaponId = "M252";

/** Тип для розрахунку, що відповідає вибраним приналежності й виду. */
function dlgType(): MarkerType {
  return typeOf(dlgAff, dlgKind);
}

function setDlgClass(aff: Affiliation | undefined, kind: MarkKind): void {
  dlgAff = aff;
  dlgKind = kind;
  for (const b of $("fAff").querySelectorAll<HTMLButtonElement>("button")) {
    b.setAttribute("aria-pressed", b.dataset.a === aff ? "true" : "false");
  }
  for (const b of $("fKind").querySelectorAll<HTMLButtonElement>("button")) {
    b.setAttribute("aria-pressed", b.dataset.k === kind ? "true" : "false");
  }
  const type = dlgType();
  // зброя потрібна лише своєму мінометові: від його позиції йде розрахунок
  $("fWeapon").hidden = type !== "mortar";
  // «зруйновано» не буває лише у свого міномета
  const row = document.getElementById("fDestroyedRow");
  if (row) row.hidden = type === "mortar";
}
function setDlgWeapon(w: WeaponId): void {
  dlgWeapon = w;
  for (const b of $("fWeapon").querySelectorAll<HTMLButtonElement>("button")) {
    b.setAttribute("aria-pressed", b.dataset.w === w ? "true" : "false");
  }
}
$("fWeapon").onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (b) setDlgWeapon(b.dataset.w as WeaponId);
};
function onClassChanged(aff: Affiliation | undefined, kind: MarkKind): void {
  const before = { aff: dlgAff, kind: dlgKind };
  setDlgClass(aff, kind);
  const nameInput = $<HTMLInputElement>("fName");
  // автоназва («Піхота 3») оновлюється разом із видом, власна назва лишається
  const labels = [...KINDS.map((k) => t(KIND_KEYS[k])), typeLabel("point")].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const autoNameRe = new RegExp(`^(${labels.join("|")}) \\d+$`);
  if (!editing && autoNameRe.test(nameInput.value) && (before.aff !== aff || before.kind !== kind)) nameInput.value = nextName(aff, kind);
}
$("fAff").onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!b) return;
  onClassChanged(b.dataset.a as Affiliation, dlgKind === "legacy" ? "infantry" : dlgKind);
};
$("fKind").onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!b) return;
  onClassChanged(dlgAff ?? "hostile", b.dataset.k as MarkKind);
};

interface DialogPreset {
  /** Назва, запропонована для нової мітки (наприклад, за селищем поруч). */
  name?: string;
  aff?: Affiliation;
  kind: MarkKind;
  x: number;
  z: number;
  h: number | null;
  fromMap?: boolean;
}

function fillFolderDatalist(): void {
  const dl = $("folderList");
  dl.textContent = "";
  for (const f of getFolderNames()) {
    if (!f) continue;
    const opt = document.createElement("option");
    opt.value = f;
    dl.appendChild(opt);
  }
}

/** Права за роллю у відділенні: недоступне вимикаємо (сервер усе одно перевіряє). */
function applyDialogRights(marker?: Marker): void {
  const r = markRights(marker);
  for (const id of ["fAff", "fKind"]) for (const b of $(id).querySelectorAll<HTMLButtonElement>("button")) b.disabled = !r.edit;
  $<HTMLInputElement>("fName").disabled = !r.edit;
  $<HTMLInputElement>("fCaption").disabled = !r.caption;
  if (marker) $<HTMLButtonElement>("fDel").hidden = !r.remove;
}

export function openMarkerDialog(marker?: Marker, preset?: DialogPreset): void {
  editing = marker ?? null;
  const d: DialogPreset = marker ?? preset!;
  setDlgClass(marker ? marker.aff : d.aff, marker ? marker.kind : d.kind);
  const lastMortar = [...getCurrent().markers].reverse().find((x) => x.type === "mortar");
  setDlgWeapon(marker?.w ?? lastMortar?.w ?? "M252");
  $("dlgTitle").textContent = marker ? t("dlgTitleEdit") : t("dlgTitleNew");
  $<HTMLInputElement>("fName").value = marker ? marker.name : (preset?.name ?? nextName(dlgAff, dlgKind));
  $<HTMLInputElement>("fX").value = isFinite(d.x) ? String(Math.round(d.x)) : "";
  $<HTMLInputElement>("fZ").value = isFinite(d.z) ? String(Math.round(d.z)) : "";
  $<HTMLInputElement>("fH").value = d.h !== null && isFinite(d.h) ? String(d.h) : "";
  $<HTMLInputElement>("fH").placeholder = t("heightOptional");
  $<HTMLInputElement>("fGrid").value = isFinite(d.x) && isFinite(d.z) && (marker || preset?.fromMap) ? gridRef(d.x, d.z) : "";
  fillFolderDatalist();
  $<HTMLInputElement>("fFolder").value = marker ? marker.folder : lastUsedFolder();
  $<HTMLButtonElement>("fDel").hidden = !marker;
  $<HTMLInputElement>("fDestroyed").checked = !!marker?.destroyed;
  $("fDestroyedRow").hidden = dlgType() === "mortar";
  $<HTMLInputElement>("fCaption").value = marker?.caption ?? "";
  $<HTMLInputElement>("fCaption").maxLength = CAPTION_MAX;
  applyDialogRights(marker);
  showModalNoKeyboard(dlg);

  if (!marker && d.h === null && isFinite(d.x) && isFinite(d.z)) {
    const requestX = d.x;
    const requestZ = d.z;
    const meta = currentMeta();
    const hInput = $<HTMLInputElement>("fH");
    hInput.placeholder = t("heightDetermining");
    void getAutoHeight(meta.id, requestX, requestZ, meta.sizeX, meta.sizeZ).then((h) => {
      if (dlg.open && !editing && hInput.value === "") {
        if (h !== null) hInput.value = String(h);
        else hInput.placeholder = t("heightUnknown");
      }
    });
  }
}

$("fGrid").addEventListener("input", () => {
  const g = parseGrid($<HTMLInputElement>("fGrid").value);
  if (g) {
    $<HTMLInputElement>("fX").value = String(Math.round(g.x));
    $<HTMLInputElement>("fZ").value = String(Math.round(g.z));
  }
});
$<HTMLButtonElement>("fCancel").onclick = () => dlg.close();
$<HTMLButtonElement>("fDel").onclick = () => {
  if (editing) {
    const S = getCurrent();
    S.markers = S.markers.filter((x) => x.id !== editing!.id);
    markDeleted(editing.id);
    if (selectedId === editing.id) selectedId = null;
    scheduleSave();
    renderAll();
    toast(t("markDeleted"));
  }
  dlg.close();
};
$<HTMLFormElement>("dlgForm").addEventListener("submit", (e) => {
  const x = parseFloat($<HTMLInputElement>("fX").value);
  const z = parseFloat($<HTMLInputElement>("fZ").value);
  if (!isFinite(x) || !isFinite(z)) {
    e.preventDefault();
    toast(t("fillXZorGrid"));
    return;
  }
  const rights = markRights(editing ?? undefined);
  if (dlgAff === "friend" && dlgKind === "mortar" && !rights.friendMortar) {
    e.preventDefault();
    toast(t("squadDenied"));
    return;
  }
  const hv = $<HTMLInputElement>("fH").value.trim();
  const h = hv === "" ? null : parseFloat(hv);
  const type = dlgType();
  const destroyedNow = type !== "mortar" && $<HTMLInputElement>("fDestroyed").checked;
  const caption = $<HTMLInputElement>("fCaption").value.replace(/\s+/g, " ").trim().slice(0, CAPTION_MAX);
  const data = {
    name: $<HTMLInputElement>("fName").value.trim().slice(0, 40) || nextName(dlgAff, dlgKind),
    type,
    ...(dlgAff ? { aff: dlgAff } : {}),
    kind: dlgKind,
    x,
    z,
    h: h !== null && isFinite(h) ? h : null,
    w: dlgWeapon,
    folder: $<HTMLInputElement>("fFolder").value.trim().slice(0, 40)
  };
  const S = getCurrent();
  if (editing) {
    Object.assign(editing, data, { u: Date.now() });
    if (!dlgAff) delete editing.aff;
    if (caption) editing.caption = caption;
    else delete editing.caption;
    if (destroyedNow) editing.destroyed = true;
    else delete editing.destroyed;
  } else {
    const now = Date.now();
    const scope = dlgAff && dlgKind !== "legacy" ? squadScope(currentMeta().id) : undefined;
    const m: Marker = { id: uid(), ...data, u: now, c: now, ...(caption ? { caption } : {}), ...(destroyedNow ? { destroyed: true } : {}), ...(scope ? { sq: scope } : {}) };
    S.markers.push(m);
    selectedId = m.id;
    if (m.type === "mortar") {
      S.sel.m = m.id;
      // Нова мітка має лишитись доступною в розрахунку, навіть якщо вибрана інша папка.
      if (S.sel.mortarFolder !== ALL_FOLDERS && S.sel.mortarFolder !== m.folder) S.sel.mortarFolder = ALL_FOLDERS;
    }
    if (m.type === "target") {
      S.sel.t = m.id;
      if (S.sel.targetFolder !== ALL_FOLDERS && S.sel.targetFolder !== m.folder) S.sel.targetFolder = ALL_FOLDERS;
    }
  }
  scheduleSave();
  renderAll();
  toast(editing ? t("markSaved") : t("markAdded"));
});

$<HTMLButtonElement>("placeBtn").onclick = () => {
  if (calibPick) {
    fixCalibAtCenter(calibPick);
    return;
  }
  const w = centerWorld();
  const hasMortar = getCurrent().markers.some((m) => m.type === "mortar");
  const aff: Affiliation = hasMortar ? "hostile" : "friend";
  const kind: MarkKind = hasMortar ? "infantry" : "mortar";
  const type: MarkerType = typeOf(aff, kind);
  // приціл на будівлі: мітка стає точно в її центр, а ціль отримує назву за найближчим селищем
  const aim = aimBuilding();
  const x = aim ? aim.cx : w.x;
  const z = aim ? aim.cz : w.z;
  let name: string | undefined;
  if (aim && type !== "mortar") {
    const place = nearestPlace(currentMeta().preset?.places, x, z, 500);
    if (place) name = `${place.name}: ${nextName(aff, kind)}`.slice(0, 40);
  }
  openMarkerDialog(undefined, { aff, kind, x, z, h: null, fromMap: true, name });
};
$<HTMLButtonElement>("addManual").onclick = () => {
  const hasMortar = getCurrent().markers.some((m) => m.type === "mortar");
  openMarkerDialog(undefined, { aff: hasMortar ? "hostile" : "friend", kind: hasMortar ? "infantry" : "mortar", x: NaN, z: NaN, h: null });
  $<HTMLInputElement>("fX").value = "";
  $<HTMLInputElement>("fZ").value = "";
  setTimeout(() => $<HTMLInputElement>("fGrid").focus(), 50);
};

// ---------- fire solution ----------
interface FirePairPoint {
  x: number;
  z: number;
  h: number | null;
  name: string;
}
function firePair(): { m: Marker; t: FirePairPoint } | null {
  const S = getCurrent();
  const mortars = markersInFolder(S.sel.mortarFolder).filter((x) => x.type === "mortar");
  const m = mortars.find((x) => x.id === S.sel.m) ?? mortars[0];
  if (!m) return null;
  let target: FirePairPoint | null = null;
  if (S.sel.t === "__center") {
    const w = centerWorld();
    target = { x: w.x, z: w.z, h: null, name: t("centerName") };
  } else {
    const found = markersInFolder(S.sel.targetFolder).find((x) => x.id === S.sel.t && isTargetable(x));
    if (found) target = found;
  }
  if (!target) return null;
  return { m, t: target };
}
setDrawCallbacks({ firePair });

/** Еліпс розкиду для вибраної пари міномет → ціль; null, якщо вимкнено або значення не задано. */
function spreadSpec(): { x: number; z: number; ux: number; uz: number; a: number; b: number } | null {
  const r = getRoot();
  if (!r.spread.on) return null;
  const pair = firePair();
  if (!pair) return null;
  const dx = pair.t.x - pair.m.x;
  const dz = pair.t.z - pair.m.z;
  const dist = Math.hypot(dx, dz);
  const radii = currentSpreadRadii(pair.m.w, dist);
  if (!radii) return null;
  return { x: pair.t.x, z: pair.t.z, ux: dx / dist, uz: dz / dist, a: radii.a, b: radii.b };
}

/** Заряд, за яким рахуємо розкид: вибраний, інакше найкращий для цієї дальності. */
function spreadCharge(w: WeaponId, dist: number): number | null {
  const S = getCurrent();
  const sols = solve(w, S.sel.shell, Math.round(dist), null);
  if (!sols.length) return null;
  return sols.some((o) => o.charge === S.sel.charge) ? (S.sel.charge as number) : sols[0].charge;
}

/** Радіуси розкиду для гармати й дальності: за даними гри (за зарядом) або з ручних відсотків. */
function currentSpreadRadii(w: WeaponId, dist: number): { a: number; b: number; charge: number | null } | null {
  const r = getRoot();
  if (r.spread.auto) {
    // дані гри стосуються лише осколково-фугасних мін (швидкості інших снарядів інші)
    if (getCurrent().sel.shell !== "HE") return null;
    const charge = spreadCharge(w, dist);
    const g = charge === null ? null : gameRangeSpread(w, charge, dist);
    return g ? { a: g.a, b: g.b, charge } : null;
  }
  const m = spreadRadii(dist, r.spread[w]);
  return m ? { ...m, charge: null } : null;
}
setDrawCallbacks({ spread: spreadSpec });

/** Підсумок розкиду у вкладці розрахунку; вмикання й значення — в налаштуваннях. */
function buildSpreadBox(w: WeaponId, dist: number): HTMLElement {
  const root = getRoot();
  const box = document.createElement("div");
  box.className = "spread-box";
  const note = document.createElement("p");
  note.className = "hint";
  note.style.margin = "14px 0 6px";
  const radii = root.spread.on ? currentSpreadRadii(w, dist) : null;
  if (!root.spread.on) note.textContent = t("spreadOffNote");
  else if (!radii) note.textContent = root.spread.auto ? t("spreadNoData") : t("spreadEmpty");
  else if (root.spread.auto) note.textContent = t("spreadAutoNow", { a: Math.round(radii.a), c: radii.charge ?? "?" });
  else note.textContent = t("spreadNow", { a: Math.round(radii.a), b: Math.round(radii.b) });
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn small";
  btn.textContent = t("spreadSettingsBtn");
  btn.onclick = () => openSettings("calc");
  box.append(note, btn);
  return box;
}

/** Кільця дальності: вибраний міномет (або перший у папці), снаряд і заряди з таблиць. */
function ringSpec(): { x: number; z: number; rings: { level: number; min: number; max: number; active: boolean }[] } | null {
  const S = getCurrent();
  const mortars = markersInFolder(S.sel.mortarFolder).filter((x) => x.type === "mortar");
  const m = mortars.find((x) => x.id === S.sel.m) ?? mortars[0];
  if (!m) return null;
  const weapon = TABLES[m.w];
  const shell = weapon?.shells[S.sel.shell] ?? weapon?.shells["HE"];
  if (!shell) return null;
  const activeLevel = shell.charges.some((c) => c.level === S.sel.charge) ? S.sel.charge : shell.charges[0].level;
  return {
    x: m.x,
    z: m.z,
    rings: shell.charges.map((c) => ({ level: c.level, min: c.minRange, max: c.maxRange, active: c.level === activeLevel }))
  };
}
setDrawCallbacks({ rings: ringSpec });

/** Папки, у яких є хоча б одна мітка потрібного виду, плюс "усі папки". */
function fillFolderOptions(sel: HTMLSelectElement, current: string, wantMortar: boolean): string {
  sel.textContent = "";
  sel.add(new Option(t("allFolders"), ALL_FOLDERS));
  const names = new Set(
    getCurrent()
      .markers.filter((m) => (wantMortar ? isMortarMark(m) : isTargetable(m)))
      .map((m) => m.folder)
  );
  for (const f of [...names].sort((a, b) => a.localeCompare(b, "uk"))) sel.add(new Option(f || t("noFolder"), f));
  const value = [...sel.options].some((o) => o.value === current) ? current : ALL_FOLDERS;
  sel.value = value;
  return value;
}

function fillFireSelects(): void {
  const S = getCurrent();
  S.sel.mortarFolder = fillFolderOptions($<HTMLSelectElement>("selMFolder"), S.sel.mortarFolder, true);
  S.sel.targetFolder = fillFolderOptions($<HTMLSelectElement>("selTFolder"), S.sel.targetFolder, false);
  const selM = $<HTMLSelectElement>("selM");
  const selT = $<HTMLSelectElement>("selT");
  selM.textContent = "";
  selT.textContent = "";
  const mortars = markersInFolder(S.sel.mortarFolder).filter((x) => x.type === "mortar");
  if (!mortars.length) {
    selM.add(new Option(t("noMortars"), ""));
    selM.disabled = true;
  } else {
    selM.disabled = false;
    for (const m of mortars) selM.add(new Option(m.name, m.id));
  }
  if (mortars.length && !mortars.some((m) => m.id === S.sel.m)) S.sel.m = mortars[0].id;
  selM.value = S.sel.m ?? "";
  selT.add(new Option(t("centerOption"), "__center"));
  for (const m of markersInFolder(S.sel.targetFolder).filter((x) => isTargetable(x))) {
    selT.add(new Option(m.destroyed ? "✕ " + m.name : m.name, m.id));
  }
  if (![...selT.options].some((o) => o.value === S.sel.t)) S.sel.t = "__center";
  selT.value = S.sel.t;
}
function onFireFolderChanged(): void {
  scheduleSave();
  fillFireSelects();
  fillShellOptions();
  renderFire();
  requestDraw();
}
$<HTMLSelectElement>("selMFolder").onchange = (e) => {
  getCurrent().sel.mortarFolder = (e.target as HTMLSelectElement).value;
  onFireFolderChanged();
};
$<HTMLSelectElement>("selTFolder").onchange = (e) => {
  getCurrent().sel.targetFolder = (e.target as HTMLSelectElement).value;
  onFireFolderChanged();
};
$<HTMLSelectElement>("selM").onchange = (e) => {
  const S = getCurrent();
  S.sel.m = (e.target as HTMLSelectElement).value;
  // при виборі міномета підставляється типовий снаряд із налаштувань
  const w = firePair()?.m.w;
  if (w) S.sel.shell = pickShell(getRoot().shells, w, VALID_SHELLS);
  scheduleSave();
  fillShellOptions();
  renderFire();
  requestDraw();
};
$<HTMLSelectElement>("selT").onchange = (e) => {
  const S = getCurrent();
  S.sel.t = (e.target as HTMLSelectElement).value;
  scheduleSave();
  const t = S.markers.find((m) => m.id === S.sel.t);
  if (t) flyToWorld(t.x, t.z);
  renderFire();
  requestDraw();
};

function fillShellOptions(): void {
  const p = firePair();
  const w: WeaponId = p ? p.m.w : "M252";
  const sel = $<HTMLSelectElement>("selShell");
  sel.textContent = "";
  const S = getCurrent();
  S.sel.shell = pickShell(getRoot().shells, w, VALID_SHELLS, S.sel.shell);
  for (const k of allowedShells(getRoot().shells, w, VALID_SHELLS)) sel.add(new Option(shellName(k), k));
  sel.value = S.sel.shell;
}
$<HTMLSelectElement>("selShell").onchange = (e) => {
  getCurrent().sel.shell = (e.target as HTMLSelectElement).value;
  scheduleSave();
  renderFire();
};
$<HTMLSelectElement>("selCharge").onchange = (e) => {
  getCurrent().sel.charge = Number((e.target as HTMLSelectElement).value);
  scheduleSave();
  renderTable(lastDist);
};

let lastDist: number | null = null;
/** Попередні значення чисел розрахунку: від них стартує плавна зміна. */
const numPrev: { az?: number; el?: number; range?: number } = {};
// при відкритті вкладки «Розрахунки» числа докручуються від нуля, а не з'являються одразу
let rollFromZero = false;

export function renderFire(): void {
  const box = $("sol");
  const p = firePair();
  if (!p) {
    box.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = t("fireEmpty");
    box.appendChild(empty);
    $("tblBox").hidden = true;
    return;
  }
  $("tblBox").hidden = false;
  const w = p.m.w;
  const weapon = TABLES[w];
  const S = getCurrent();
  S.sel.shell = pickShell(getRoot().shells, w, VALID_SHELLS, S.sel.shell);
  const selShell = $<HTMLSelectElement>("selShell");
  if (selShell.options.length === 0 || !weapon.shells[selShell.value] || selShell.dataset.w !== w) {
    fillShellOptions();
    selShell.dataset.w = w;
  }

  const dx = p.t.x - p.m.x;
  const dz = p.t.z - p.m.z;
  const dist = Math.hypot(dx, dz);
  lastDist = dist;
  const b = bearing(dx, dz, weapon.milsPerCircle);
  // Висота: вказана на мітці, інакше — з даних рельєфу (для цілі "центр прицілу" теж).
  const terr = currentMeta();
  const heightOf = (pt: { x: number; z: number; h: number | null | undefined }) => {
    if (pt.h !== null && pt.h !== undefined && isFinite(pt.h)) return { v: pt.h, auto: false };
    const v = heightAt(terr.id, pt.x, pt.z, terr.sizeX, terr.sizeZ);
    return v === null ? null : { v, auto: true };
  };
  const hm = heightOf(p.m);
  const ht = heightOf(p.t);
  const dh = hm && ht ? ht.v - hm.v : null;
  const heightsFromTerrain = !!(hm && ht && (hm.auto || ht.auto));
  const sols = solve(w, S.sel.shell, Math.round(dist), dh);

  box.innerHTML = "";
  const hero = document.createElement("div");
  hero.className = "solution-hero";
  const meta = document.createElement("div");
  meta.className = "solution-meta";
  const cell = (into: HTMLElement, k: string, v: string, u?: string): HTMLElement => {
    const d = document.createElement("div");
    const kk = document.createElement("div");
    kk.className = "k";
    kk.textContent = k;
    const vv = document.createElement("div");
    vv.className = "v";
    vv.textContent = v;
    if (u) {
      const uu = document.createElement("span");
      uu.className = "u";
      uu.textContent = u;
      vv.appendChild(uu);
    }
    d.append(kk, vv);
    into.appendChild(d);
    return vv;
  };
  // Горизонтальна наводка — лише в градусах; підвищення лишається в мілах.
  // числа плавно «докручуються» від попередніх значень до нових
  const azV = cell(hero, t("cellAzimuthDeg"), b.deg.toFixed(1), "°");
  tweenNumber("az", azV.firstChild as Text, rollFromZero ? 0 : numPrev.az, b.deg, (n) => n.toFixed(1), { wrap360: !rollFromZero, ms: rollFromZero ? 800 : undefined });
  numPrev.az = b.deg;
  const elV = cell(
    hero,
    sols.length ? t("cellElevationMilsCharge", { c: sols[0].charge }) : t("cellElevationMils"),
    sols.length ? String(sols[0].elevation) : "—"
  );
  if (sols.length) {
    tweenNumber("el", elV.firstChild as Text, rollFromZero ? 0 : numPrev.el, sols[0].elevation, (n) => String(Math.round(n)), { ms: rollFromZero ? 800 : undefined });
    numPrev.el = sols[0].elevation;
  }
  const rgV = cell(meta, t("cellRange"), fmtM(dist), t("unitM"));
  tweenNumber("range", rgV.firstChild as Text, rollFromZero ? 0 : numPrev.range, dist, (n) => fmtM(n), { ms: rollFromZero ? 800 : undefined });
  numPrev.range = dist;
  cell(meta, t("cellHeightDiff"), dh === null ? "—" : (dh > 0 ? "+" : "") + fmtM(dh), dh === null ? undefined : t("unitM"));
  meta.style.gridTemplateColumns = "1fr 1fr";
  box.append(hero, meta);
  box.appendChild(buildSpreadBox(w, dist));
  if (heightsFromTerrain) {
    const note = document.createElement("p");
    note.className = "hint";
    note.style.margin = "8px 0 0";
    note.textContent = t("heightFromTerrain");
    box.appendChild(note);
  }

  if (!sols.length) {
    const r = shellRange(w, S.sel.shell);
    const warn = document.createElement("p");
    warn.className = "warn";
    warn.textContent = t("outOfRange", { weapon: weaponName(w), min: r.min, max: r.max });
    box.appendChild(warn);
  } else {
    // свої мітки в небезпечній зоні навколо цілі (розкид + осколки зі снарядів гри); не блокує наведення
    const danger = dangerRadius(w, S.sel.shell, sols[0].charge, dist, getRoot().spread);
    const friends = S.markers
      .filter((f) => f.aff === "friend")
      .map((f) => ({ id: f.id, name: f.name || kindLabel(f), x: f.x, z: f.z, u: f.u }));
    const warns = friendlyWarnings(p.t, friends, danger);
    if (danger && warns.length) box.appendChild(buildFriendlyWarning(warns, danger));
    const table = document.createElement("table");
    table.className = "charges";
    table.innerHTML = `<thead><tr><th>${t("colCharge")}</th><th>${t("cellElevationMils")}</th><th>${t("colTof")}</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    sols.forEach((o, i) => {
      const tr = document.createElement("tr");
      if (i === 0) tr.className = "best";
      const a = document.createElement("td");
      a.textContent = String(o.charge) + (i === 0 ? "  ★" : "");
      const el = document.createElement("td");
      el.className = "el";
      el.textContent = String(o.elevation);
      const tof = document.createElement("td");
      tof.textContent = o.timeOfFlight == null ? "—" : o.timeOfFlight.toFixed(1);
      tr.append(a, el, tof);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
    const note = document.createElement("p");
    note.className = "hint";
    note.style.margin = "10px 0 0";
    note.textContent = t("bestChargeNote");
    box.appendChild(note);
    if (S.sel.charge === null || !sols.some((o) => o.charge === S.sel.charge)) S.sel.charge = sols[0].charge;

    const shotBtn = document.createElement("button");
    shotBtn.className = "btn fire-shot";
    shotBtn.style.marginTop = "18px";
    shotBtn.textContent = t("fireShotBtn");
    shotBtn.onclick = () => {
      // Час польоту з таблиці (з поправкою на висоту); якщо його нема — оцінка за дальністю.
      const tof = sols[0].timeOfFlight ?? Math.max(3, dist * 0.025);
      const t0 = launchShot({ x: p.m.x, z: p.m.z }, { x: p.t.x, z: p.t.z }, tof, `${p.m.name} → ${p.t.name}`);
      // звук прив'язано до моменту запуску анімації — влучання збігається з візуальним прильотом
      if (getRoot().soundShots) void playShot(tof, t0);
      vibrate(30);
    };
    box.appendChild(shotBtn);

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn primary save-log";
    saveBtn.style.marginTop = "12px";
    saveBtn.textContent = t("saveToLogBtn");
    saveBtn.onclick = () => {
      const best = sols[0];
      const logged = addFireLogEntry({
        mortarName: p.m.name,
        mortarGrid: gridRef(p.m.x, p.m.z),
        targetName: p.t.name,
        targetGrid: gridRef(p.t.x, p.t.z),
        weapon: w,
        shell: S.sel.shell,
        charge: best.charge,
        elevation: best.elevation,
        bearingMils: b.mils,
        milsPerCircle: weapon.milsPerCircle,
        range: dist,
        heightDiff: dh,
        tof: best.timeOfFlight ?? null,
        ...(warns.length ? { warnings: warns.slice(0, 5).map((x) => ({ name: x.name, distance: Math.round(x.distance), radius: Math.round(x.radius) })) } : {})
      });
      shareLog(logged);
      toast(t("savedToLog"));
      if (!$("pane-log").hidden) renderLog();
    };
    box.appendChild(saveBtn);
  }

  const note2 = document.createElement("p");
  note2.className = "hint";
  note2.style.marginTop = "8px";
  note2.textContent =
    `${weaponName(w)} «${p.m.name}» ${gridRef(p.m.x, p.m.z)}  →  «${p.t.name}» ${gridRef(p.t.x, p.t.z)}` +
    (dh === null ? t("noHeightNote") : "");
  box.appendChild(note2);
  renderTable(dist);
  requestDraw();
}

function ageText(updatedAt: number): string {
  const a = ageOf(updatedAt);
  return a.unit === "now" ? t("ageNow") : t(a.unit === "min" ? "ageMin" : a.unit === "h" ? "ageHour" : "ageDay", { n: a.n });
}

/** Попередження про своїх у небезпечній зоні: рядок над таблицею зарядів (розрахунок). */
function buildFriendlyWarning(warns: FriendlyWarning[], danger: DangerRadius): HTMLElement {
  const box = document.createElement("div");
  box.className = "warn-soft";
  box.setAttribute("role", "status");
  const head = document.createElement("b");
  head.textContent = "⚠ " + t("warnFriendlyTitle", { r: Math.round(danger.radius), a: Math.round(danger.dispersion), f: Math.round(danger.fragments) });
  box.appendChild(head);
  for (const x of warns.slice(0, 3)) {
    const line = document.createElement("div");
    line.textContent = t("warnFriendlyItem", { name: x.name, d: Math.round(x.distance), age: ageText(x.updatedAt) });
    box.appendChild(line);
  }
  if (warns.length > 3) {
    const more = document.createElement("div");
    more.textContent = t("warnMore", { n: warns.length - 3 });
    box.appendChild(more);
  }
  return box;
}

function renderTable(dist: number | null): void {
  const p = firePair();
  if (!p) return;
  const S = getCurrent();
  const shell = TABLES[p.m.w].shells[S.sel.shell];
  if (!shell) return;
  const csSel = $<HTMLSelectElement>("selCharge");
  const key = p.m.w + S.sel.shell;
  if (csSel.dataset.k !== key) {
    csSel.textContent = "";
    for (const c of shell.charges) csSel.add(new Option(`${c.level}  (${c.minRange}–${c.maxRange} ${t("unitM")})`, String(c.level)));
    csSel.dataset.k = key;
  }
  if (!shell.charges.some((c) => c.level === S.sel.charge)) S.sel.charge = shell.charges[0].level;
  csSel.value = String(S.sel.charge);
  const charge = shell.charges.find((c) => c.level === S.sel.charge)!;

  let near: number | null = null;
  if (dist != null) {
    let bd = 1e9;
    for (const row of charge.table) {
      const d = Math.abs(row.range - dist);
      if (d < bd) {
        bd = d;
        near = row.range;
      }
    }
  }
  const table = document.createElement("table");
  table.className = "rt";
  table.innerHTML = `<thead><tr><th>${t("colRangeM")}</th><th>${t("cellElevationMils")}</th><th>${t("colDeltaPer100")}</th><th>${t("colTof")}</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  for (const row of charge.table) {
    const tr = document.createElement("tr");
    if (row.range === near) tr.className = "hit";
    for (const v of [row.range, row.elevation, row.dElev, row.tof]) {
      const td = document.createElement("td");
      td.textContent = String(v);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const box = $("rtable");
  box.textContent = "";
  box.appendChild(table);
  const cap = document.createElement("p");
  cap.className = "hint";
  cap.textContent = t("tableCaption", { weapon: weaponName(p.m.w), shell: shellName(S.sel.shell), shellName: shell.name, level: charge.level });
  box.appendChild(cap);
}

// ---------- fire log ----------
function renderLog(): void {
  const ul = $("logList");
  const done = beginListRender(ul);
  renderLogInner();
  done();
}

function renderLogInner(): void {
  const ul = $("logList");
  ul.textContent = "";
  const S = getCurrent();
  const entries = [...S.fireLog].reverse();
  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = t("logEmpty");
    ul.appendChild(li);
    return;
  }
  const unit = t("unitM");
  let lastDay = "";
  for (const e of entries) {
    const when = new Date(e.at);
    const day = when.toDateString();
    if (day !== lastDay) {
      lastDay = day;
      const head = document.createElement("li");
      head.className = "loghead";
      head.textContent = dayLabel(when);
      ul.appendChild(head);
    }
    const bearingDeg = ((e.bearingMils * 360) / (e.milsPerCircle || 6400)).toFixed(1);
    const rangeM = Math.round(e.range);

    const li = document.createElement("li");
    li.className = "logcard";
    li.dataset.id = e.id;

    const top = document.createElement("div");
    top.className = "logtop";
    const name = document.createElement("div");
    name.className = "name";
    // Назва запису: «вихід - ціль»
    name.textContent = `${e.mortarName} - ${e.targetName}`;
    const time = document.createElement("div");
    time.className = "when";
    time.textContent = when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    top.append(name, time);

    // Головні значення — великими й одразу видно, без розкривання запису.
    const vals = document.createElement("div");
    vals.className = "logvals";
    const addVal = (value: string, label: string, cls = ""): void => {
      const v = document.createElement("div");
      v.className = "lv " + cls;
      const b = document.createElement("b");
      b.textContent = value;
      const sp = document.createElement("span");
      sp.textContent = label;
      v.append(b, sp);
      vals.appendChild(v);
    };
    addVal(`${bearingDeg}°`, t("logAzimuth"), "primary");
    addVal(String(e.elevation), t("logElevation"), "primary");
    addVal(`${rangeM} ${unit}`, t("logRange"));
    addVal(String(e.charge), t("logCharge"));
    if (e.tof !== null && e.tof !== undefined) addVal(`${e.tof.toFixed(1)} ${t("unitSec")}`, t("logTof"));
    if (e.heightDiff !== null && e.heightDiff !== undefined) {
      const dh = Math.round(e.heightDiff);
      addVal(`${dh > 0 ? "+" : ""}${dh} ${unit}`, t("logDh"));
    }

    const meta = document.createElement("div");
    meta.className = "sub";
    meta.textContent = `${weaponName(e.weapon)} • ${shellName(e.shell)} • ${e.mortarGrid} → ${e.targetGrid}`;
    const warnEls: HTMLElement[] = [];
    for (const wn of e.warnings ?? []) {
      const el = document.createElement("div");
      el.className = "logwarn";
      el.textContent = "⚠ " + t("logWarnItem", { name: wn.name, d: wn.distance, r: wn.radius });
      warnEls.push(el);
    }

    const acts = document.createElement("div");
    acts.className = "logact";
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn small";
    copyBtn.textContent = t("copyBtn");
    copyBtn.onclick = () =>
      void copyText(
        `${e.mortarName} - ${e.targetName}: ${t("logAzimuth")} ${bearingDeg}°, ${t("logElevation")} ${e.elevation}, ` +
          `${t("logRange")} ${rangeM} ${unit}, ${t("logCharge")} ${e.charge} (${weaponName(e.weapon)}, ${shellName(e.shell)})`
      );
    const delBtn = document.createElement("button");
    delBtn.className = "btn small";
    delBtn.textContent = t("deleteBtn");
    delBtn.onclick = () => {
      S.fireLog = S.fireLog.filter((x) => x.id !== e.id);
      markDeleted(e.id);
      scheduleSave();
      renderLog();
    };
    acts.append(copyBtn, delBtn);

    const whoEl: HTMLElement[] = [];
    const who = e.by ? memberName(e.by) : "";
    if (who) {
      const w = document.createElement("div");
      w.className = "logwarn who";
      w.textContent = t("squadWhoLog", { who });
      whoEl.push(w);
    }
    li.append(top, vals, meta, ...whoEl, ...warnEls, acts);
    ul.appendChild(li);
  }
}

function dayLabel(d: Date): string {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t("logToday");
  if (d.toDateString() === y.toDateString()) return t("logYesterday");
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}
$<HTMLButtonElement>("clearLog").onclick = async () => {
  const S = getCurrent();
  if (!S.fireLog.length) return;
  const ok = await ask(t("clearLogTitle"), t("clearLogText", { n: S.fireLog.length, terrain: currentMeta().name }), t("deleteBtn"));
  if (ok) {
    for (const entry of S.fireLog) markDeleted(entry.id);
    S.fireLog = [];
    scheduleSave();
    renderLog();
  }
};

// ---------- setup pane ----------
function renderSetup(): void {
  const S = getCurrent();
  const meta = currentMeta();
  $("modeSize").setAttribute("aria-pressed", String(S.calib.mode === "size"));
  $("modePts").setAttribute("aria-pressed", String(S.calib.mode === "points"));
  $("sizeBox").hidden = S.calib.mode !== "size";
  $("calibSummary").textContent =
    S.calib.mode === "size" ? t("calibSummarySize", { x: S.calib.size, z: S.calib.sizeZ }) : t("calibSummaryPts");
  $("ptsBox").hidden = S.calib.mode !== "points";
  $<HTMLInputElement>("size").value = String(S.calib.size);
  $<HTMLInputElement>("sizeZ").value = String(S.calib.sizeZ);
  $<HTMLButtonElement>("presetSize").textContent = `${meta.name} ${meta.sizeX}×${meta.sizeZ}`;
  $<HTMLButtonElement>("downloadImport").hidden = !meta.preset?.mapImage;
  $("mapInfo").hidden = true;
  $("customRow").hidden = !!meta.preset;
  if (S.calib.mode === "points") renderCalibBoxes();
}

$<HTMLButtonElement>("modeSize").onclick = () => {
  getCurrent().calib.mode = "size";
  scheduleSave();
  renderSetup();
  requestDraw();
};
$<HTMLButtonElement>("modePts").onclick = () => {
  getCurrent().calib.mode = "points";
  scheduleSave();
  renderSetup();
  requestDraw();
};
$<HTMLInputElement>("size").addEventListener("change", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  if (v >= 100) {
    getCurrent().calib.size = v;
    scheduleSave();
    resetView();
  }
});
$<HTMLInputElement>("sizeZ").addEventListener("change", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  if (v >= 100) {
    getCurrent().calib.sizeZ = v;
    scheduleSave();
    resetView();
  }
});
$<HTMLButtonElement>("presetSize").onclick = () => {
  const meta = currentMeta();
  getCurrent().calib.size = meta.sizeX;
  getCurrent().calib.sizeZ = meta.sizeZ;
  scheduleSave();
  renderSetup();
  resetView();
};

let calibPick: "a" | "b" | null = null;
function renderCalibBoxes(): void {
  for (const key of ["a", "b"] as const) {
    const box = $("box" + key.toUpperCase());
    box.textContent = "";
    const p = getCurrent().calib[key];
    const title = document.createElement("div");
    title.className = "t";
    title.textContent = t("pointLabel", { k: key.toUpperCase() }) + (p ? "" : t("pointNotFixed"));
    box.appendChild(title);

    // Швидкий ввід: перетин ліній сітки з ігрової карти (напр. 030 029) заповнює X і Z.
    const gridWrap = document.createElement("div");
    gridWrap.className = "field";
    gridWrap.style.marginBottom = "8px";
    const gridLabel = document.createElement("label");
    gridLabel.textContent = t("calibGridLabel");
    const gridInput = document.createElement("input");
    gridInput.autocomplete = "off";
    gridInput.placeholder = "030 029";
    gridInput.disabled = !p;
    gridInput.onchange = () => {
      const g = parseGridCorner(gridInput.value);
      const c = getCurrent().calib[key];
      if (!g || !c) {
        toast(t("calibGridBad"));
        return;
      }
      c.x = g.x;
      c.z = g.z;
      scheduleSave();
      requestDraw();
      renderCalibBoxes();
    };
    gridWrap.append(gridLabel, gridInput);
    box.appendChild(gridWrap);

    const row = document.createElement("div");
    row.className = "row";
    const mk = (label: string, val: number, field: "x" | "z") => {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const l = document.createElement("label");
      l.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.value = isFinite(val) ? String(val) : "";
      input.disabled = !p;
      input.onchange = () => {
        const v = parseFloat(input.value);
        const c = getCurrent().calib[key];
        if (c) {
          c[field] = isFinite(v) ? v : NaN;
          scheduleSave();
          requestDraw();
        }
      };
      wrap.append(l, input);
      return wrap;
    };
    row.append(mk(t("labelXm"), p ? p.x : NaN, "x"), mk(t("labelZm"), p ? p.z : NaN, "z"));
    const btn = document.createElement("button");
    btn.className = "btn small";
    btn.style.alignSelf = "flex-end";
    btn.textContent = p ? t("refixBtn") : t("aimBtn");
    btn.onclick = () => {
      calibPick = key;
      closeSettings(); // карту видно, поки наводимо приціл; після фіксації налаштування відкриються знову
      $("placeBtnLabel").textContent = t("fixPointBtn", { k: key.toUpperCase() });
      toast(t("aimAndFix", { k: key.toUpperCase() }));
    };
    row.appendChild(btn);
    box.appendChild(row);
  }
}

function fixCalibAtCenter(key: "a" | "b"): void {
  const p = centerPx();
  const S = getCurrent();
  const old = S.calib[key];
  S.calib[key] = { px: p.px, py: p.py, x: old?.x ?? NaN, z: old?.z ?? NaN };
  calibPick = null;
  $("placeBtnLabel").textContent = t("placeBtn");
  scheduleSave();
  renderSetup();
  requestDraw();
  toast(t("pointFixed", { k: key.toUpperCase() }));
  openSettings("data");
}

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
    selectedId = null;
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


function applyShotSettings(): void {
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

function applyPlacesStyle(): void {
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
    rollFromZero = true;
    try {
      renderFire();
    } finally {
      rollFromZero = false;
    }
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
  if (selectedId && !S.markers.some((m) => m.id === selectedId)) {
    selectedId = null;
    setDrawCallbacks({ selectedId });
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
    const id = addCustomTerrain(name, size >= 100 ? size : 12800, size >= 100 ? size : 12800);
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
  selectedId = null;
  setDrawCallbacks({ selectedId });
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
  if (selectedId && !S.markers.some((m) => m.id === selectedId)) {
    selectedId = null;
    setDrawCallbacks({ selectedId });
  }
  if (editing) editing = S.markers.find((m) => m.id === editing!.id) ?? editing;
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

export function renderAll(): void {
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
