/**
 * Екран налаштувань: розділи ліворуч (на телефоні — смуга зверху), пошук, «Скинути розділ».
 * Складні картки колишньої вкладки «Карта» (карта, прив'язка, мережа, резервна копія) переїхали сюди разом зі своєю розміткою,
 * тож їхня логіка в panels/ працює без змін; нові елементи (звук, снаряди, розкид тощо) прив'язуються тут.
 */
import { MAX_SPREAD_PCT, defaultSpread, normalizeSpread } from "@core/spread";
import { SETTINGS_WEAPONS, allowedShells, clampVolume, defaultShellSettings, toggleShell } from "@core/settings";
import type { WeaponId } from "@core/ballistics";
import { $, ask, toast } from "./dom";
import { getLang, setLang, t } from "./i18n";
import { isRemote, isStandalone } from "./platform";
import { setShotVolume, playTestSound } from "./shotAudio";
import { getRoot, scheduleSave, VALID_SHELLS } from "./state";
import { setKeepAwake } from "./wakeLock";
import { canVibrate, isIosHaptics, vibrate } from "./haptics";
import { slideIndicator } from "./slider";
import { setLightMode } from "./mapView";

export interface SettingsHooks {
  /** Застосувати всі налаштування до інтерфейсу (тема, назви пунктів, кільця, звук, снаряди) і перемалювати. */
  applyAll(): void;
  shellLabel(key: string): string;
  weaponLabel(w: WeaponId): string;
  /** Оновити підписи карти й прив'язки (ПК). */
  renderSetup(): void;
}

let hooks: SettingsHooks | null = null;
let activeSection = "view";

const dlg = (): HTMLDialogElement => $<HTMLDialogElement>("settingsDlg");

export function openSettings(section?: string): void {
  if (section) activeSection = section;
  syncControls();
  showSection(activeSection);
  if (!dlg().open) {
    dlg().showModal();
    // діалог сам фокусує перше поле (пошук): на телефоні це розгорнуло б його й відкрило клавіатуру
    if (document.activeElement === $("setSearch")) $<HTMLInputElement>("setSearch").blur();
  }
  hooks?.renderSetup();
}

export function closeSettings(): void {
  if (dlg().open) dlg().close();
}

function sectionVisible(sec: string): boolean {
  const el = document.querySelector<HTMLElement>(`.set-sec[data-sec="${sec}"]`);
  return !!el && !el.dataset.hiddenPlatform;
}

function sectionOrder(): string[] {
  return [...document.querySelectorAll<HTMLButtonElement>("#setNav button")].filter((b) => !b.dataset.hiddenPlatform).map((b) => b.dataset.sec!);
}

