/**
 * Менеджер завантажених даних (лише ПК): що зберігається в папці даних застосунку — кеш онлайн-тайлів, імпортовані карти, висоти —
 * зі скільки місця й кнопками видалення. Видалення карти скидає її й у стані терену.
 */
import { PRESETS } from "@core/terrains";
import { bundledMap } from "@core/bundledMaps";
import { $, ask, toast } from "./dom";
import { t } from "./i18n";
import { forgetHeights } from "./terrainHeight";
import { getRoot, scheduleSave } from "./state";

interface Hooks {
  /** Карта терену змінилась (видалена): перемалювати. */
  onMapChanged: () => void;
}

type Kind = "tiles" | "map" | "heights";

function fmtSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} ${t("unitGb")}`;
  if (mb >= 10) return `${Math.round(mb)} ${t("unitMb")}`;
  return `${mb.toFixed(1)} ${t("unitMb")}`;
}

function terrainName(id: string): string {
  return PRESETS.find((p) => p.id === id)?.name ?? getRoot().customTerrains.find((c) => c.id === id)?.name ?? id;
}

export function initStoragePanel(hooks: Hooks): void {
  const dlg = $<HTMLDialogElement>("storageDlg");
  const list = $("storageList");
  const total = $("storageTotal");

  async function remove(id: string, kind: Kind, label: string): Promise<void> {
    const ok = await ask(t("storageDeleteTitle"), t("storageDeleteText", { what: label, name: terrainName(id) }), t("deleteBtn"));
    if (!ok) return;
    try {
      await window.api.storage.remove(id, kind);
    } catch (err) {
      toast(String((err as Error).message ?? err));
      return;
    }
    const S = getRoot().data[id];
    if (kind === "map" && S) {
      // власний імпорт прибрано: лишається вбудована карта (якщо є) або порожня сітка
      const bm = bundledMap(id);
      S.map = bm ? { kind: "pyramid", width: bm.width, height: bm.height } : { kind: "none" };
      scheduleSave();
      hooks.onMapChanged();
    } else if (kind === "heights" && S) {
      S.heights = null;
      forgetHeights(id);
      scheduleSave();
    }
    toast(t("storageDeleted"));
    await refresh();
  }

  async function refresh(): Promise<void> {
    list.textContent = t("storageLoading");
    total.textContent = "";
    const entries = await window.api.storage.list();
    list.textContent = "";
    if (!entries.length) {
      list.textContent = t("storageEmpty");
      return;
    }
    let sum = 0;
    for (const e of entries) {
      sum += e.tilesBytes + e.mapBytes + e.heightsBytes;
      const box = document.createElement("div");
      box.className = "storage-item";
      const head = document.createElement("div");
      head.className = "storage-head";
      head.textContent = terrainName(e.id);
      box.appendChild(head);
      const rows: [Kind, string, number, number][] = [
        ["map", t("storageMap"), e.mapBytes, e.mapFiles],
        ["tiles", t("storageTiles"), e.tilesBytes, e.tilesFiles],
        ["heights", t("storageHeights"), e.heightsBytes, e.heightsBytes > 0 ? 1 : 0]
      ];
      for (const [kind, label, bytes, files] of rows) {
        if (bytes <= 0) continue;
        const row = document.createElement("div");
        row.className = "storage-row";
        const txt = document.createElement("span");
        txt.textContent = `${label}: ${fmtSize(bytes)}${kind === "heights" ? "" : ` · ${files} ${t("storageFiles")}`}`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn small danger";
        btn.textContent = t("deleteBtn");
        btn.onclick = () => void remove(e.id, kind, label);
        row.append(txt, btn);
        box.appendChild(row);
      }
      list.appendChild(box);
    }
    total.textContent = t("storageTotal", { size: fmtSize(sum) });
  }

  const rootPath = $("storageRootPath");
  const rootMsg = $("storageRootMsg");
  const rootChange = $<HTMLButtonElement>("storageRootChange");
  const rootReset = $<HTMLButtonElement>("storageRootReset");

  async function refreshRoot(): Promise<void> {
    const r = await window.api.storage.root();
    rootPath.textContent = r.path;
    rootReset.hidden = r.isDefault;
  }

  /** Переносить дані в нову папку (target) або повертає типову (null); поки йде копіювання, кнопки вимкнені. */
  async function moveTo(target: string | null): Promise<void> {
    rootChange.disabled = rootReset.disabled = true;
    rootMsg.textContent = t("storageRootMoving");
    try {
      await window.api.storage.moveRoot(target);
      rootMsg.textContent = t("storageRootMoved");
    } catch (err) {
      rootMsg.textContent = String((err as Error).message ?? err);
    } finally {
      rootChange.disabled = rootReset.disabled = false;
    }
    await refreshRoot();
    await refresh();
  }

  rootChange.onclick = () => {
    void (async () => {
      const picked = await window.api.storage.chooseRoot();
      if (!picked) return;
      const ok = await ask(t("storageRootTitle"), t("storageRootText", { path: picked }), t("storageRootGo"));
      if (ok) await moveTo(picked);
    })();
  };
  rootReset.onclick = () => {
    void (async () => {
      const ok = await ask(t("storageRootTitle"), t("storageRootTextDefault"), t("storageRootGo"));
      if (ok) await moveTo(null);
    })();
  };

  $<HTMLButtonElement>("storageOpen").onclick = () => {
    dlg.showModal();
    rootMsg.textContent = "";
    void refreshRoot();
    void refresh();
  };
  $<HTMLButtonElement>("storageRefresh").onclick = () => void refresh();
  $<HTMLButtonElement>("storageClose").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
}
