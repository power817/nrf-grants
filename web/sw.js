/* NRF 공고 PWA service worker.
 * network-first: 온라인이면 항상 최신 파일을 받고, 오프라인일 때만 캐시로 대체.
 * (cache-first 로 하면 업데이트가 사용자에게 안 퍼지는 문제가 있어 network-first 사용) */
const CACHE = 'nrf-grants-v3';
const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './ads.js',
  './data.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 외부(원본 공고·광고 등)는 그대로

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
