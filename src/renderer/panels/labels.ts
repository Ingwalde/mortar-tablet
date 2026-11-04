import { type WeaponId } from "@core/ballistics";
import { getCurrent, type MarkerType } from "../state";
import { t } from "../i18n";
import { typeOf, type Affiliation, type MarkKind } from "@core/marks";
import { ageOf } from "@core/age";

export function typeLabel(type: MarkerType): string {
  return { mortar: t("typeMortar"), target: t("typeTarget"), point: t("typePoint") }[type];
}

export const KIND_KEYS = { infantry: "kindInfantry", armour: "kindArmour", mortar: "kindMortar", helicopter: "kindHelicopter", retreat: "kindRetreat" } as const;

/** Підпис виду мітки; для старої довільної точки — «Точка». */
export function kindLabel(m: { kind: MarkKind; type: MarkerType }): string {
  return m.kind === "legacy" ? typeLabel(m.type) : t(KIND_KEYS[m.kind]);
}

export function weaponName(w: WeaponId): string {
  return { M252: t("weaponShortM252"), "2B14": t("weaponShort2B14") }[w];
}

export function shellName(k: string): string {
  return ({ HE: t("shellHE"), Smoke: t("shellSmoke"), Illumination: t("shellIllumination") } as Record<string, string>)[k] ?? k;
}

export function nextName(aff: Affiliation | undefined, kind: MarkKind): string {
  const n = getCurrent().markers.filter((m) => m.aff === aff && m.kind === kind).length + 1;
  return kindLabel({ kind, type: typeOf(aff, kind) }) + " " + n;
}

export function ageText(updatedAt: number): string {
  const a = ageOf(updatedAt);
  return a.unit === "now" ? t("ageNow") : t(a.unit === "min" ? "ageMin" : a.unit === "h" ? "ageHour" : "ageDay", { n: a.n });
}
