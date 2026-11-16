// Service worker: uygulamanın internetsiz de açılmasını sağlar.
// Uygulama dosyaları "önce ağ" ile alınır: internet varsa her zaman en güncel sürüm gelir,
// yoksa önbellekteki sürüm açılır. Dizi afişleri ise önbellekten verilir.

const VERSION = 'v1';
const APP_CACHE = `app-${VERSION}`;
const IMG_CACHE = 'images';

const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/api.js',
  './js/logic.js',
  './js/store.js',
  './js/ui.js',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Uygulama dosyaları: önce ağ, olmazsa önbellek
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Dizi afişleri: önce önbellek
  if (url.hostname === 'static.tvmaze.com') {
    event.respondWith(
      caches.open(IMG_CACHE).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok || res.type === 'opaque') c.put(req, res.clone());
              return res;
            })
        )
      )
    );
  }
  // TVmaze API istekleri: dokunma, doğrudan ağa gitsin
});
