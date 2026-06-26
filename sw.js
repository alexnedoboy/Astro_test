// Service worker: нужен для установки PWA.
// Стратегия: network-first с no-cache заголовком (всегда свежий index.html).
// Офлайн-фолбэк: последняя закэшированная версия.
const CACHE = 'aspectus-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put('./', copy));
        return resp;
      })
      .catch(() => caches.match('./'))
  );
});
