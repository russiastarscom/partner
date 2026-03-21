// ═══════════════════════════════════════════════════════════
//  Twin — Service Worker v5  (GitHub Pages fix)
//  Исправления:
//  1. OneSignal importScripts убран — SW должен быть чистым
//     для работы на subpath /partner/
//  2. CACHE_URLS исправлены на относительные пути
//  3. Response.clone() вызывается ДО возврата res (fix TypeError)
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'twin-v5';

// Пути относительно scope SW (/partner/)
const CACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192x192.png',
    './icon-512x512.png'
];

// ── Firebase конфиг ──────────────────────────────────────
const FB_DB_URL = 'https://ukraine-52ad4-default-rtdb.firebaseio.com';

// ── Состояние ────────────────────────────────────────────
const _pollers   = {};
const _seen      = new Set();
const _startTime = {};

// ── Установка ────────────────────────────────────────────
self.addEventListener('install', e => {
    console.log('[SW] Установка v5');
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(CACHE_URLS).catch(err => console.warn('[SW] cache partial:', err)))
    );
});

// ── Активация ────────────────────────────────────────────
self.addEventListener('activate', e => {
    console.log('[SW] Активация v5');
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Сообщения от страницы ────────────────────────────────
self.addEventListener('message', e => {
    const d = e.data;
    if (!d) return;

    switch (d.type) {
        case 'SUBSCRIBE_BACKGROUND':
            if (d.user) startPolling(d.user);
            break;
        case 'UNSUBSCRIBE_BACKGROUND':
            if (d.user) stopPolling(d.user);
            break;
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
    }
});

// ═══════════════════════════════════════════════════════════
//  CORE: REST POLLING
// ═══════════════════════════════════════════════════════════

function startPolling(username) {
    if (_pollers[username]) return;

    _startTime[username] = Date.now();
    console.log('[SW] 🚀 Старт polling для:', username);

    pollNotifications(username);

    const id = setInterval(() => pollNotifications(username), 15_000);
    _pollers[username] = id;
}

function stopPolling(username) {
    if (!_pollers[username]) return;
    clearInterval(_pollers[username]);
    delete _pollers[username];
    delete _startTime[username];
    console.log('[SW] 🔕 Polling остановлен:', username);
}

async function pollNotifications(username) {
    try {
        const encoded = encodeURIComponent(username);
        const url = `${FB_DB_URL}/users/${encoded}/notifications.json?orderBy="timestamp"&limitToLast=10`;

        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;

        const data = await res.json();
        if (!data || typeof data !== 'object') return;

        const t0 = _startTime[username] || Date.now();

        for (const [id, n] of Object.entries(data)) {
            if (!n || n.read) continue;
            if (_seen.has(id)) continue;
            if (n.timestamp && n.timestamp < t0 - 10_000) {
                markRead(username, id);
                continue;
            }

            _seen.add(id);

            const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            const appVisible = list.some(c =>
                c.visibilityState === 'visible' && c.url.includes(self.registration.scope)
            );

            if (appVisible) {
                markRead(username, id);
            } else {
                await showNotification(id, n);
                markRead(username, id);
            }
        }
    } catch (err) {
        console.warn('[SW] polling error:', err);
    }
}

async function markRead(username, notifId) {
    try {
        const encoded = encodeURIComponent(username);
        await fetch(
            `${FB_DB_URL}/users/${encoded}/notifications/${notifId}.json`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ read: true })
            }
        );
    } catch (e) {
        console.warn('[SW] markRead error:', e);
    }
}

// ── Показ уведомления ────────────────────────────────────
async function showNotification(id, n) {
    const notifTitle = getTitle(n);
    const notifBody  = getBody(n);

    await self.registration.showNotification(notifTitle, {
        body:    notifBody,
        icon:    './icon-192x192.png',
        badge:   './icon-192x192.png',
        vibrate: [200, 100, 200],
        tag:     'twin-' + id,
        renotify: true,
        requireInteraction: false,
        data: { url: self.registration.scope, notifId: id },
        actions: [
            { action: 'open',    title: '💬 Открыть' },
            { action: 'dismiss', title: 'Закрыть'    }
        ]
    });
}

// ── Тексты уведомлений ───────────────────────────────────
function getTitle(n) {
    const map = {
        message:         '💬 Новое сообщение',
        group_message:   `👥 ${n.groupName   || 'Группа'}`,
        channel_message: `📢 ${n.channelName  || 'Канал'}`,
        group_invite:    '👥 Приглашение в группу',
        group_remove:    '👥 Вы удалены из группы',
        new_subscriber:  '📢 Новый подписчик',
        gift:            '🎁 Подарок!'
    };
    return map[n.type] || 'Twin';
}

function getBody(n) {
    const map = {
        message:         `${n.from}: ${n.text || '…'}`,
        group_message:   `${n.from}: ${n.text || '…'}`,
        channel_message: n.text || '…',
        group_invite:    `${n.from} добавил вас в «${n.groupName}»`,
        group_remove:    `Вы удалены из «${n.groupName}»`,
        new_subscriber:  `${n.from} подписался на ваш канал`,
        gift:            `${n.from} прислал подарок 🎁`
    };
    return map[n.type] || n.text || 'Новое уведомление';
}

// ── Клик по уведомлению ──────────────────────────────────
self.addEventListener('notificationclick', e => {
    e.notification.close();
    if (e.action === 'dismiss') return;

    const url = e.notification.data?.url || self.registration.scope;

    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const c of list) {
                if (c.url.includes(self.registration.scope) && 'focus' in c) {
                    c.postMessage({ type: 'NOTIFICATION_CLICK', data: e.notification.data });
                    return c.focus();
                }
            }
            return self.clients.openWindow(url);
        })
    );
});

// ── Push уведомления (резерв) ────────────────────────────
self.addEventListener('push', e => {
    if (!e.data) return;
    let t = 'Twin', b = 'Новое уведомление';
    try {
        const d = e.data.json();
        t = d.headings?.en || d.title || t;
        b = d.contents?.en || d.body   || b;
    } catch {
        b = e.data.text();
    }
    e.waitUntil(
        self.registration.showNotification(t, {
            body:    b,
            icon:    './icon-192x192.png',
            badge:   './icon-192x192.png',
            vibrate: [200, 100, 200],
            tag:     'twin-push',
            renotify: true,
            data:    { url: self.registration.scope }
        })
    );
});

// ── Fetch — кэш для статики ──────────────────────────────
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const u = e.request.url;
    // Внешние API — не перехватываем (НЕ вызываем respondWith)
    if (
        u.includes('firebaseio.com') ||
        u.includes('googleapis.com') ||
        u.includes('onesignal.com')  ||
        u.includes('8x8.vc')         ||
        u.includes('firebaseapp.com')
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
            }).catch(() => caches.match('./index.html'));
        })
    );
});

console.log('[SW] Twin v5 готов — GitHub Pages fix applied');
