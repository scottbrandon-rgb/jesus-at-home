// Jesus at Home — service worker
// Handles offline caching of the shell + Web Push notifications.

const CACHE = 'jai-v2';
const SHELL = ['/', '/index.html', '/style.css', '/render.js', '/logo-mark.png', '/icon-192.png'];

// ── Install: precache the shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
});

// ── Activate: drop old caches, take control ─────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first (fresh content), fall back to cache offline ────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // ignore cross-origin (fonts, CDN)
  if (url.pathname.startsWith('/.netlify/')) return;       // never cache function calls

  // Cache by path only: content.md is fetched with a cache-busting query string,
  // and keying on the full URL stored a new copy on every visit.
  const key = url.pathname;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(key).then((cached) => cached || caches.match('/')))
  );
});

// ── Push: show the notification ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Jesus at Home';
  const options = {
    body: data.body || 'A new devotional is ready.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'jai-update',
    renotify: true,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: focus an open tab or open the site ──────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
