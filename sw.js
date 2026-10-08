/* Oyun Arşivi — çevrimdışı yedek (service worker).
   Sitenin kendi dosyaları her zaman önce internetten alınır, böylece yayınladığın değişiklik hemen görünür;
   internet yoksa en son alınan kopya gösterilir. Firebase, YouTube, Steam gibi başka sitelere giden isteklere
   karışılmaz. Yalnızca yazı tipleri (Google Fonts) ilk indirildikten sonra önbellekten verilir. */
const CACHE = 'oyun-arsivi-v1';
const FONTS = 'oyun-arsivi-yazi-tipleri-v1';

// Uygulamanın iskeleti kurulurken hemen saklanır: ilk ziyarette yüklenip sonra internetsiz açılsa da sayfa gelir.
const SHELL = ['./', 'css/style.css', 'js/app.js', 'js/config.js', 'js/cloud.js', 'data/games.js', 'manifest.webmanifest', 'icons/icon.svg', 'favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((path) => cache.add(path).catch(() => {}))); // biri alınamazsa ötekiler yine saklanır
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key !== FONTS) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(req, url));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') event.respondWith(cacheFirst(req));
});

// Önbellekte adres sorgusuz saklanır (data/latest.json?v=… her 10 dakikada değişir; kopyalar birikmesin).
async function networkFirst(req, url) {
  const cache = await caches.open(CACHE);
  const key = url.origin + url.pathname;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = await cache.match(new URL('./', self.registration.scope).href);
      if (page) return page;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()); // hata yanıtı saklanmaz; bir sonraki açılışta yeniden istenir
  return res;
}
