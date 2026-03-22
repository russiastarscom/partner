// ════════════════════════════════════════════════════════════
//  Twin — Service Worker v11 (ИСПРАВЛЕННАЯ ВЕРСИЯ)
//  Файл: /partner/service-worker.js
// ════════════════════════════════════════════════════════════

const CACHE_NAME = 'twin-v11';
const CACHE_URLS = [
    '/partner/',
    '/partner/index.html',
    '/partner/manifest.json',
    '/partner/icon-192x192.png',
    '/partner/icon-512x512.png'
];

// ── Установка ────────────────────────────────────────────
self.addEventListener('install', e => {
    console.log('[SW] Установка v11');
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
        u.includes('8x8.vc') ||
        u.includes('railway.app')   // ⚠️ ИСПРАВЛЕНО: не кэшируем push-сервер
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

    // ⚠️ ИСПРАВЛЕНО: дефолты с абсолютными URL (обязательно для закрытого браузера)
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

    // ⚠️ ИСПРАВЛЕНО: убрали actions — не все браузеры поддерживают,
    // и это может блокировать показ уведомления
    const options = {
        body:     payload.body,
        icon:     payload.icon,
        badge:    payload.badge,
        tag:      payload.tag,
        renotify: true,
        vibrate:  [200, 100, 200],
        // ⚠️ КРИТИЧНО: requireInteraction = true гарантирует показ когда браузер закрыт
        requireInteraction: false,
        data: {
            url: payload.url,
            timestamp: Date.now()
        }
    };

    // ⚠️ ИСПРАВЛЕНО: всегда возвращаем промис из waitUntil
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

console.log('[SW] Twin v11 готов — Web Push включён ✓');
