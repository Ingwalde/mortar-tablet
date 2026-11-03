import { ALL_FOLDERS, getCurrent, getFolderNames, getRoot, scheduleSave } from "../state";
import { $, ask, toast } from "../dom";
import { t } from "../i18n";
import { openSettings } from "../settingsPanel";
import { isRemote } from "../platform";
import { vibrate as haptic } from "../haptics";
import { renderAll } from "./renderHub";

let selectedId: string | null = null;

export function getSelectedId(): string | null {
  return selectedId;
}

export function setSelectedId(id: string | null): void {
  selectedId = id;
}

// ---------- folders/missions ----------
export function fillFolderSelect(): void {
  const sel = $<HTMLSelectElement>("folderSel");
  const S = getCurrent();
  sel.textContent = "";
  sel.add(new Option(t("allFolders"), ALL_FOLDERS));
  for (const f of getFolderNames()) sel.add(new Option(f || t("noFolder"), f));
  if (![...sel.options].some((o) => o.value === S.sel.folder)) S.sel.folder = ALL_FOLDERS;
  sel.value = S.sel.folder;
}

$<HTMLSelectElement>("folderSel").onchange = (e) => {
  getCurrent().sel.folder = (e.target as HTMLSelectElement).value;
  scheduleSave();
  renderAll();
};

/** Останньо використана папка — типове значення для нової мітки. */
export function lastUsedFolder(): string {
  const S = getCurrent();
  return S.sel.folder === ALL_FOLDERS ? "" : S.sel.folder;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(t("copied"));
  } catch {
    if (isRemote) {
      // На телефоні поля резервної копії нема — показуємо текст у діалозі.
      await ask(t("copyManualTitle"), "", t("closeBtn"), [{ key: "v", label: t("copyManualLabel"), value: text }]);
      return;
    }
    const box = $<HTMLTextAreaElement>("json");
    box.value = text;
    openSettings("backup");
    box.select();
    toast(t("copyFromField"));
  }
}

/** Вібрація, якщо вона ввімкнена в налаштуваннях і підтримується пристроєм. */
export function vibrate(ms: number): void {
  if (getRoot().vibration) haptic(ms);
}
