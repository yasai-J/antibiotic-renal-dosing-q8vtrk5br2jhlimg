/* 腎機能別 抗菌薬投与量チェッカー：オフライン用 Service Worker
 * index.html やデータを更新したら、CACHE_VERSION の番号を1つ上げてください。
 */
const CACHE_VERSION = "v1";
const CACHE = `renal-abx-${CACHE_VERSION}`;
const FONT_CACHE = "renal-abx-fonts";

// 必ずキャッシュするファイル
const CORE = ["./", "./index.html", "./manifest.webmanifest"];
// アイコンはまだ無くても動くように、取得できたものだけキャッシュ
const OPTIONAL = ["./icon-192.png", "./icon-512.png", "./icon-512-maskable.png", "./apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    await Promise.all(OPTIONAL.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("renal-abx-") && k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 画面本体：ネット優先（更新をすぐ反映）、オフライン時はキャッシュ
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", res.clone());
        return res;
      } catch {
        return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Google Fonts：キャッシュを使いつつ裏で更新（オフラインでは標準フォントで表示）
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  // 同じサイト内のファイル：キャッシュ優先
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })());
  }
});
