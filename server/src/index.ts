/**
 * Реле режиму відділення: Worker приймає запити, а кожне відділення живе в одному Durable Object (SquadRoomDO).
 * Уся логіка прав і протоколу — в ../../src/core/squad (Room); тут лише транспорт, хешування й сховище.
 *
 *   POST /create          { callsign, terrain }  ->  { room, code, key, memberId }
 *   GET  /ws/<room>       WebSocket (Hibernation API), перше повідомлення — hello
 */
import { DurableObject } from "cloudflare:workers";
import { PROTOCOL_VERSION, parseClientMessage, readCallsign } from "../../src/core/squad/protocol";
import type { ErrorCode, ServerMsg } from "../../src/core/squad/protocol";
import { Room, type Effect } from "../../src/core/squad/room";

export interface Env {
  SQUAD: DurableObjectNamespace<SquadRoomDO>;
  GATE: DurableObjectNamespace<GateDO>;
  /** Скільки відділень можна створити з однієї адреси за добу. */
  CREATE_LIMIT_PER_DAY?: string;
  /** Скільки відділень можна створити на всьому сервері за добу (захист безкоштовного ліміту). */
  CREATE_LIMIT_GLOBAL_PER_DAY?: string;
  /** "1" — тимчасово не створювати нових відділень (наявні працюють). */
  CREATE_DISABLED?: string;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};

const PING = JSON.stringify({ t: "ping", v: PROTOCOL_VERSION });
const PONG = JSON.stringify({ t: "pong", v: PROTOCOL_VERSION });

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/create" && req.method === "POST") {
      if (env.CREATE_DISABLED === "1") return json({ error: "disabled" }, 503);
      // сміттєвий запит не має витрачати добовий ліміт: спершу перевіряємо тіло (розмір і заголовком, і за фактом: тіло без content-length теж обмежене)
      if (Number(req.headers.get("content-length") ?? "0") > 1024) return json({ error: "invalid" }, 413);
      let body: { callsign?: unknown; terrain?: unknown };
      try {
        const text = await req.text();
        if (text.length > 1024) return json({ error: "invalid" }, 413);
        body = JSON.parse(text) as { callsign?: unknown; terrain?: unknown };
      } catch {
        return json({ error: "invalid" }, 400);
      }
      if (!body || typeof body !== "object") return json({ error: "invalid" }, 400);
      const callsign = readCallsign(body.callsign);
      if (!callsign) return json({ error: "bad_callsign" }, 400);
      const terrain = typeof body.terrain === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.terrain) ? body.terrain : "";
      // обмеження створення: з однієї адреси й на весь сервер за добу; адреса не зберігається, лише її хеш на добу
      const day = new Date().toISOString().slice(0, 10);
      const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
      const perIp = env.GATE.get(env.GATE.idFromName("ip:" + (await sha256(ip + ":" + day))));
      const global = env.GATE.get(env.GATE.idFromName("all:" + day));
      // неправильне значення змінної (NaN) не повинно знімати ліміт: тоді діє типове
      const limitOf = (v: string | undefined, d: number): number => (Number.isFinite(Number(v)) && v !== undefined && v !== "" ? Number(v) : d);
      const limitIp = limitOf(env.CREATE_LIMIT_PER_DAY, 10);
      const limitAll = limitOf(env.CREATE_LIMIT_GLOBAL_PER_DAY, 300);
      if (!(await perIp.take(limitIp)) || !(await global.take(limitAll))) return json({ error: "limit" }, 429);
      const room = randomToken(16);
      const code = randomToken(16);
      const key = randomToken(32);
      const memberId = randomToken(8);
      const stub = env.SQUAD.get(env.SQUAD.idFromName(room));
      const ok = await stub.init({ joinHash: await sha256(code), memberId, callsign, keyHash: await sha256(key), terrain });
      return ok ? json({ room, code, key, memberId }) : json({ error: "unavailable" }, 503);
    }

    const m = /^\/ws\/([0-9a-f]{32})$/.exec(url.pathname);
    if (m && req.headers.get("upgrade") === "websocket") {
      return env.SQUAD.get(env.SQUAD.idFromName(m[1])).fetch(req);
    }
    return new Response("not found", { status: 404 });
  }
};

