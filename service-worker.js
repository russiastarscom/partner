// ════════════════════════════════════════════════════════════
//  Twin — Service Worker v10 (с Web Push)
//  Файл: /service-worker.js  ← КОРЕНЬ репозитория
// ════════════════════════════════════════════════════════════

const CACHE_NAME = 'twin-v10';
const CACHE_URLS = [
    '/partner/',
    '/partner/index.html',
    '/partner/manifest.json',
    '/partner/icon-192x192.png',
    '/partner/icon-512x512.png'
];

// ── Установка ────────────────────────────────────────────
self.addEventListener('install', e => {
    console.log('[SW] Установка v10');
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(CACHE_URLS).catch(err => console.warn('[SW] cache partial:', err)))
    );
});

// ── Активация ────────────────────────────────────────────
self.addEventListener('activate', e => {
    console.log('[SW] Активация v10');
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
        }).catch(() => caches.match('/partner/index.html'))
    );
});

// ════════════════════════════════════════════════════════════
//  ██████╗ ██╗   ██╗███████╗██╗  ██╗
//  ██╔══██╗██║   ██║██╔════╝██║  ██║
//  ██████╔╝██║   ██║███████╗███████║
//  ██╔═══╝ ██║   ██║╚════██║██╔══██║
//  ██║     ╚██████╔╝███████║██║  ██║
//  ╚═╝      ╚═════╝ ╚══════╝╚═╝  ╚═╝
//  Web Push — обработка входящих уведомлений
// ════════════════════════════════════════════════════════════

/**
 * Обрабатывает входящий push от сервера.
 * Сервер должен отправить JSON вида:
 * {
 *   "title": "Иван",
 *   "body": "Привет! Как дела?",
 *   "icon": "/partner/icon-192x192.png",   // необязательно
 *   "badge": "/partner/icon-192x192.png",  // необязательно
 *   "tag": "msg-ivan",                     // группировка уведомлений
 *   "url": "/partner/index.html?chat=ivan" // куда открыть по клику
 * }
 */
self.addEventListener('push', e => {
    console.log('[SW] Push получен');

    let payload = {
        title: 'Twin',
        body: 'Новое сообщение',
        icon: '/partner/icon-192x192.png',
        badge: '/partner/icon-192x192.png',
        tag: 'twin-msg',
        url: '/partner/index.html'
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
        renotify: true,                  // звук/вибрация даже при одинаковом tag
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
        : '/partner/index.html';

    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Ищем уже открытую вкладку Twin
                for (const client of windowClients) {
                    if (client.url.includes('/partner/') && 'focus' in client) {
                        client.navigate(targetUrl);
                        return client.focus();
                    }
                }
                // Открываем новую вкладку
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

console.log('[SW] Twin v10 готов — Web Push включён ✓');
