/**
 * Клієнт режиму відділення: з'єднання з реле, збереження входу, синхронізація міток і журналу зі станом застосунку.
 * Логіка правил і черги — в @core/squad (Room, SquadSync); тут лише мережа, сховище на пристрої й зв'язок з інтерфейсом.
 *
 * Мітки відділення лежать у звичайному списку міток терену відділення з ознакою `sq` (id кімнати): так на них працюють
 * карта, список, розрахунок і попередження без змін. Усе, що користувач змінює, рушій порівнює з дзеркалом і шле як дії.
 */
import { RELAY_URL, inviteLink, socketUrl, type Invite } from "@core/squad/config";
import { PROTOCOL_VERSION, type AdminAction, type MemberInfo, type Role, type ServerMsg, type SquadMark } from "@core/squad/protocol";
import { SquadSync, newOpId, type SyncDump, type Wanted } from "@core/squad/sync";
import { canCaption, canCreate, canDelete, canEdit, canEditReport, canUseSolution } from "@core/squad/permissions";
import { applyReportEdit, readReport, type Report, type ReportEdit } from "@core/squad/report";
import { typeOf } from "@core/marks";
import { getRoot, normalizeFireLogEntry, onStateChanged, scheduleSave, switchTerrain, type FireLogEntry, type Marker, type TerrainState } from "./state";
import { toast } from "./dom";
import { t } from "./i18n";

const STORE_KEY = "mortar.squad.v1";
const REPORT_KEY = "mortar.report.v1";
const PUSH_DELAY_MS = 300;
const PING_MS = 50_000;
/** Нижче за ліміт сервера (40 дій на хвилину): не надсилаємо швидше, ніж він приймає. */
const SEND_PER_MINUTE = 30;

export interface Session {
  room: string;
  key: string;
  memberId: string;
  callsign: string;
  /** Код приєднання: є в того, хто створив відділення або замінив код. */
  code: string | null;
  terrain: string;
}

export type Link = "offline" | "connecting" | "online";

interface Saved {
  session: Session;
  sync: SyncDump;
  logs: FireLogEntry[];
}

let session: Session | null = null;
let sync: SquadSync | null = null;
let pendingLogs: FireLogEntry[] = [];
let ws: WebSocket | null = null;
let link: Link = "offline";
let me: { role: Role; editor: boolean } | null = null;
let members: MemberInfo[] = [];
let phase: "active" | "ended" = "active";
/** Звіт: від сервера (його можна правити) або відкритий із файлу (лише перегляд); зберігається на пристрої. */
let report: Report | null = readStoredReport();
let reportFromServer = false;
let exporting = false;
let fatal: "removed" | null = null;
let applying = false;
let sent = new Set<string>();
let sentAt: number[] = [];
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let drainTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const listeners: Array<() => void> = [];

// ---------- доступ для інтерфейсу ----------

export const squadInfo = {
  get session(): Session | null {
    return session;
  },
  get link(): Link {
    return link;
  },
  get role(): Role | null {
    return me?.role ?? null;
  },
  get editor(): boolean {
    return me?.editor ?? false;
  },
  get members(): MemberInfo[] {
    return members;
  },
  get phase(): "active" | "ended" {
    return phase;
  },
  get removed(): boolean {
    return fatal === "removed";
  },
  get pending(): number {
    return (sync?.pending.length ?? 0) + pendingLogs.length;
  },
  get link_(): string | null {
    return session?.code ? inviteLink(session.room, session.code) : null;
  }
};

