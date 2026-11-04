import { type MemberInfo, type Role } from "@core/squad/protocol";
import { SquadSync, type SyncDump } from "@core/squad/sync";
import { type Report } from "@core/squad/report";
import { type FireLogEntry } from "../state";

export const STORE_KEY = "mortar.squad.v1";

export const REPORT_KEY = "mortar.report.v1";

export const PUSH_DELAY_MS = 300;

export const PING_MS = 50_000;

/** Нижче за ліміт сервера (40 дій на хвилину): не надсилаємо швидше, ніж він приймає. */
export const SEND_PER_MINUTE = 30;

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

export interface Saved {
  session: Session;
  sync: SyncDump;
  logs: FireLogEntry[];
}

/** Спільний стан клієнта відділення: його читають і міняють модулі з'єднання, сховища, черги й журналу. */
export const st = {
  session: null as Session | null,
  sync: null as SquadSync | null,
  pendingLogs: [] as FireLogEntry[],
  ws: null as WebSocket | null,
  link: "offline" as Link,
  me: null as { role: Role; editor: boolean } | null,
  members: [] as MemberInfo[],
  phase: "active" as "active" | "ended",
  /** Звіт: від сервера (його можна правити) або відкритий із файлу (лише перегляд); зберігається між запусками. */
  report: null as Report | null,
  reportFromServer: false,
  exporting: false,
  fatal: null as "removed" | null,
  applying: false,
  sent: new Set<string>(),
  sentAt: [] as number[],
  attempt: 0,
  /** Карту відділення вже показано один раз після входу: далі терен не перемикається сам. */
  wasShownOnce: false,
  retryTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  pushTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  drainTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  pingTimer: undefined as ReturnType<typeof setInterval> | undefined,
  saveTimer: undefined as ReturnType<typeof setTimeout> | undefined
};

const listeners: Array<() => void> = [];

export function onSquadChange(cb: () => void): void {
  listeners.push(cb);
}

export function emit(): void {
  for (const cb of listeners) cb();
  window.dispatchEvent(new CustomEvent("mortar:squad"));
}
