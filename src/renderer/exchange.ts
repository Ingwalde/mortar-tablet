/**
 * Імпорт/експорт міток за папкою (місією): діалоги «Експорт…» і «Імпорт…» на вкладці «Мітки».
 * Формат і злиття — у core/markerExchange.ts. Працює на ПК і на телефоні (текст, файл, «Поділитись»).
 */
import {
  buildExport,
  exchangeFileName,
  mergeImported,
  parseExchange,
  serializeExport,
  type ParseResult,
  type XMarker,
  type XMarkerType
} from "@core/markerExchange";
import { MAX_QR_URL_LENGTH, buildShareUrl, encodeShare, extractSharePayload, shareToExchangeText } from "@core/shareLink";
import { $, ask, showModalNoKeyboard, toast } from "./dom";
import { t } from "./i18n";
import { ALL_FOLDERS, currentMeta, getCurrent, getFolderNames, getRoot, scheduleSave, uid, type Marker } from "./state";

const KEEP = "__keep";
const NEW = "__new";

interface Hooks {
  /** Перемалювати списки й карту після зміни міток. */
  renderAll: () => void;
  /** Перемкнути поточний терен (для імпорту за посиланням з іншої карти). */
  switchTerrain: (id: string) => void;
}

let hooksRef: Hooks | null = null;

function pickedTypes(): Set<XMarkerType> {
  const s = new Set<XMarkerType>();
  if ($<HTMLInputElement>("exTarget").checked) s.add("target");
  if ($<HTMLInputElement>("exPoint").checked) s.add("point");
  if ($<HTMLInputElement>("exMortar").checked) s.add("mortar");
  return s;
}

function exportFolderValue(): string | null {
  const v = $<HTMLSelectElement>("exFolder").value;
  return v === ALL_FOLDERS ? null : v;
}

function buildText(): { text: string; count: number; fileName: string } {
  const meta = currentMeta();
  const folder = exportFolderValue();
  const now = Date.now();
  const doc = buildExport(getCurrent().markers as XMarker[], {
    terrain: meta.id,
    terrainName: meta.name,
    folder,
    types: pickedTypes(),
    now
  });
  return { text: serializeExport(doc), count: doc.markers.length, fileName: exchangeFileName(meta.id, folder, now) };
}

async function currentShareUrl(): Promise<string> {
  const meta = currentMeta();
  const doc = buildExport(getCurrent().markers as XMarker[], {
    terrain: meta.id,
    terrainName: meta.name,
    folder: exportFolderValue(),
    types: pickedTypes(),
    now: Date.now()
  });
  return buildShareUrl(await encodeShare(doc));
}

async function showQr(): Promise<void> {
  const box = $("exQrBox");
  const hint = $("exQrHint");
  const img = $<HTMLImageElement>("exQrImg");
  const url = await currentShareUrl();
  box.hidden = false;
  if (url.length > MAX_QR_URL_LENGTH) {
    img.hidden = true;
    hint.textContent = t("exQrTooBig");
    return;
  }
  const QRCode = (await import("qrcode")).default;
  img.src = await QRCode.toDataURL(url, { errorCorrectionLevel: "L", margin: 2, width: 280 });
  img.hidden = false;
  hint.textContent = t("exQrHint");
}

function refreshExport(): void {
  const { text, count } = buildText();
  $("exQrBox").hidden = true;
  for (const id of ["exLink", "exQr"]) $<HTMLButtonElement>(id).disabled = count === 0;
  $<HTMLTextAreaElement>("exText").value = count ? text : "";
  $("exCount").textContent = count ? t("exCount", { n: count }) : t("exEmpty");
  for (const id of ["exCopy", "exShare", "exFile"]) $<HTMLButtonElement>(id).disabled = count === 0;
}

function fillFolders(sel: HTMLSelectElement, opts: { all?: string; keep?: boolean; extra?: boolean }): void {
  sel.textContent = "";
  if (opts.all) sel.add(new Option(opts.all, ALL_FOLDERS));
  if (opts.keep) sel.add(new Option(t("imKeep"), KEEP));
  for (const f of getFolderNames()) sel.add(new Option(f || t("noFolder"), f));
  if (opts.extra) sel.add(new Option(t("imNewFolder"), NEW));
}

