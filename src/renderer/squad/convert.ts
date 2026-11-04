import { type SquadMark } from "@core/squad/protocol";
import { type Wanted } from "@core/squad/sync";
import { typeOf } from "@core/marks";
import { getRoot, scheduleSave, type Marker, type TerrainState } from "../state";
import { emit, st } from "./state";
import { save } from "./storage";

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

export function terrainData(): TerrainState | null {
  // власні ключі: «__proto__» і подібні не можуть стати терном
  return st.session && Object.hasOwn(getRoot().data, st.session.terrain) ? getRoot().data[st.session.terrain] : null;
}

/** Мітки відділення на його терені (те, що користувач бачить і змінює). */
export function wantedNow(): Wanted[] {
  const d = terrainData();
  if (!d || !st.session) return [];
  return d.markers.filter((m) => m.sq === st.session!.room).flatMap((m) => toWanted(m) ?? []);
}

export function applyMarks(marks: SquadMark[]): void {
  const d = terrainData();
  if (!d || !st.session) return;
  const room = st.session.room;
  const old = new Map(d.markers.filter((m) => m.sq === room).map((m) => [m.id, m]));
  d.markers = [...d.markers.filter((m) => m.sq !== room), ...marks.map((m) => fromSquad(m, room, old.get(m.id)))];
}

export function applyChange(id: string, mark: SquadMark | null): void {
  const d = terrainData();
  if (!d || !st.session) return;
  const room = st.session.room;
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
export function applyFromServer(fn: () => void): void {
  st.applying = true;
  try {
    fn();
  } finally {
    st.applying = false;
  }
  scheduleSave();
  save();
  emit();
}
