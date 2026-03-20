// ═══════════════════════════════════════════════════════════
//  Twin — Service Worker v3
//  Фоновые пуши через Firebase Realtime DB
//  Работает когда браузер закрыт / вкладка не активна
// ═══════════════════════════════════════════════════════════

// OneSignal ПЕРВЫМ — обязательное требование SDK
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// Firebase SDK для прямого слушания БД из SW
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js');

const CACHE_NAME = 'twin-v3';
const CACHE_URLS = ['/', '/index.html', '/get-key.html', '/encryption.js',
    '/gift_animations.css', '/manifest.json', '/icon-192x192.png', '/icon-512x512.png'];

const FB_CONFIG = {
    apiKey: 'AIzaSyAhO3JsDI61pkpGla045EfEXq6h7EuGHoQ',
    authDomain: 'ukraine-52ad4.firebaseapp.com',
    databaseURL: 'https://ukraine-52ad4-default-rtdb.firebaseio.com',
    projectId: 'ukraine-52ad4',
    storageBucket: 'ukraine-52ad4.firebasestorage.app',
    messagingSenderId: '63107581219',
    appId: '1:63107581219:web:074b8e692a8a8b04737896'
};

// ── Состояние ────────────────────────────────────────────
let _db = null;
const _listeners = {};   // username → { ref, fn }
const _seen = new Set(); // уже показанные notifId

function getDB() {
    if (_db) return _db;
    try {
        const apps = self.firebase.apps;
        const app = apps.find(a => a.name === 'twin-sw')
            || self.firebase.initializeApp(FB_CONFIG, 'twin-sw');
        _db = self.firebase.database(app);
        return _db;
    } catch(e) { console.error('[SW] Firebase init error:', e); return null; }
}

// ── Установка ────────────────────────────────────────────
self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(CACHE_URLS).catch(err => console.warn('[SW] cache partial:', err)))
    );
});

// ── Активация ────────────────────────────────────────────
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => clients.claim())
    );
});

// ── Сообщения от страницы ────────────────────────────────
self.addEventListener('message', e => {
    const d = e.data;
    if (!d) return;
    if (d.type === 'SUBSCRIBE_BACKGROUND' && d.user) startListening(d.user);
    else if (d.type === 'UNSUBSCRIBE_BACKGROUND' && d.user) stopListening(d.user);
    else if (d.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Подписка на /users/{user}/notifications ──────────────
function startListening(username) {
    if (_listeners[username]) return;
    const db = getDB();
    if (!db) return;

    const t0 = Date.now();
    const ref = db.ref('users/' + encodeURIComponent(username) + '/notifications');

    const fn = ref.on('child_added', async snap => {
        const n = snap.val(), id = snap.key;
        if (!n || n.read) return;
        if (n.timestamp < t0 - 10000) { snap.ref.update({ read: true }); return; }
        if (_seen.has(id)) return;
        _seen.add(id);

        // Не показываем если вкладка Twin видима прямо сейчас
        const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (list.some(c => c.visibilityState === 'visible')) {
            snap.ref.update({ read: true });
            return;
        }

        await self.registration.showNotification(title(n), {
            body: body(n),
            icon: 'icon-192x192.png',
            badge: 'icon-192x192.png',
            vibrate: [200, 100, 200],
            tag: 'twin-' + id,
            renotify: true,
            requireInteraction: false,
            data: { url: '/', username, notifId: id },
            actions: [
                { action: 'open', title: '💬 Открыть' },
                { action: 'dismiss', title: 'Закрыть' }
            ]
        });
        snap.ref.update({ read: true });
    });

    _listeners[username] = { ref, fn };
    console.log('[SW] 👂 Слушаю уведомления для:', username);
}

function stopListening(username) {
    const e = _listeners[username];
    if (!e) return;
    e.ref.off('child_added', e.fn);
    delete _listeners[username];
    console.log('[SW] 🔕 Отписан:', username);
}

// ── Текст уведомлений ────────────────────────────────────
function title(n) {
    return { message: '💬 Новое сообщение', group_message: `👥 ${n.groupName||'Группа'}`,
        channel_message: `📢 ${n.channelName||'Канал'}`, group_invite: '👥 Приглашение',
        group_remove: '👥 Вы удалены', new_subscriber: '📢 Новый подписчик',
        gift: '🎁 Подарок!' }[n.type] || 'Twin';
}
function body(n) {
    return { message: `${n.from}: ${n.text||'…'}`, group_message: `${n.from}: ${n.text||'…'}`,
        channel_message: n.text||'…', group_invite: `${n.from} добавил вас в «${n.groupName}»`,
        group_remove: `Вы удалены из «${n.groupName}»`,
        new_subscriber: `${n.from} подписался на ваш канал`,
        gift: `${n.from} прислал подарок 🎁` }[n.type] || n.text || 'Новое уведомление';
}

// ── Клик по уведомлению ──────────────────────────────────
self.addEventListener('notificationclick', e => {
    e.notification.close();
    if (e.action === 'dismiss') return;
    const url = e.notification.data?.url || '/';
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const c of list) {
                if (c.url.includes(self.registration.scope) && 'focus' in c) {
                    c.postMessage({ type: 'NOTIFICATION_CLICK', data: e.notification.data });
                    return c.focus();
                }
            }
            return clients.openWindow(url);
        })
    );
});

// ── Push от OneSignal (резерв) ───────────────────────────
self.addEventListener('push', e => {
    if (!e.data) return;
    let t = 'Twin', b = 'Новое уведомление';
    try { const d = e.data.json(); t = d.headings?.en||d.title||t; b = d.contents?.en||d.body||b; }
    catch { b = e.data.text(); }
    e.waitUntil(self.registration.showNotification(t, {
        body: b, icon: 'icon-192x192.png', badge: 'icon-192x192.png',
        vibrate: [200, 100, 200], tag: 'twin-push', renotify: true, data: { url: '/' }
    }));
});

// ── Fetch — кэш для статики ──────────────────────────────
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const u = e.request.url;
    if (u.includes('firebaseio.com') || u.includes('googleapis.com') ||
        u.includes('onesignal.com') || u.includes('8x8.vc')) return;
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
            if (res?.status === 200 && res.type !== 'opaque')
                caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
            return res;
        })).catch(() => caches.match('/index.html'))
    );
});

console.log('[SW] Twin v3 готов');
