import { RELAY_URL, socketUrl, type Invite } from "@core/squad/config";
import { PROTOCOL_VERSION, type AdminAction, type ServerMsg } from "@core/squad/protocol";
import { SquadSync, newOpId, type SyncDump } from "@core/squad/sync";
import { getRoot, scheduleSave } from "../state";
import { emit, st, type Session } from "./state";
import { load, save } from "./storage";
import { clearLocal, connect } from "./conn";
import { send } from "./socket";
import { terrainData } from "./convert";
import { pushLocalChanges } from "./outbox";

// ---------- керування відділенням ----------

function begin(s: Session, dump?: SyncDump): void {
  st.session = s;
  st.sync = new SquadSync(s.memberId, { dump });
  st.me = null;
  st.members = [];
  st.phase = "active";
  st.fatal = null;
  st.wasShownOnce = false;
  st.attempt = 0;
  save();
}

export type JoinError = "limit" | "disabled" | "bad_code" | "bad_callsign" | "callsign_taken" | "full" | "removed" | "ended" | "gone" | "network" | "version" | "invalid";

/** Створює відділення на поточному терені; створювач — командир. */
export async function createSquad(callsign: string): Promise<JoinError | null> {
  try {
    // без відповіді довше 15 с вважаємо, що зв'язку нема: кнопка не має висіти вічно
    const res = await fetch(RELAY_URL + "/create", { method: "POST", body: JSON.stringify({ callsign, terrain: getRoot().cur }), signal: AbortSignal.timeout(15_000) });
    const j = (await res.json()) as { room?: string; code?: string; key?: string; memberId?: string; error?: string };
    if (!res.ok || !j.room || !j.code || !j.key || !j.memberId) {
      return j.error === "bad_callsign" ? "bad_callsign" : j.error === "limit" ? "limit" : j.error === "disabled" ? "disabled" : "network";
    }
    begin({ room: j.room, key: j.key, memberId: j.memberId, callsign, code: j.code, terrain: getRoot().cur });
    // кімната вже знає командира: стартові мітки терену (якщо вони є) командир додає вручну
    connect({});
    emit();
    return null;
  } catch {
    return "network";
  }
}

/** Приєднується до відділення за запрошенням; повертає причину відмови або null. */
export function joinSquad(invite: Invite, callsign: string): Promise<JoinError | null> {
  return new Promise((resolve) => {
    let done = false;
    let joined: Session | null = null;
    const sock = new WebSocket(socketUrl(invite.room));
    // сервер мовчить (з'єднання зависло без помилки): через 15 с здаємось, а не лишаємо вікно «Приєднуюсь…» назавжди
    const timeout = setTimeout(() => finish("network"), 15_000);
    const finish = (r: JoinError | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      try {
        sock.close();
      } catch {
        /* вже закрито */
      }
      resolve(r);
    };
    sock.onopen = () => sock.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, code: invite.code, callsign }));
    sock.onerror = () => finish("network");
    sock.onclose = () => finish("network");
    sock.onmessage = (e) => {
      if (done || typeof e.data !== "string") return;
      let m: ServerMsg;
      try {
        m = JSON.parse(e.data) as ServerMsg;
      } catch {
        return;
      }
      if (m.t === "error") return finish(m.code as JoinError);
      if (m.t === "welcome" && m.key) {
        // ключ отримано; чекаємо зліпок, щоб знати карту відділення ще до першої мітки
        joined = { room: invite.room, key: m.key, memberId: m.memberId, callsign, code: null, terrain: "" };
      } else if (m.t === "snapshot" && joined) {
        begin({ ...joined, terrain: m.terrain });
        finish(null);
        connect({});
        emit();
      }
    };
  });
}

export function leaveSquad(keepMarks: boolean): void {
  clearLocal(keepMarks);
}

/** Повторна спроба зайти (після того, як командир відновив доступ). */
export function retrySquad(): void {
  if (!st.session) return;
  st.fatal = null;
  st.attempt = 0;
  connect({});
  emit();
}

export function sendAdmin(action: AdminAction): void {
  send({ t: "admin", opId: newOpId(), action });
}

/** Командир додає свої локальні мітки поточного терену (він має збігатися з картою відділення) до спільних. */
export function shareLocalMarks(): number {
  const d = terrainData();
  if (!d || !st.session || getRoot().cur !== st.session.terrain) return 0;
  let n = 0;
  for (const m of d.markers) {
    if (!m.sq && m.aff && m.kind !== "legacy") {
      m.sq = st.session.room;
      n++;
    }
  }
  if (n) {
    scheduleSave();
    pushLocalChanges();
  }
  return n;
}

/** Після запуску: відновлює вхід у відділення, якщо він збережений. */
export function resumeSquad(): void {
  const saved = load();
  if (!saved) return;
  begin(saved.session, saved.sync);
  st.pendingLogs = Array.isArray(saved.logs) ? saved.logs : [];
  st.wasShownOnce = true;
  connect({});
  emit();
  window.addEventListener("online", () => {
    if (st.session && !st.fatal && st.link === "offline") connect({});
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && st.session && !st.fatal && st.link === "offline") connect({});
  });
}
