/**
 * Папка, де на ПК лежать завантажені дані: кеш онлайн-тайлів, імпортовані карти, висоти. За замовчуванням це папка даних
 * застосунку; інсталятор або менеджер даних можуть вказати іншу (наприклад, великий диск), запам'ятовується в `data-dir.txt`.
 * Тут лише чиста логіка шляхів (перевіряється тестами); читання й запис файлу — в src/main/dataRoot.ts.
 */

/** Абсолютний шлях Windows (диск з двокрапкою або мережевий `//server/share`) чи POSIX (`/data/maps`). */
export function isAbsolutePath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(p) || p.startsWith("/");
}

/** Текст файлу з байтів: інсталятор Windows пише UTF-16 з BOM (у шляху може бути кирилиця), застосунок — UTF-8. */
export function decodeDataRootBytes(bytes: Uint8Array): string {
  return bytes[0] === 0xff && bytes[1] === 0xfe ? new TextDecoder("utf-16le").decode(bytes.subarray(2)) : new TextDecoder("utf-8").decode(bytes);
}

/** Читає вміст `data-dir.txt`: перший рядок без BOM і пробілів по краях; не абсолютний або порожній шлях — null. */
export function parseDataRootFile(text: string): string | null {
  const line = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0]?.trim() ?? "";
  if (!line || line.includes("\0") || !isAbsolutePath(line)) return null;
  return line.replace(/[\\/]+$/, "") || null;
}

const norm = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Чи `child` збігається з `parent` або лежить усередині нього (Windows не розрізняє регістр). */
export function isSameOrInside(parent: string, child: string): boolean {
  const a = norm(parent);
  const b = norm(child);
  return b === a || b.startsWith(a + "/");
}
