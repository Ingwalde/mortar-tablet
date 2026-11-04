import { inviteLink } from "@core/squad/config";
import { type MemberInfo, type Role } from "@core/squad/protocol";
import { newOpId } from "@core/squad/sync";
import { canCaption, canCreate, canDelete, canEdit, canEditReport, canUseSolution } from "@core/squad/permissions";
import { readReport, type Report, type ReportEdit } from "@core/squad/report";
import { getRoot, type Marker } from "../state";
import { REPORT_KEY, emit, st, type Link, type Session } from "./state";
import { send } from "./socket";

// ---------- доступ для інтерфейсу ----------

export const squadInfo = {
  get session(): Session | null {
    return st.session;
  },
  get link(): Link {
    return st.link;
  },
  get role(): Role | null {
    return st.me?.role ?? null;
  },
  get editor(): boolean {
    return st.me?.editor ?? false;
  },
  get members(): MemberInfo[] {
    return st.members;
  },
  get phase(): "active" | "ended" {
    return st.phase;
  },
  get removed(): boolean {
    return st.fatal === "removed";
  },
  get pending(): number {
    return (st.sync?.pending.length ?? 0) + st.pendingLogs.length;
  },
  get link_(): string | null {
    return st.session?.code ? inviteLink(st.session.room, st.session.code) : null;
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

st.report = readStoredReport();

export function setReport(r: Report | null, fromServer: boolean): void {
  st.report = r;
  st.reportFromServer = fromServer && r !== null;
  try {
    if (r) localStorage.setItem(REPORT_KEY, JSON.stringify(r));
    else localStorage.removeItem(REPORT_KEY);
  } catch {
    /* сховище недоступне: звіт лишиться до закриття сторінки */
  }
}

export const reportInfo = {
  get report(): Report | null {
    return st.report;
  },
  /** Звіт можна правити: гру закінчено, ми в відділенні й маємо на це право. */
  get editable(): boolean {
    return !!st.session && !st.fatal && st.phase === "ended" && st.reportFromServer && !!st.me && canEditReport(st.me.role, st.me.editor);
  }
};

export function editReport(edit: ReportEdit): void {
  send({ t: "report", opId: newOpId(), edit });
}

/** Звіт збережено у файл: сервер може забути відділення. */
export function reportExported(): void {
  st.exporting = true;
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

export function isSquadMember(): boolean {
  return st.session !== null && !st.fatal;
}

/** Командир і мінометники бачать розрахунок і журнал; солдат — лише карту й мітки. Поза відділенням усе доступно. */
export function mayUseSolution(): boolean {
  return !st.session || st.fatal !== null || (st.me ? canUseSolution(st.me.role) : true);
}

/** Для нової мітки: id кімнати, якщо відділення діє на цьому терені (мітка стане спільною). */
export function squadScope(terrainId: string): string | undefined {
  return st.session && !st.fatal && st.phase === "active" && st.session.terrain === terrainId ? st.session.room : undefined;
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
  if (!st.session || st.fatal || !st.me) return ALL_RIGHTS;
  if (marker ? marker.sq !== st.session.room : squadScope(getRoot().cur) === undefined) return ALL_RIGHTS;
  const friendMortar = canCreate(st.me.role, "friend", "mortar");
  if (!marker) return { ...ALL_RIGHTS, friendMortar };
  if (!marker.aff || marker.kind === "legacy") return ALL_RIGHTS;
  const ref = { aff: marker.aff, kind: marker.kind, own: isOwnMark(marker.id) };
  return { friendMortar, edit: canEdit(st.me.role, ref), caption: canCaption(st.me.role, ref), remove: canDelete(st.me.role, ref) };
}

/** Мітку відділення не можна міняти, коли гру закінчено. */
export function markLocked(marker: Marker): boolean {
  return !!st.session && marker.sq === st.session.room && (st.phase === "ended" || st.fatal !== null);
}

export function memberName(id: string | undefined): string {
  if (!id) return "";
  return st.members.find((m) => m.id === id)?.callsign ?? "";
}

/** Автор мітки відділення (позивний) і час її останньої зміни. */
export function markAuthor(id: string): { name: string; at: number } | null {
  const m = st.sync?.get(id);
  return m ? { name: memberName(m.by), at: m.at } : null;
}

export function isOwnMark(id: string): boolean {
  const m = st.sync?.get(id);
  return !!m && !!st.session && m.by === st.session.memberId;
}
