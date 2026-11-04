import { canUseSolution } from "@core/squad/permissions";
import { getRoot, normalizeFireLogEntry, type FireLogEntry } from "../state";
import { terrainData } from "./convert";
import { emit, st } from "./state";
import { save } from "./storage";
import { send } from "./socket";

// ---------- журнал ----------

export function mergeLog(entries: unknown[]): void {
  const d = terrainData();
  if (!d) return;
  const have = new Set(d.fireLog.map((e) => e.id));
  for (const raw of entries) {
    const e = normalizeFireLogEntry(raw);
    if (e && !have.has(e.id)) {
      d.fireLog.push(e);
      have.add(e.id);
    }
  }
  d.fireLog.sort((a, b) => a.at - b.at);
}

/** Передає запис журналу відділенню (мінометник чи командир). Без зв'язку чекає в черзі. */
export function shareLog(entry: FireLogEntry): void {
  if (!st.session || st.fatal || st.phase !== "active" || !st.me || !canUseSolution(st.me.role) || st.session.terrain !== getRoot().cur) return;
  st.pendingLogs.push(entry);
  save();
  flushLogs();
  emit();
}

export function flushLogs(): void {
  if (st.link !== "online") return;
  for (const e of st.pendingLogs) send({ t: "log", opId: "l" + e.id, entry: e });
}
