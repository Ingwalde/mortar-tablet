import { STORE_KEY, st, type Saved } from "./state";

// ---------- сховище на пристрої ----------

export function save(): void {
  clearTimeout(st.saveTimer);
  st.saveTimer = setTimeout(() => {
    try {
      if (!st.session || !st.sync) localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, JSON.stringify({ session: st.session, sync: st.sync.toJSON(), logs: st.pendingLogs } satisfies Saved));
    } catch {
      /* сховище недоступне — відділення працює до закриття сторінки */
    }
  }, 150);
}

export function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    return s && s.session && typeof s.session.room === "string" && typeof s.session.key === "string" && s.sync ? s : null;
  } catch {
    return null;
  }
}