function readStoredReport(): Report | null {
  try {
    const raw = localStorage.getItem(REPORT_KEY);
    return raw ? readReport(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function setReport(r: Report | null, fromServer: boolean): void {
  report = r;
  reportFromServer = fromServer && r !== null;
  try {
    if (r) localStorage.setItem(REPORT_KEY, JSON.stringify(r));
    else localStorage.removeItem(REPORT_KEY);
  } catch {
    /* сховище недоступне: звіт лишиться до закриття сторінки */
  }
}

export const reportInfo = {
  get report(): Report | null {
    return report;
  },
  /** Звіт можна правити: гру закінчено, ми в відділенні й маємо на це право. */
  get editable(): boolean {
    return !!session && !fatal && phase === "ended" && reportFromServer && !!me && canEditReport(me.role, me.editor);
  }
};

export function editReport(edit: ReportEdit): void {
  send({ t: "report", opId: newOpId(), edit });
}

/** Звіт збережено у файл: сервер може забути відділення. */
export function reportExported(): void {
  exporting = true;
  send({ t: "exported", opId: newOpId() });
}

export function closeReport(): void {
  setReport(null, false);
  emit();
}

/** Відкриває звіт із тексту файлу для перегляду; false, якщо це не звіт. */
export function openReportText(text: string): boolean {
  try {
    const r = readReport(JSON.parse(text));
    if (!r) return false;
    setReport(r, false);
    emit();
    return true;
  } catch {
    return false;
  }
}

export function onSquadChange(cb: () => void): void {
  listeners.push(cb);
}

function emit(): void {
  for (const cb of listeners) cb();
  window.dispatchEvent(new CustomEvent("mortar:squad"));
}

export function isSquadMember(): boolean {
  return session !== null && !fatal;
}

/** Командир і мінометники бачать розрахунок і журнал; солдат — лише карту й мітки. Поза відділенням усе доступно. */
export function mayUseSolution(): boolean {
  return !session || fatal !== null || (me ? canUseSolution(me.role) : true);
}

/** Для нової мітки: id кімнати, якщо відділення діє на цьому терені (мітка стане спільною). */
export function squadScope(terrainId: string): string | undefined {
  return session && !fatal && phase === "active" && session.terrain === terrainId ? session.room : undefined;
}

export interface MarkRights {
  /** Можна ставити свій міномет. */
  friendMortar: boolean;
  /** Можна міняти вид, приналежність і назву. */
  edit: boolean;
  caption: boolean;
  remove: boolean;
}

const ALL_RIGHTS: MarkRights = { friendMortar: true, edit: true, caption: true, remove: true };

/** Що дозволено з міткою (нова — без аргументу) за роллю у відділенні; поза відділенням і для локальних міток — усе. */
export function markRights(marker?: Marker): MarkRights {
  if (!session || fatal || !me) return ALL_RIGHTS;
  if (marker ? marker.sq !== session.room : squadScope(getRoot().cur) === undefined) return ALL_RIGHTS;
  const friendMortar = canCreate(me.role, "friend", "mortar");
  if (!marker) return { ...ALL_RIGHTS, friendMortar };
  if (!marker.aff || marker.kind === "legacy") return ALL_RIGHTS;
  const ref = { aff: marker.aff, kind: marker.kind, own: isOwnMark(marker.id) };
  return { friendMortar, edit: canEdit(me.role, ref), caption: canCaption(me.role, ref), remove: canDelete(me.role, ref) };
}

/** Мітку відділення не можна міняти, коли гру закінчено. */
export function markLocked(marker: Marker): boolean {
  return !!session && marker.sq === session.room && (phase === "ended" || fatal !== null);
}

export function memberName(id: string | undefined): string {
  if (!id) return "";
  return members.find((m) => m.id === id)?.callsign ?? "";
}

/** Автор мітки відділення (позивний) і час її останньої зміни. */
export function markAuthor(id: string): { name: string; at: number } | null {
  const m = sync?.get(id);
  return m ? { name: memberName(m.by), at: m.at } : null;
}

export function isOwnMark(id: string): boolean {
  const m = sync?.get(id);
  return !!m && !!session && m.by === session.memberId;
}

// ---------- сховище на пристрої ----------

function save(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (!session || !sync) localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, JSON.stringify({ session, sync: sync.toJSON(), logs: pendingLogs } satisfies Saved));
    } catch {
      /* сховище недоступне — відділення працює до закриття сторінки */
    }
  }, 150);
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    return s && s.session && typeof s.session.room === "string" && typeof s.session.key === "string" && s.sync ? s : null;
  } catch {
    return null;
  }
}

