import { parseGridCorner } from "@core/geometry";
import { MAX_SIZE } from "@core/stateGuard";
import { currentMeta, getCurrent, scheduleSave } from "../state";
import { centerPx, requestDraw, resetView } from "../mapView";
import { $, toast } from "../dom";
import { t } from "../i18n";
import { closeSettings, openSettings } from "../settingsPanel";

// ---------- setup pane ----------
export function renderSetup(): void {
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
  if (v >= 100 && v <= MAX_SIZE) {
    getCurrent().calib.size = v;
    scheduleSave();
    resetView();
  }
});

$<HTMLInputElement>("sizeZ").addEventListener("change", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  if (v >= 100 && v <= MAX_SIZE) {
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

/** Якщо в «Прив'язці» обрано точку A чи B, ставить її в центр карти; повертає, чи було що ставити. */
export function placePendingCalibPoint(): boolean {
  if (!calibPick) return false;
  fixCalibAtCenter(calibPick);
  return true;
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
