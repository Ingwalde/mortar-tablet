import { socketUrl } from "@core/squad/config";
import { PROTOCOL_VERSION, type ServerMsg, type SquadMark } from "@core/squad/protocol";
import { applyReportEdit } from "@core/squad/report";
import { getRoot, scheduleSave, switchTerrain } from "../state";
import { toast } from "../dom";
import { t } from "../i18n";
import { PING_MS, STORE_KEY, emit, st, type Link } from "./state";
import { send } from "./socket";
import { save } from "./storage";
import { applyChange, applyFromServer, applyMarks, terrainData } from "./convert";
import { flushLogs, mergeLog } from "./log";
import { memberName, setReport } from "./access";
import { drain, scheduleDrain } from "./outbox";

function setLink(next: Link): void {
  if (st.link === next) return;
  st.link = next;
  emit();
}

export function connect(hello: { code?: string }): void {
  if (!st.session || st.fatal) return;
  clearTimeout(st.retryTimer);
  const s = st.session;
  setLink("connecting");
  let sock: WebSocket;
  try {
    sock = new WebSocket(socketUrl(s.room));
  } catch {
    scheduleRetry();
    return;
  }
  st.ws = sock;
  st.sent = new Set();
  sock.onopen = () => {
    if (st.ws !== sock) return;
    sock.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, code: hello.code ?? s.code ?? "", callsign: s.callsign, ...(s.key ? { key: s.key } : {}) }));
    clearInterval(st.pingTimer);
    st.pingTimer = setInterval(() => send({ t: "ping" }), PING_MS);
  };
  sock.onmessage = (e) => {
    if (st.ws !== sock || typeof e.data !== "string") return;
    let msg: ServerMsg | { t: "pong" };
    try {
      msg = JSON.parse(e.data) as ServerMsg;
    } catch {
      return;
    }
    if (msg.t !== ("pong" as string)) onMessage(msg as ServerMsg);
  };
  sock.onclose = () => {
    if (st.ws !== sock) return;
    st.ws = null;
    clearInterval(st.pingTimer);
    setLink("offline");
    if (st.session && !st.fatal) scheduleRetry();
  };
  sock.onerror = () => {
    /* закриття обробить onclose */
  };
}

function scheduleRetry(): void {
  clearTimeout(st.retryTimer);
  const wait = Math.min(30_000, 1000 * 2 ** Math.min(st.attempt, 5));
  st.attempt++;
  st.retryTimer = setTimeout(() => connect({}), wait);
}

function disconnect(): void {
  clearTimeout(st.retryTimer);
  clearInterval(st.pingTimer);
  const old = st.ws;
  st.ws = null;
  try {
    old?.close();
  } catch {
    /* вже закрито */
  }
  setLink("offline");
}

function onMessage(msg: ServerMsg): void {
  if (!st.session || !st.sync) return;
  switch (msg.t) {
    case "welcome":
      // новий учасник отримує ключ; пристрій, що повернувся, лишає свій
      st.session = { ...st.session, memberId: msg.memberId, ...(msg.key ? { key: msg.key } : {}) };
      save();
      break;
    case "snapshot": {
      st.attempt = 0;
      st.me = { role: msg.you.role, editor: msg.you.editor };
      st.members = msg.members;
      st.phase = msg.phase;
      if (msg.terrain && msg.terrain !== st.session.terrain) st.session = { ...st.session, terrain: msg.terrain };
      const squadTerrain = st.session.terrain;
      if (squadTerrain && squadTerrain !== getRoot().cur && Object.hasOwn(getRoot().data, squadTerrain) && !st.wasShownOnce) {
        st.wasShownOnce = true;
        switchTerrain(squadTerrain);
        window.dispatchEvent(new CustomEvent("mortar:squad-terrain"));
      }
      const marks = st.sync.onSnapshot(msg.marks);
      applyFromServer(() => {
        applyMarks(marks);
        if (msg.log) mergeLog(msg.log);
      });
      setLink("online");
      st.pendingLogs = st.pendingLogs.filter((e) => !msg.log?.some((l) => l.id === e.id));
      if (msg.report) setReport(msg.report, true);
      drain();
      flushLogs();
      break;
    }
    case "op": {
      const ch = st.sync.onOp(msg);
      st.sent.delete(msg.opId);
      if (ch) {
        applyFromServer(() => applyChange(ch.id, ch.mark));
        if (msg.op.k === "create" && ch.mark && msg.by !== st.session.memberId) {
          toast(t("squadAdded", { who: memberName(msg.by) || "?", what: ch.mark.name || t(kindKey(ch.mark.kind)) }));
        }
      } else save();
      emit();
      break;
    }
    case "ack":
      st.sync.onAck(msg.opId);
      st.sent.delete(msg.opId);
      save();
      emit();
      break;
    case "reject":
      if (msg.reason === "rate") {
        // не втрачаємо дію: повторимо трохи згодом
        st.sent.delete(msg.opId);
        scheduleDrain(15_000);
      } else {
        st.sync.onReject(msg.opId);
        st.sent.delete(msg.opId);
        toast(t(msg.reason === "permission" ? "squadDenied" : msg.reason === "ended" ? "squadEnded" : "squadRejected"));
        send({ t: "sync" });
      }
      save();
      emit();
      break;
    case "members":
      st.members = msg.members;
      emit();
      break;
    case "log":
      applyFromServer(() => mergeLog([msg.entry]));
      st.pendingLogs = st.pendingLogs.filter((e) => e.id !== (msg.entry as { id: string }).id);
      break;
    case "terrain":
      st.session = { ...st.session, terrain: msg.id };
      save();
      emit();
      window.dispatchEvent(new CustomEvent("mortar:squad-terrain"));
      break;
    case "code":
      st.session = { ...st.session, code: msg.code };
      save();
      emit();
      break;
    case "ended":
      st.phase = "ended";
      setReport(msg.report, true);
      toast(t("squadEnded"));
      emit();
      break;
    case "reportEdit": {
      const next = st.report && st.reportFromServer ? applyReportEdit(st.report, msg.edit) : null;
      if (next) {
        setReport(next, true);
        emit();
      }
      break;
    }
    case "error":
      onFatal(msg.code);
      break;
  }
}

function kindKey(kind: SquadMark["kind"]): "kindInfantry" | "kindArmour" | "kindMortar" | "kindHelicopter" | "kindRetreat" {
  return ({ infantry: "kindInfantry", armour: "kindArmour", mortar: "kindMortar", helicopter: "kindHelicopter", retreat: "kindRetreat" } as const)[kind];
}

function onFatal(code: string): void {
  if (code === "removed") {
    st.fatal = "removed";
    disconnect();
    toast(t("squadKicked"), 5000);
    emit();
  } else if (code === "gone") {
    toast(t(st.exporting ? "repExported" : "squadGone"), 5000);
    st.exporting = false;
    clearLocal(true);
  } else if (code === "version") {
    disconnect();
    toast(t("squadVersion"), 5000);
  }
}

/** Подальше життя відділення після виходу: лишити мітки як локальні чи прибрати. */
export function clearLocal(keepMarks: boolean): void {
  const room = st.session?.room;
  const d = terrainData();
  if (room && d) {
    if (keepMarks) {
      for (const m of d.markers) if (m.sq === room) delete m.sq;
    } else {
      d.markers = d.markers.filter((m) => m.sq !== room);
    }
  }
  disconnect();
  st.session = null;
  st.sync = null;
  st.me = null;
  st.members = [];
  st.pendingLogs = [];
  st.fatal = null;
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* немає сховища */
  }
  scheduleSave();
  emit();
}