// ---------- перетворення міток ----------

function toWanted(m: Marker): Wanted | null {
  if (!m.aff || m.kind === "legacy") return null;
  return {
    id: m.id,
    aff: m.aff,
    kind: m.kind,
    name: m.name,
    caption: m.caption ?? "",
    x: m.x,
    z: m.z,
    u: m.h,
    w: m.aff === "friend" && m.kind === "mortar" ? m.w : "",
    destroyed: !!m.destroyed
  };
}

function fromSquad(m: SquadMark, room: string, old?: Marker): Marker {
  const type = typeOf(m.aff, m.kind);
  return {
    id: m.id,
    name: m.name,
    type,
    x: m.x,
    z: m.z,
    h: m.u,
    w: m.w === "2B14" || m.w === "M252" ? m.w : (old?.w ?? "M252"),
    folder: old?.folder ?? "",
    u: m.ut,
    aff: m.aff,
    kind: m.kind,
    ...(m.caption ? { caption: m.caption } : {}),
    c: m.at,
    ...(m.destroyed && type !== "mortar" ? { destroyed: true } : {}),
    sq: room
  };
}

function terrainData(): TerrainState | null {
  // власні ключі: «__proto__» і подібні не можуть стати терном
  return session && Object.hasOwn(getRoot().data, session.terrain) ? getRoot().data[session.terrain] : null;
}

/** Мітки відділення на його терені (те, що користувач бачить і змінює). */
function wantedNow(): Wanted[] {
  const d = terrainData();
  if (!d || !session) return [];
  return d.markers.filter((m) => m.sq === session!.room).flatMap((m) => toWanted(m) ?? []);
}

function applyMarks(marks: SquadMark[]): void {
  const d = terrainData();
  if (!d || !session) return;
  const room = session.room;
  const old = new Map(d.markers.filter((m) => m.sq === room).map((m) => [m.id, m]));
  d.markers = [...d.markers.filter((m) => m.sq !== room), ...marks.map((m) => fromSquad(m, room, old.get(m.id)))];
}

function applyChange(id: string, mark: SquadMark | null): void {
  const d = terrainData();
  if (!d || !session) return;
  const room = session.room;
  const i = d.markers.findIndex((m) => m.id === id && m.sq === room);
  if (!mark) {
    if (i >= 0) d.markers.splice(i, 1);
    return;
  }
  const next = fromSquad(mark, room, i >= 0 ? d.markers[i] : undefined);
  if (i >= 0) d.markers[i] = next;
  else d.markers.push(next);
}

/** Змінює стан застосунку від імені сервера так, щоб це не породило нових дій. */
function applyFromServer(fn: () => void): void {
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
  scheduleSave();
  save();
  emit();
}

// ---------- з'єднання ----------

function send(obj: Record<string, unknown>): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...obj }));
  return true;
}

function setLink(next: Link): void {
  if (link === next) return;
  link = next;
  emit();
}

function connect(hello: { code?: string }): void {
  if (!session || fatal) return;
  clearTimeout(retryTimer);
  const s = session;
  setLink("connecting");
  let sock: WebSocket;
  try {
    sock = new WebSocket(socketUrl(s.room));
  } catch {
    scheduleRetry();
    return;
  }
  ws = sock;
  sent = new Set();
  sock.onopen = () => {
    if (ws !== sock) return;
    sock.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, code: hello.code ?? s.code ?? "", callsign: s.callsign, ...(s.key ? { key: s.key } : {}) }));
    clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ t: "ping" }), PING_MS);
  };
  sock.onmessage = (e) => {
    if (ws !== sock || typeof e.data !== "string") return;
    let msg: ServerMsg | { t: "pong" };
    try {
      msg = JSON.parse(e.data) as ServerMsg;
    } catch {
      return;
    }
    if (msg.t !== ("pong" as string)) onMessage(msg as ServerMsg);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    clearInterval(pingTimer);
    setLink("offline");
    if (session && !fatal) scheduleRetry();
  };
  sock.onerror = () => {
    /* закриття обробить onclose */
  };
}

