import { gridRef, parseGrid } from "@core/geometry";
import { MAX_COORD } from "@core/stateGuard";
import { type WeaponId } from "@core/ballistics";
import { nearestPlace } from "@core/places";
import { ALL_FOLDERS, currentMeta, getCurrent, getFolderNames, markDeleted, scheduleSave, uid, type Marker, type MarkerType } from "../state";
import { aimBuilding, centerWorld } from "../mapView";
import { $, showModalNoKeyboard, toast } from "../dom";
import { getAutoHeight } from "../mapImport";
import { t } from "../i18n";
import { CAPTION_MAX, KINDS, typeOf, type Affiliation, type MarkKind } from "@core/marks";
import { markRights, squadScope } from "../squad";
import { KIND_KEYS, nextName, typeLabel } from "./labels";
import { getSelectedId, lastUsedFolder, setSelectedId } from "./common";
import { renderAll } from "./renderHub";
import { placePendingCalibPoint } from "./setupPane";

// ---------- marker dialog ----------
const dlg = $<HTMLDialogElement>("dlg");

let editing: Marker | null = null;

let dlgAff: Affiliation | undefined = "hostile";

let dlgKind: MarkKind = "infantry";

let dlgWeapon: WeaponId = "M252";

/** Тип для розрахунку, що відповідає вибраним приналежності й виду. */
/** Після оновлення стану з іншої вкладки діалог редагує вже нове значення мітки. */
export function refreshEditing(markers: Marker[]): void {
  if (editing) editing = markers.find((m) => m.id === editing!.id) ?? editing;
}

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
    if (getSelectedId() === editing.id) setSelectedId(null);
    scheduleSave();
    renderAll();
    toast(t("markDeleted"));
  }
  dlg.close();
};

$<HTMLFormElement>("dlgForm").addEventListener("submit", (e) => {
  const x = parseFloat($<HTMLInputElement>("fX").value);
  const z = parseFloat($<HTMLInputElement>("fZ").value);
  if (!isFinite(x) || !isFinite(z) || Math.abs(x) > MAX_COORD || Math.abs(z) > MAX_COORD) {
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
    setSelectedId(m.id);
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
  if (placePendingCalibPoint()) return;
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
