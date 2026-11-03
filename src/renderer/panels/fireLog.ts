import { currentMeta, getCurrent, markDeleted, scheduleSave } from "../state";
import { $, ask } from "../dom";
import { t } from "../i18n";
import { memberName } from "../squad";
import { beginListRender } from "../motion";
import { shellName, weaponName } from "./labels";
import { copyText } from "./common";

// ---------- fire log ----------
export function renderLog(): void {
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