function scheduleRetry(): void {
  clearTimeout(retryTimer);
  const wait = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
  attempt++;
  retryTimer = setTimeout(() => connect({}), wait);
}

function disconnect(): void {
  clearTimeout(retryTimer);
  clearInterval(pingTimer);
  const old = ws;
  ws = null;
  try {
    old?.close();
  } catch {
    /* вже закрито */
  }
  setLink("offline");
}

function onMessage(msg: ServerMsg): void {
  if (!session || !sync) return;
  switch (msg.t) {
    case "welcome":
      // новий учасник отримує ключ; пристрій, що повернувся, лишає свій
      session = { ...session, memberId: msg.memberId, ...(msg.key ? { key: msg.key } : {}) };
      save();
      break;
    case "snapshot": {
      attempt = 0;
      me = { role: msg.you.role, editor: msg.you.editor };
      members = msg.members;
      phase = msg.phase;
      if (msg.terrain && msg.terrain !== session.terrain) session = { ...session, terrain: msg.terrain };
      const squadTerrain = session.terrain;
      if (squadTerrain && squadTerrain !== getRoot().cur && Object.hasOwn(getRoot().data, squadTerrain) && !wasShownOnce) {
        wasShownOnce = true;
        switchTerrain(squadTerrain);
        window.dispatchEvent(new CustomEvent("mortar:squad-terrain"));
      }
      const marks = sync.onSnapshot(msg.marks);
      applyFromServer(() => {
        applyMarks(marks);
        if (msg.log) mergeLog(msg.log);
      });
      setLink("online");
      pendingLogs = pendingLogs.filter((e) => !msg.log?.some((l) => l.id === e.id));
      if (msg.report) setReport(msg.report, true);
      drain();
      flushLogs();
      break;
    }
    case "op": {
      const ch = sync.onOp(msg);
      sent.delete(msg.opId);
      if (ch) {
        applyFromServer(() => applyChange(ch.id, ch.mark));
        if (msg.op.k === "create" && ch.mark && msg.by !== session.memberId) {
          toast(t("squadAdded", { who: memberName(msg.by) || "?", what: ch.mark.name || t(kindKey(ch.mark.kind)) }));
        }
      } else save();
      emit();
      break;
    }
    case "ack":
      sync.onAck(msg.opId);
      sent.delete(msg.opId);
      save();
      emit();
      break;
    case "reject":
      if (msg.reason === "rate") {
        // не втрачаємо дію: повторимо трохи згодом
        sent.delete(msg.opId);
        scheduleDrain(15_000);
      } else {
        sync.onReject(msg.opId);
        sent.delete(msg.opId);
        toast(t(msg.reason === "permission" ? "squadDenied" : msg.reason === "ended" ? "squadEnded" : "squadRejected"));
        send({ t: "sync" });
      }
      save();
      emit();
      break;
    case "members":
      members = msg.members;
      emit();
      break;
    case "log":
      applyFromServer(() => mergeLog([msg.entry]));
      pendingLogs = pendingLogs.filter((e) => e.id !== (msg.entry as { id: string }).id);
      break;
    case "terrain":
      session = { ...session, terrain: msg.id };
      save();
      emit();
      window.dispatchEvent(new CustomEvent("mortar:squad-terrain"));
      break;
    case "code":
      session = { ...session, code: msg.code };
      save();
      emit();
      break;
    case "ended":
      phase = "ended";
      setReport(msg.report, true);
      toast(t("squadEnded"));
      emit();
      break;
    case "reportEdit": {
      const next = report && reportFromServer ? applyReportEdit(report, msg.edit) : null;
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

let wasShownOnce = false;

function kindKey(kind: SquadMark["kind"]): "kindInfantry" | "kindArmour" | "kindMortar" | "kindHelicopter" | "kindRetreat" {
  return ({ infantry: "kindInfantry", armour: "kindArmour", mortar: "kindMortar", helicopter: "kindHelicopter", retreat: "kindRetreat" } as const)[kind];
}

function onFatal(code: string): void {
  if (code === "removed") {
    fatal = "removed";
    disconnect();
    toast(t("squadKicked"), 5000);
    emit();
  } else if (code === "gone") {
    toast(t(exporting ? "repExported" : "squadGone"), 5000);
    exporting = false;
    clearLocal(true);
  } else if (code === "version") {
    disconnect();
    toast(t("squadVersion"), 5000);
  }
}

// ---------- журнал ----------

function mergeLog(entries: unknown[]): void {
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
  if (!session || fatal || phase !== "active" || !me || !canUseSolution(me.role) || session.terrain !== getRoot().cur) return;
  pendingLogs.push(entry);
  save();
  flushLogs();
  emit();
}

function flushLogs(): void {
  if (link !== "online") return;
  for (const e of pendingLogs) send({ t: "log", opId: "l" + e.id, entry: e });
}

// ---------- надсилання змін ----------

onStateChanged(() => {
  if (!session || !sync || applying) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushLocalChanges, PUSH_DELAY_MS);
});

function pushLocalChanges(): void {
  if (!session || !sync || fatal || phase !== "active") return;
  if (sync.diff(wantedNow()).length) {
    save();
    emit();
  }
  drain();
}

function scheduleDrain(ms: number): void {
  clearTimeout(drainTimer);
  drainTimer = setTimeout(drain, ms);
}

/** Надсилає чергу, не перевищуючи ліміт сервера; решта піде згодом. */
function drain(): void {
  if (!sync || link !== "online") return;
  const now = Date.now();
  sentAt = sentAt.filter((x) => now - x < 60_000);
  for (const p of sync.pending) {
    if (sent.has(p.opId)) continue;
    if (sentAt.length >= SEND_PER_MINUTE) {
      scheduleDrain(Math.max(1000, 60_000 - (now - sentAt[0]) + 50));
      return;
    }
    if (!send({ t: "op", opId: p.opId, op: p.op })) return;
    sent.add(p.opId);
    sentAt.push(now);
  }
}

// ---------- керування відділенням ----------

function begin(s: Session, dump?: SyncDump): void {
  session = s;
  sync = new SquadSync(s.memberId, { dump });
  me = null;
  members = [];
  phase = "active";
  fatal = null;
  wasShownOnce = false;
  attempt = 0;
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

/** Подальше життя відділення після виходу: лишити мітки як локальні чи прибрати. */
function clearLocal(keepMarks: boolean): void {
  const room = session?.room;
  const d = terrainData();
  if (room && d) {
    if (keepMarks) {
      for (const m of d.markers) if (m.sq === room) delete m.sq;
    } else {
      d.markers = d.markers.filter((m) => m.sq !== room);
    }
  }
  disconnect();
  session = null;
  sync = null;
  me = null;
  members = [];
  pendingLogs = [];
  fatal = null;
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* немає сховища */
  }
  scheduleSave();
  emit();
}

export function leaveSquad(keepMarks: boolean): void {
  clearLocal(keepMarks);
}

/** Повторна спроба зайти (після того, як командир відновив доступ). */
export function retrySquad(): void {
  if (!session) return;
  fatal = null;
  attempt = 0;
  connect({});
  emit();
}

export function sendAdmin(action: AdminAction): void {
  send({ t: "admin", opId: newOpId(), action });
}

/** Командир додає свої локальні мітки поточного терену (він має збігатися з картою відділення) до спільних. */
export function shareLocalMarks(): number {
  const d = terrainData();
  if (!d || !session || getRoot().cur !== session.terrain) return 0;
  let n = 0;
  for (const m of d.markers) {
    if (!m.sq && m.aff && m.kind !== "legacy") {
      m.sq = session.room;
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
  pendingLogs = Array.isArray(saved.logs) ? saved.logs : [];
  wasShownOnce = true;
  connect({});
  emit();
  window.addEventListener("online", () => {
    if (session && !fatal && link === "offline") connect({});
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session && !fatal && link === "offline") connect({});
  });
}
