import { fmtM, gridRef } from "@core/geometry";
import { TABLES, bearing, shellRange, solve, type WeaponId } from "@core/ballistics";
import { gameRangeSpread, spreadRadii } from "@core/spread";
import { allowedShells, pickShell } from "@core/settings";
import { addFireLogEntry, ALL_FOLDERS, currentMeta, getCurrent, getRoot, markersInFolder, scheduleSave, type Marker, VALID_SHELLS } from "../state";
import { flyToWorld, centerWorld, requestDraw, setDrawCallbacks, launchShot } from "../mapView";
import { $, toast } from "../dom";
import { heightAt } from "../terrainHeight";
import { t } from "../i18n";
import { openSettings } from "../settingsPanel";
import { isMortarMark, isTargetable } from "@core/marks";
import { dangerRadius, friendlyWarnings, type DangerRadius, type FriendlyWarning } from "@core/shellEffects";
import { shareLog } from "../squad";
import { tweenNumber } from "../motion";
import { playShot } from "../shotAudio";
import { ageText, kindLabel, shellName, weaponName } from "./labels";
import { vibrate } from "./common";
import { renderLog } from "./fireLog";

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

export function fillFireSelects(): void {
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

export function fillShellOptions(): void {
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

/** Перший показ вкладки: цифри відкручуються від нуля. */
export function renderFireRolling(): void {
  rollFromZero = true;
  try {
    renderFire();
  } finally {
    rollFromZero = false;
  }
}

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
