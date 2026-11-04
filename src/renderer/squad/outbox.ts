import { onStateChanged } from "../state";
import { PUSH_DELAY_MS, SEND_PER_MINUTE, emit, st } from "./state";
import { wantedNow } from "./convert";
import { save } from "./storage";
import { send } from "./socket";

// ---------- надсилання змін ----------

onStateChanged(() => {
  if (!st.session || !st.sync || st.applying) return;
  clearTimeout(st.pushTimer);
  st.pushTimer = setTimeout(pushLocalChanges, PUSH_DELAY_MS);
});

export function pushLocalChanges(): void {
  if (!st.session || !st.sync || st.fatal || st.phase !== "active") return;
  if (st.sync.diff(wantedNow()).length) {
    save();
    emit();
  }
  drain();
}

export function scheduleDrain(ms: number): void {
  clearTimeout(st.drainTimer);
  st.drainTimer = setTimeout(drain, ms);
}

/** Надсилає чергу, не перевищуючи ліміт сервера; решта піде згодом. */
export function drain(): void {
  if (!st.sync || st.link !== "online") return;
  const now = Date.now();
  st.sentAt = st.sentAt.filter((x) => now - x < 60_000);
  for (const p of st.sync.pending) {
    if (st.sent.has(p.opId)) continue;
    if (st.sentAt.length >= SEND_PER_MINUTE) {
      scheduleDrain(Math.max(1000, 60_000 - (now - st.sentAt[0]) + 50));
      return;
    }
    if (!send({ t: "op", opId: p.opId, op: p.op })) return;
    st.sent.add(p.opId);
    st.sentAt.push(now);
  }
}
