// ════════════════════════════════════════════════════════════
//  Twin — Service Worker v12  (КОРНЕВОЙ ФАЙЛ)
//  Файл: /service-worker.js  (корень репозитория)
//  URL:  https://russiastarscom.github.io/service-worker.js
// ════════════════════════════════════════════════════════════

const CACHE_NAME = 'twin-v12';
const CACHE_URLS = [
    '/partner/',
    '/partner/index.html',
    '/partner/manifest.json',
    '/partner/icon-192x192.png',
    '/partner/icon-512x512.png'
];

// ── Установка ────────────────────────────────────────────
self.addEventListener('install', e => {
    console.log('[SW] Установка v12');
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(CACHE_URLS).catch(err => console.warn('[SW] cache partial:', err)))
    );
});

// ── Активация ────────────────────────────────────────────
self.addEventListener('activate', e => {
    console.log('[SW] Активация v12');
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

    // Пропускаем API-запросы напрямую в сеть (не кэшируем)
    if (
        u.includes('firebaseio.com') ||
        u.includes('googleapis.com') ||
        u.includes('firebaseapp.com') ||
        u.includes('8x8.vc') ||
        u.includes('railway.app')
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
//  Web Push — обработка входящих уведомлений
// ════════════════════════════════════════════════════════════

self.addEventListener('push', e => {
    console.log('[SW] Push получен');

    let payload = {
        title: 'Twin',
        body: 'Новое сообщение',
        icon: 'https://russiastarscom.github.io/partner/icon-192x192.png',
        badge: 'https://russiastarscom.github.io/partner/icon-192x192.png',
        tag: 'twin-msg',
        url: 'https://russiastarscom.github.io/partner/index.html'
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
        body:     payload.body,
        icon:     payload.icon,
        badge:    payload.badge,
        tag:      payload.tag,
        renotify: true,
        vibrate:  [200, 100, 200],
        requireInteraction: false,
        data: {
            url: payload.url,
            timestamp: Date.now()
        }
    };

    e.waitUntil(
        self.registration.showNotification(payload.title, options)
            .then(() => console.log('[SW] Уведомление показано:', payload.title))
            .catch(err => console.error('[SW] Ошибка показа уведомления:', err))
    );
});

// ── Клик по уведомлению ──────────────────────────────────
self.addEventListener('notificationclick', e => {
    console.log('[SW] Клик по уведомлению');
    e.notification.close();

    const targetUrl = (e.notification.data && e.notification.data.url)
        ? e.notification.data.url
        : 'https://russiastarscom.github.io/partner/index.html';

    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                for (const client of windowClients) {
                    if (client.url.includes('/partner/') && 'focus' in client) {
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

console.log('[SW] Twin v12 готов — Web Push включён ✓');
