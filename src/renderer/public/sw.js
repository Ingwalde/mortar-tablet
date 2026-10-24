/*
 * Service worker сайту (PWA). Працює лише в безпечному контексті (HTTPS або localhost).
 *
 * Що кешується:
 *  - оболонка застосунку (сторінка, скрипти, стилі, іконки) — одразу при встановленні;
 *  - тайли карт модів і висоти — коли їх уже завантажено.
 * Стан (мітки, журнал) цей worker не чіпає: його зберігає сама сторінка (localStorage).
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
// Корінь сайту: "/<репозиторій>/" на GitHub Pages. Усі шляхи нижче — відносно нього.
const ROOT = new URL("./", self.location.href).pathname;
const SHELL = "mortar-shell-" + VERSION;
const TILES = "mortar-tiles-v1";

async function collectAssets(cache, path, seen, depth) {
  if (seen.has(path) || depth > 4) return;
  seen.add(path);
  let res;
  try {
    res = await fetch(path, { credentials: "same-origin" });
  } catch {
    return;
  }
  if (!res.ok) return;
  const type = res.headers.get("content-type") || "";
  const copy = res.clone();
  await cache.put(path, res);
  if (!/javascript|css/.test(type)) return;
  const text = await copy.text();
  const base = new URL(path, self.location.origin + "/");
  const found = new Set();
  // «./chunk-abc.js», «/assets/x.woff2», url(...) у css
  for (const m of text.matchAll(/["'(]((?:\.{0,2}\/)?[\w@./-]+\.(?:js|css|woff2?|png|svg|jpg|jpeg|ico))["')]/g)) {
    let u;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    if (u.origin === self.location.origin && u.pathname.startsWith(ROOT + "assets/")) found.add(u.pathname);
  }
  await Promise.all([...found].map((p) => collectAssets(cache, p, seen, depth + 1)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const res = await fetch(ROOT, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error("shell " + res.status);
      const html = await res.clone().text();
      await cache.put(ROOT, res);
      const seen = new Set();
      const paths = new Set();
      for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
        let u;
        try {
          u = new URL(m[1], self.location.origin + ROOT);
        } catch {
          continue;
        }
        if (u.origin === self.location.origin) paths.add(u.pathname);
      }
      await Promise.all([...paths].map((p) => collectAssets(cache, p, seen, 0)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("mortar-shell-") && key !== SHELL) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function navigate(request) {
  const cache = await caches.open(SHELL);
  try {
    // Без мережі браузер довго чекає — тримаємо швидкий відступ на кеш.
    // сторінку завжди звіряємо з сервером (no-cache), щоб кеш браузера не віддав її застарілу копію після оновлення сайту
    const u = new URL(request.url);
    const res = await withTimeout(fetch(u.pathname + u.search, { cache: "no-cache", credentials: "same-origin" }), 4000);
    if (res.ok && new URL(request.url).pathname === ROOT) cache.put(ROOT, res.clone());
    return res;
  } catch {
    const cached = await cache.match(ROOT);
    if (cached) return cached;
    return new Response("Офлайн: застосунок ще не збережено на цьому пристрої.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const key = new URL(request.url).pathname;
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(key, res.clone());
  return res;
}

async function staticAsset(request) {
  const cache = await caches.open(SHELL);
  const key = new URL(request.url).pathname;
  const hit = await cache.match(key);
  if (hit) {
    // Хешовані файли незмінні; решту тихо оновлюємо в фоні.
    if (!key.startsWith(ROOT + "assets/")) {
      fetch(request)
        .then((res) => (res.ok ? cache.put(key, res) : undefined))
        .catch(() => undefined);
    }
    return hit;
  }
  const res = await fetch(request);
  if (res.ok) cache.put(key, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(ROOT)) return;
  // шлях відносно кореня сайту, з початковим "/"
  const p = "/" + url.pathname.slice(ROOT.length);
  // сам service worker — завжди напряму
  if (p === "/sw.js") return;
  // сторінка завантаження (лише на сайті) — завжди з мережі, її не кешуємо як частину застосунку
  if (p === "/download.html" || p === "/download.js" || p.startsWith("/img/")) return;
  if (req.mode === "navigate") {
    event.respondWith(navigate(req));
    return;
  }
  if (
    p.startsWith("/tiles/") ||
    p.startsWith("/tiles-hd/") ||
    p.startsWith("/maps/") ||
    p.startsWith("/heights/")
  ) {
    event.respondWith(cacheFirst(req, TILES));
    return;
  }
  event.respondWith(staticAsset(req));
});