/** Лічильник створень за добу (по одному на адресу й один загальний); сам себе видаляє наприкінці доби. */
export class GateDO extends DurableObject<Env> {
  async take(limit: number): Promise<boolean> {
    const n = ((await this.ctx.storage.get<number>("n")) ?? 0) + 1;
    if (n > limit) return false;
    await this.ctx.storage.put("n", n);
    if (n === 1) await this.ctx.storage.setAlarm(Date.now() + 26 * 3600 * 1000);
    return true;
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

interface Attachment {
  memberId: string | null;
}

export class SquadRoomDO extends DurableObject<Env> {
  private room: Room | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    // після пробудження відновлюємо кімнату й лічильники підключених із сокетів, що пережили сон
    ctx.blockConcurrencyWhile(async () => {
      this.room = Room.restore(Object.fromEntries(await ctx.storage.list()));
      if (!this.room) return;
      for (const ws of ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Attachment | null;
        if (a?.memberId) this.room.connected(a.memberId);
      }
    });
  }

  /** Створення відділення (викликає Worker). Повертає false, якщо кімната вже є. */
  async init(i: { joinHash: string; memberId: string; callsign: string; keyHash: string; terrain: string }): Promise<boolean> {
    if (this.room) return false;
    this.room = Room.create({ ...i, now: Date.now() });
    await this.flush();
    return true;
  }

  async fetch(_req: Request): Promise<Response> {
    if (!this.room) return new Response("gone", { status: 404 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ memberId: null } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const room = this.room;
    if (!room) return this.fail(ws, "gone");
    const parsed = parseClientMessage(data);
    if (!parsed.ok) return this.fail(ws, parsed.code === "version" ? "version" : "invalid");
    const msg = parsed.msg;
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { memberId: null };
    const now = Date.now();

    if (msg.t === "hello") {
      if (att.memberId) return this.fail(ws, "invalid");
      const newKey = randomToken(32);
      const newId = randomToken(8);
      const r = room.hello({
        joinHash: await sha256(msg.code),
        callsign: msg.callsign,
        keyHash: msg.key ? await sha256(msg.key) : null,
        newMemberId: newId,
        newKeyHash: await sha256(newKey),
        now
      });
      if (!r.ok) return this.fail(ws, r.code);
      ws.serializeAttachment({ memberId: r.memberId } satisfies Attachment);
      const welcome: ServerMsg = { t: "welcome", v: PROTOCOL_VERSION, memberId: r.memberId, ...(r.isNew ? { key: newKey } : {}) };
      ws.send(JSON.stringify(welcome));
      await this.dispatch([...r.effects, ...room.connected(r.memberId)]);
      return;
    }

    const id = att.memberId;
    if (!id) return this.fail(ws, "invalid");
    if (msg.t === "admin" && msg.action.a === "rotate") {
      if (room.roleOf(id) !== "commander") {
        ws.send(JSON.stringify({ t: "reject", v: PROTOCOL_VERSION, opId: msg.opId, reason: "permission" } satisfies ServerMsg));
        return;
      }
      const code = randomToken(16);
      if (room.rotateJoin(id, await sha256(code), now)) ws.send(JSON.stringify({ t: "code", v: PROTOCOL_VERSION, code } satisfies ServerMsg));
      await this.flush();
      return;
    }
    await this.dispatch(room.handle(id, msg, now));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.left(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.left(ws);
  }

  async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    if (room.onAlarm(Date.now()) === "delete") await this.wipe();
    else await this.ctx.storage.setAlarm(room.alarmAt());
  }

  // ---------- внутрішнє ----------

  private async left(ws: WebSocket): Promise<void> {
    const id = (ws.deserializeAttachment() as Attachment | null)?.memberId;
    if (id && this.room) await this.dispatch(this.room.disconnected(id));
  }

  private fail(ws: WebSocket, code: ErrorCode): void {
    try {
      ws.send(JSON.stringify({ t: "error", v: PROTOCOL_VERSION, code } satisfies ServerMsg));
      ws.close(1008, code);
    } catch {
      /* сокет уже закрито */
    }
  }

  private async dispatch(effects: Effect[]): Promise<void> {
    const room = this.room;
    if (!room) return;
    await this.flush();
    const sockets = this.ctx.getWebSockets();
    for (const e of effects) {
      if (e.k === "wipe") return this.wipe();
      for (const ws of sockets) {
        const id = (ws.deserializeAttachment() as Attachment | null)?.memberId;
        if (!id) continue;
        try {
          if (e.k === "close") {
            if (id === e.member) {
              ws.send(JSON.stringify({ t: "error", v: PROTOCOL_VERSION, code: e.code } satisfies ServerMsg));
              ws.close(1008, e.code);
            }
          } else if (room.accepts(e.aud, id)) ws.send(JSON.stringify(e.msg));
        } catch (err) {
          // сокет закрито — прибере webSocketClose; причину лишаємо в журналі Worker, щоб було видно втрати
          console.warn("send failed", String(err));
        }
      }
    }
  }

  /** Записує зміни кімнати в сховище й ставить будильник видалення. */
  private async flush(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const ch = room.takeChanges();
    if (Object.keys(ch.puts).length) await this.ctx.storage.put(ch.puts);
    if (ch.deletes.length) await this.ctx.storage.delete(ch.deletes);
    await this.ctx.storage.setAlarm(room.alarmAt());
  }

  private async wipe(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(JSON.stringify({ t: "error", v: PROTOCOL_VERSION, code: "gone" } satisfies ServerMsg));
        ws.close(1000, "gone");
      } catch {
        /* вже закрито */
      }
    }
    this.room = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