function showSection(sec: string): void {
  if (!sectionVisible(sec)) sec = "view";
  // напрямок переходу: нова вкладка виїжджає з того боку, куди ми «йдемо»
  const order = sectionOrder();
  const dir = order.indexOf(sec) >= order.indexOf(activeSection) ? "next" : "prev";
  const changed = sec !== activeSection;
  activeSection = sec;
  const q = ($<HTMLInputElement>("setSearch").value || "").trim();
  if (q) return; // під час пошуку показуємо всі збіги
  for (const s of document.querySelectorAll<HTMLElement>(".set-sec")) {
    s.hidden = s.dataset.sec !== sec || !!s.dataset.hiddenPlatform;
    if (!s.hidden && changed) s.dataset.dir = dir;
    else delete s.dataset.dir;
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>("#setNav button")) b.setAttribute("aria-pressed", String(b.dataset.sec === sec));
  // на телефоні смуга розділів прокручується: активний пункт має лишатись на екрані
  document.querySelector<HTMLElement>(`#setNav button[data-sec="${sec}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  $("setEmpty").hidden = true;
  $("setContent").scrollTop = 0;
}

/** Фільтр за запитом: показує рядки/картки, що містять усі слова запиту; порожні розділи ховає. */
function applySearch(): void {
  const q = $<HTMLInputElement>("setSearch").value.trim().toLowerCase();
  if (!q) {
    for (const r of document.querySelectorAll<HTMLElement>(".set-row, .set-hero, .set-link, .set-sec details.card")) r.classList.remove("set-hide");
    showSection(activeSection);
    return;
  }
  const words = q.split(/\s+/);
  let any = false;
  for (const sec of document.querySelectorAll<HTMLElement>(".set-sec")) {
    if (sec.dataset.hiddenPlatform) {
      sec.hidden = true;
      continue;
    }
    let visible = 0;
    for (const row of sec.querySelectorAll<HTMLElement>(".set-row, .set-hero, .set-link, details.card")) {
      if (row.dataset.hiddenPlatform) {
        row.classList.add("set-hide");
        continue;
      }
      const text = ((row.dataset.q ?? "") + " " + row.textContent).toLowerCase();
      const ok = words.every((w) => text.includes(w));
      row.classList.toggle("set-hide", !ok);
      if (ok) visible++;
    }
    sec.hidden = visible === 0;
    if (visible) any = true;
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>("#setNav button")) b.setAttribute("aria-pressed", "false");
  $("setEmpty").hidden = any;
}

/** Показує на екрані поточний стан усіх налаштувань. */
function syncControls(): void {
  const r = getRoot();
  $<HTMLSelectElement>("langSel").value = getLang();
  $<HTMLInputElement>("soundToggle").checked = r.soundShots;
  const vol = Math.round(r.soundVolume * 100);
  $<HTMLInputElement>("soundVolume").value = String(vol);
  $("soundVolumeVal").textContent = `${vol}%`;
  $<HTMLInputElement>("vibToggle").checked = r.vibration;
  $<HTMLInputElement>("awakeToggle").checked = r.keepAwake;
  $<HTMLInputElement>("updNoticeToggle").checked = r.updateNotice;
  $<HTMLInputElement>("spreadOn").checked = r.spread.on;
  $<HTMLInputElement>("spreadAuto").checked = r.spread.auto;
  $("spreadBody").hidden = !r.spread.on;
  $("spreadManual").hidden = r.spread.auto;
  renderSpreadManual();
  renderShells();
  $("setVersion").textContent = t("setVersion", { v: __APP_VERSION__ });
}

function renderSpreadManual(): void {
  const box = $("spreadManual");
  const r = getRoot();
  box.textContent = "";
  if (r.spread.auto) return;
  for (const w of SETTINGS_WEAPONS) {
    const head = document.createElement("div");
    head.className = "set-sub";
    head.textContent = hooks?.weaponLabel(w) ?? w;
    const grid = document.createElement("div");
    grid.className = "spread-grid";
    for (const key of ["len", "wid"] as const) {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const lb = document.createElement("label");
      lb.textContent = t(key === "len" ? "spreadLen" : "spreadWid");
      const inp = document.createElement("input");
      inp.type = "number";
      inp.inputMode = "decimal";
      inp.min = "0";
      inp.max = String(MAX_SPREAD_PCT);
      inp.step = "0.1";
      inp.placeholder = "0";
      inp.value = r.spread[w][key] ? String(r.spread[w][key]) : "";
      inp.oninput = () => {
        const v = parseFloat(inp.value);
        r.spread[w][key] = Number.isFinite(v) ? v : 0;
        r.spread = normalizeSpread(r.spread);
        scheduleSave();
        hooks?.applyAll();
      };
      wrap.append(lb, inp);
      grid.appendChild(wrap);
    }
    box.append(head, grid);
  }
}

function renderShells(): void {
  const box = $("shellsBody");
  const r = getRoot();
  box.textContent = "";
  for (const w of SETTINGS_WEAPONS) {
    const head = document.createElement("div");
    head.className = "set-sub";
    head.textContent = hooks?.weaponLabel(w) ?? w;
    box.appendChild(head);
    const allowed = new Set(allowedShells(r.shells, w, VALID_SHELLS));
    for (const key of VALID_SHELLS[w]) {
      const label = document.createElement("label");
      label.className = "set-switch";
      label.style.margin = "10px 0";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = allowed.has(key);
      // останній ввімкнений вимкнути не можна
      cb.disabled = cb.checked && allowed.size === 1;
      cb.onchange = () => {
        r.shells = toggleShell(r.shells, w, key, cb.checked, VALID_SHELLS);
        scheduleSave();
        renderShells();
        hooks?.applyAll();
      };
      const span = document.createElement("span");
      span.textContent = hooks?.shellLabel(key) ?? key;
      label.append(span, cb);
      box.appendChild(label);
    }
    const defRow = document.createElement("label");
    defRow.className = "set-field";
    defRow.style.cssText = "margin:12px 0 18px";
    const defTxt = document.createElement("span");
    defTxt.textContent = t("setShellDefault");
    const sel = document.createElement("select");
    for (const key of allowedShells(r.shells, w, VALID_SHELLS)) sel.add(new Option(hooks?.shellLabel(key) ?? key, key));
    sel.value = r.shells[w].def;
    sel.onchange = () => {
      r.shells = { ...r.shells, [w]: { ...r.shells[w], def: sel.value } };
      scheduleSave();
      hooks?.applyAll();
    };
    defRow.append(defTxt, sel);
    box.appendChild(defRow);
  }
}

async function resetSection(sec: string): Promise<void> {
  const ok = await ask(t("setResetTitle"), t("setResetText"), t("setReset"));
  if (!ok) return;
  const r = getRoot();
  if (sec === "view") {
    r.theme = "green";
    r.showPlaces = true;
    r.placesScale = 1;
    r.placesLevel = 3;
    r.showRings = true;
    setLightMode(false, true);
  } else if (sec === "sound") {
    r.soundShots = true;
    r.soundVolume = 1;
    r.vibration = true;
    r.keepAwake = true;
  } else if (sec === "calc") {
    r.spread = defaultSpread();
    r.shells = defaultShellSettings(VALID_SHELLS);
  }
  scheduleSave();
  hooks?.applyAll();
  syncControls();
  toast(t("setResetDone"));
}

export function initSettings(h: SettingsHooks): void {
  hooks = h;
  const root = dlg();

  // платформи: що доречно лише на ПК, лише на телефоні/сайті або лише в автономній версії
  const hide = (el: Element | null, hidden: boolean): void => {
    if (el instanceof HTMLElement && hidden) el.dataset.hiddenPlatform = "1";
  };
  for (const el of root.querySelectorAll("[data-pc]")) hide(el, isRemote);
  for (const el of root.querySelectorAll("[data-web]")) hide(el, !isRemote);
  for (const el of root.querySelectorAll("[data-standalone]")) hide(el, !isStandalone);
  for (const sel of ['[data-card="map"]', '[data-card="calib"]', '[data-card="storage"]']) hide(root.querySelector(sel), isRemote);
  for (const el of root.querySelectorAll<HTMLElement>("[data-hidden-platform], .set-sec, #setNav button, .set-row, details.card")) {
    if (el.dataset.hiddenPlatform) el.hidden = true;
  }

  slideIndicator($("setNav"), { active: 'button[aria-pressed="true"]' });
  // свайп вліво/вправо по вмісту перемикає розділ (телефон)
  let touch: { x: number; y: number } | null = null;
  const content = $("setContent");
  content.addEventListener("touchstart", (e) => {
    const p = e.touches[0];
    touch = e.touches.length === 1 && p ? { x: p.clientX, y: p.clientY } : null;
  }, { passive: true });
  content.addEventListener("touchend", (e) => {
    const p = e.changedTouches[0];
    const st = touch;
    touch = null;
    if (!st || !p || $<HTMLInputElement>("setSearch").value.trim()) return;
    const dx = p.clientX - st.x;
    const dy = p.clientY - st.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const order = sectionOrder();
    const next = order[order.indexOf(activeSection) + (dx < 0 ? 1 : -1)];
    if (next) showSection(next);
  }, { passive: true });
  $("settingsBtn").onclick = () => openSettings();
  $("setClose").onclick = () => closeSettings();
  root.addEventListener("click", (e) => {
    if (e.target === root) closeSettings();
  });
  for (const b of root.querySelectorAll<HTMLButtonElement>("#setNav button")) {
    b.onclick = () => {
      $<HTMLInputElement>("setSearch").value = "";
      applySearch();
      showSection(b.dataset.sec!);
    };
  }
  $<HTMLInputElement>("setSearch").oninput = applySearch;
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-reset]")) b.onclick = () => void resetSection(b.dataset.reset!);

  $<HTMLSelectElement>("langSel").onchange = (e) => {
    const next = (e.target as HTMLSelectElement).value === "en" ? "en" : "uk";
    setLang(next);
    getRoot().lang = next;
    scheduleSave();
    syncControls();
  };

  // звук: перемикач синхронізований з кнопкою на карті
  $<HTMLInputElement>("soundToggle").onchange = (e) => {
    if ((e.target as HTMLInputElement).checked !== getRoot().soundShots) $("soundBtn").click();
  };
  $<HTMLInputElement>("soundVolume").oninput = (e) => {
    const v = clampVolume(Number((e.target as HTMLInputElement).value) / 100);
    getRoot().soundVolume = v;
    setShotVolume(v);
    $("soundVolumeVal").textContent = `${Math.round(v * 100)}%`;
    scheduleSave();
  };
  $<HTMLButtonElement>("soundTest").onclick = () => void playTestSound();
  $<HTMLInputElement>("vibToggle").onchange = (e) => {
    getRoot().vibration = (e.target as HTMLInputElement).checked;
    scheduleSave();
    if (getRoot().vibration) vibrate(30);
  };
  if (!canVibrate()) {
    $<HTMLInputElement>("vibToggle").disabled = true;
    $("vibHint").hidden = false;
  } else if (isIosHaptics()) {
    $("vibHint").dataset.i18n = "setVibrationIos";
    $("vibHint").textContent = t("setVibrationIos");
    $("vibHint").hidden = false;
  }
  $<HTMLInputElement>("awakeToggle").onchange = (e) => {
    getRoot().keepAwake = (e.target as HTMLInputElement).checked;
    setKeepAwake(getRoot().keepAwake);
    scheduleSave();
  };
  $<HTMLInputElement>("updNoticeToggle").onchange = (e) => {
    getRoot().updateNotice = (e.target as HTMLInputElement).checked;
    scheduleSave();
  };

  $<HTMLInputElement>("spreadOn").onchange = (e) => {
    getRoot().spread.on = (e.target as HTMLInputElement).checked;
    $("spreadBody").hidden = !getRoot().spread.on;
    scheduleSave();
    hooks?.applyAll();
  };
  $<HTMLInputElement>("spreadAuto").onchange = (e) => {
    getRoot().spread.auto = (e.target as HTMLInputElement).checked;
    $("spreadManual").hidden = getRoot().spread.auto;
    renderSpreadManual();
    scheduleSave();
    hooks?.applyAll();
  };

  $<HTMLButtonElement>("setAboutOpen").onclick = () => {
    closeSettings();
    $("aboutBtn").click();
  };
}
