import { fmtM, gridRef } from "@core/geometry";
import { ALL_FOLDERS, getCurrent, getVisibleMarkers, scheduleSave } from "../state";
import { flyToWorld, requestDraw, setDrawCallbacks } from "../mapView";
import { $, toast } from "../dom";
import { t } from "../i18n";
import { symbolSvg } from "@core/symbols";
import { markAuthor } from "../squad";
import { ruinedBuildingIcon } from "../icons";
import { beginListRender, reducedMotion, rollElement } from "../motion";
import { copyText, fillFolderSelect, getSelectedId, setSelectedId } from "./common";
import { ageText, kindLabel, weaponName } from "./labels";
import { openMarkerDialog } from "./markerDialog";
import { renderAll } from "./renderHub";

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
    if (m.id === getSelectedId()) li.className = "sel";
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
  setSelectedId(id);
  setDrawCallbacks({ selectedId: id });
  const m = getCurrent().markers.find((x) => x.id === id);
  if (m && center) flyToWorld(m.x, m.z);
  renderMarksList();
  requestDraw();
  document.querySelector(`#list li[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
}