async function copyToClipboard(text: string, area: HTMLTextAreaElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(t("copied"));
  } catch {
    area.focus();
    area.select();
    try {
      document.execCommand("copy");
      toast(t("copied"));
    } catch {
      toast(t("copyFromField"));
    }
  }
}

function downloadFile(name: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---- імпорт

let parsed: ParseResult | null = null;

function reasonText(r: ParseResult & { ok: false }): string {
  return t(r.reason === "empty" ? "imHint" : r.reason === "json" ? "imBadJson" : r.reason === "shape" ? "imBadShape" : "imNone");
}

function refreshImport(): void {
  const text = $<HTMLTextAreaElement>("imText").value;
  const info = $("imInfo");
  const go = $<HTMLButtonElement>("imGo");
  parsed = text.trim() ? parseExchange(text) : null;
  if (!parsed) {
    info.textContent = t("imHint");
    info.dataset.state = "";
    go.disabled = true;
    return;
  }
  if (!parsed.ok) {
    info.textContent = reasonText(parsed);
    info.dataset.state = "error";
    go.disabled = true;
    return;
  }
  const counts = { target: 0, point: 0, mortar: 0 };
  for (const m of parsed.markers) counts[m.type]++;
  const cur = currentMeta();
  const parts = [
    parsed.folder !== null ? t("imFolderInfo", { f: parsed.folder || t("noFolder") }) : "",
    t("imCounts", { t: counts.target, p: counts.point, m: counts.mortar }),
    parsed.skipped ? t("imSkipped", { n: parsed.skipped }) : ""
  ].filter(Boolean);
  let warn = "";
  if (parsed.terrain && parsed.terrain !== cur.id) {
    warn = " " + t("imTerrainMismatch", { from: parsed.terrainName ?? parsed.terrain, to: cur.name });
  }
  info.textContent = parts.join(" · ") + warn;
  info.dataset.state = warn ? "warn" : "ok";
  go.disabled = false;
}

async function doImport(hooks: Hooks): Promise<void> {
  if (!parsed || !parsed.ok) return;
  const cur = currentMeta();
  if (parsed.terrain && parsed.terrain !== cur.id) {
    const ok = await ask(
      t("imMismatchTitle"),
      t("imTerrainMismatch", { from: parsed.terrainName ?? parsed.terrain, to: cur.name }),
      t("imAnyway")
    );
    if (!ok) return;
  }
  const dest = $<HTMLSelectElement>("imFolder").value;
  let folder: string | null = null;
  if (dest === NEW) folder = $<HTMLInputElement>("imNewName").value.trim().slice(0, 40);
  else if (dest !== KEEP) folder = dest;
  const S = getCurrent();
  const res = mergeImported(S.markers as XMarker[], parsed.markers, { folder, now: Date.now(), newId: uid });
  S.markers = res.markers as Marker[];
  // імпорт «воскрешає» мітки, видалені раніше: прибираємо надгробки, щоб синхронізація їх не стерла
  for (const id of res.revived) delete S.deleted[id];
  scheduleSave();
  hooks.renderAll();
  toast(t("imDone", { a: res.added, u: res.updated, s: res.unchanged }), 4000);
  $<HTMLDialogElement>("importDlg").close();
}

function openImportDialog(prefill = ""): void {
  const dlg = $<HTMLDialogElement>("importDlg");
  $<HTMLTextAreaElement>("imText").value = prefill;
  fillFolders($<HTMLSelectElement>("imFolder"), { keep: true, extra: true });
  $<HTMLSelectElement>("imFolder").value = KEEP;
  $<HTMLInputElement>("imNewName").value = "";
  $("imNewRow").hidden = true;
  refreshImport();
  if (!dlg.open) showModalNoKeyboard(dlg);
}

/**
 * Вхідне посилання обміну (з адреси сторінки, з буфера чи з іншого застосунку): розпаковує мітки,
 * за потреби перемикає терен і відкриває імпорт із готовим вмістом. false — це не посилання обміну.
 */
export async function openIncomingShare(input: string): Promise<boolean> {
  if (!extractSharePayload(input)) return false;
  const text = await shareToExchangeText(input);
  if (!text) {
    toast(t("shareBad"), 4000);
    return true;
  }
  const pr = parseExchange(text);
  if (pr.ok && pr.terrain && pr.terrain !== currentMeta().id && Object.hasOwn(getRoot().data, pr.terrain)) hooksRef?.switchTerrain(pr.terrain);
  openImportDialog(text);
  return true;
}

export function initExchange(hooks: Hooks): void {
  hooksRef = hooks;
  const exDlg = $<HTMLDialogElement>("exportDlg");
  const imDlg = $<HTMLDialogElement>("importDlg");
  const closeOnBackdrop = (d: HTMLDialogElement): void => {
    d.addEventListener("click", (e) => {
      if (e.target === d) d.close();
    });
  };
  closeOnBackdrop(exDlg);
  closeOnBackdrop(imDlg);

  // ---- експорт
  $<HTMLButtonElement>("exportFolderBtn").onclick = () => {
    fillFolders($<HTMLSelectElement>("exFolder"), { all: t("allFolders") });
    const cur = getCurrent().sel.folder;
    const sel = $<HTMLSelectElement>("exFolder");
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : ALL_FOLDERS;
    $<HTMLButtonElement>("exShare").hidden = typeof navigator.share !== "function";
    refreshExport();
    showModalNoKeyboard(exDlg);
  };
  $<HTMLSelectElement>("exFolder").onchange = refreshExport;
  for (const id of ["exTarget", "exPoint", "exMortar"]) $<HTMLInputElement>(id).onchange = refreshExport;
  $<HTMLButtonElement>("exCopy").onclick = () => void copyToClipboard($<HTMLTextAreaElement>("exText").value, $<HTMLTextAreaElement>("exText"));
  // стиснення посилання (CompressionStream) може бути недоступним: покажемо повідомлення замість мовчазної помилки
  $<HTMLButtonElement>("exLink").onclick = async () => {
    try {
      await copyToClipboard(await currentShareUrl(), $<HTMLTextAreaElement>("exText"));
    } catch {
      toast(t("shareBad"), 4000);
    }
  };
  $<HTMLButtonElement>("exQr").onclick = () => void showQr().catch(() => toast(t("shareBad"), 4000));
  $<HTMLButtonElement>("exFile").onclick = () => {
    const { text, fileName } = buildText();
    downloadFile(fileName, text);
    toast(t("exSaved", { f: fileName }));
  };
  $<HTMLButtonElement>("exShare").onclick = async () => {
    const { text, fileName } = buildText();
    try {
      const file = new File([text], fileName, { type: "application/json" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: fileName });
      else await navigator.share({ title: fileName, text });
    } catch {
      // користувач скасував «Поділитись»
    }
  };
  $<HTMLButtonElement>("exClose").onclick = () => exDlg.close();

  // ---- імпорт
  $<HTMLButtonElement>("importFolderBtn").onclick = () => openImportDialog();
  // посилання, вставлене в поле, одразу розгортається в мітки
  const expandPastedLink = async (): Promise<void> => {
    const area = $<HTMLTextAreaElement>("imText");
    const v = area.value;
    if (!v.trim().startsWith("{") && extractSharePayload(v)) {
      const text = await shareToExchangeText(v);
      if (text) area.value = text;
      else toast(t("shareBad"), 4000);
    }
    refreshImport();
  };
  $<HTMLTextAreaElement>("imText").oninput = () => void expandPastedLink();
  $<HTMLButtonElement>("imPaste").onclick = async () => {
    try {
      $<HTMLTextAreaElement>("imText").value = await navigator.clipboard.readText();
      await expandPastedLink();
    } catch {
      toast(t("pasteFailed"), 3500);
    }
  };
  $<HTMLSelectElement>("imFolder").onchange = () => {
    $("imNewRow").hidden = $<HTMLSelectElement>("imFolder").value !== NEW;
  };
  $<HTMLButtonElement>("imPick").onclick = () => $<HTMLInputElement>("imFile").click();
  $<HTMLInputElement>("imFile").onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    $<HTMLTextAreaElement>("imText").value = await file.text();
    (e.target as HTMLInputElement).value = "";
    refreshImport();
  };
  $<HTMLButtonElement>("imGo").onclick = () => void doImport(hooks);
  $<HTMLButtonElement>("imClose").onclick = () => imDlg.close();
}
