// Минимальный service worker: нужен для установки PWA.
// Кэшируется только index.html (фолбэк при обрыве сети);
// расчёты (swisseph-wasm) и Supabase офлайн не работают — это осознанно.
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
  if (e.request.mode !== 'navigate') return; // CDN/API запросы идут напрямую в сеть
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put('./', copy));
        return resp;
      })
      .catch(() => caches.match('./'))
  );
});
