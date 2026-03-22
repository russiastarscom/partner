// ════════════════════════════════════════════════════════════
//  Twin — Service Worker v11 (с Web Push, динамические пути)
//  Файл: /partner/service-worker.js
// ════════════════════════════════════════════════════════════

const CACHE_NAME = 'twin-v11';

// Определяем базовый путь динамически (работает и на /partner/ и на /)
const BASE_PATH = self.registration.scope; // e.g. https://russiastarscom.github.io/partner/

const CACHE_URLS = [
    BASE_PATH,
    BASE_PATH + 'index.html',
    BASE_PATH + 'manifest.json',
    BASE_PATH + 'icon-192x192.png',
    BASE_PATH + 'icon-512x512.png'
];

// ── Установка ────────────────────────────────────────────
self.addEventListener('install', e => {
    console.log('[SW] Установка v11, scope:', BASE_PATH);
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(CACHE_URLS).catch(err => console.warn('[SW] cache partial:', err)))
    );
});

// ── Активация ────────────────────────────────────────────
self.addEventListener('activate', e => {
    console.log('[SW] Активация v11');
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch — кэш для статики ──────────────────────────────
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const u = e.request.url;

    if (
        u.includes('firebaseio.com') ||
        u.includes('googleapis.com') ||
        u.includes('8x8.vc')
    ) return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res && res.status === 200 && res.type !== 'opaque') {
                    const resClone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, resClone));
                }
                return res;
            });
        }).catch(() => caches.match(BASE_PATH + 'index.html'))
    );
});

// ════════════════════════════════════════════════════════════
//  Web Push — обработка входящих уведомлений
// ════════════════════════════════════════════════════════════

self.addEventListener('push', e => {
    console.log('[SW] Push получен');

    let payload = {
        title: 'Twin',
        body: 'Новое сообщение',
        icon: BASE_PATH + 'icon-192x192.png',
        badge: BASE_PATH + 'icon-192x192.png',
        tag: 'twin-msg',
        url: BASE_PATH + 'index.html'
    };

    if (e.data) {
        try {
            const d = e.data.json();
            payload = { ...payload, ...d };
        } catch {
            payload.body = e.data.text() || payload.body;
        }
    }

    const options = {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        tag: payload.tag,
        renotify: true,
        vibrate: [200, 100, 200],
        data: { url: payload.url },
        actions: [
            { action: 'open',    title: '💬 Открыть' },
            { action: 'dismiss', title: '✖ Закрыть'  }
        ]
    };

    e.waitUntil(
        self.registration.showNotification(payload.title, options)
    );
});

// ── Клик по уведомлению ──────────────────────────────────
self.addEventListener('notificationclick', e => {
    e.notification.close();

    if (e.action === 'dismiss') return;

    const targetUrl = (e.notification.data && e.notification.data.url)
        ? e.notification.data.url
        : BASE_PATH + 'index.html';

    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                for (const client of windowClients) {
                    if (client.url.startsWith(BASE_PATH) && 'focus' in client) {
                        client.navigate(targetUrl);
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }
            })
    );
});

// ── Уведомление закрыто пользователем ───────────────────
self.addEventListener('notificationclose', e => {
    console.log('[SW] Уведомление закрыто:', e.notification.tag);
});

console.log('[SW] Twin v11 готов — Web Push включён ✓');
