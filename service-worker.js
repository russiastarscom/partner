// =====================================================================
//  Twin — Service Worker
//  Фоновые уведомления через Firebase Realtime Database
//  Работает когда браузер ЗАКРЫТ или страница не активна
// =====================================================================

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js');

const CACHE_NAME = 'twin-app-v3';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/get-key.html',
    '/encryption.js',
    '/gift_animations.css',
    '/manifest.json',
    '/icon-192x192.png',
    '/icon-512x512.png'
];

const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAhO3JsDI61pkpGla045EfEXq6h7EuGHoQ',
    authDomain: 'ukraine-52ad4.firebaseapp.com',
    databaseURL: 'https://ukraine-52ad4-default-rtdb.firebaseio.com',
    projectId: 'ukraine-52ad4',
    storageBucket: 'ukraine-52ad4.firebasestorage.app',
    messagingSenderId: '63107581219',
    appId: '1:63107581219:web:074b8e692a8a8b04737896'
};

// ── Состояние SW ─────────────────────────────────────────────────────
let firebaseApp = null;
let firebaseDB  = null;
let activeListeners = {};   // username → Firebase unsubscribe ref
let knownNotifIds   = new Set();  // уже показанные ID

// ── Инициализация Firebase внутри SW ─────────────────────────────────
function initFirebase() {
    if (firebaseDB) return true;
    try {
        if (!self.firebase.apps.length) {
            firebaseApp = self.firebase.initializeApp(FIREBASE_CONFIG, 'sw-app');
        } else {
            firebaseApp = self.firebase.app('sw-app');
        }
        firebaseDB = self.firebase.database(firebaseApp);
        console.log('[SW] Firebase инициализирован');
        return true;
    } catch (e) {
        console.error('[SW] Firebase ошибка:', e);
        return false;
    }
}

// ── Установка ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    console.log('[SW] Установка v3');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            cache.addAll(URLS_TO_CACHE).catch((e) =>
                console.warn('[SW] Не все файлы закешированы:', e)
            )
        )
    );
});

// ── Активация ────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    console.log('[SW] Активация v3');
    event.waitUntil(
        caches.keys()
            .then((keys) =>
                Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
            )
            .then(() => clients.claim())
    );
});

// ── Сообщения от страницы ────────────────────────────────────────────
self.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    switch (data.type) {

        // Страница открылась и говорит: "Я жива, слушай Firebase для этого юзера"
        case 'SUBSCRIBE_BACKGROUND':
            if (data.user) {
                console.log('[SW] Подписка на фоновые уведомления для:', data.user);
                subscribeUserNotifications(data.user);
            }
            break;

        // Страница закрылась или пользователь вышел
        case 'UNSUBSCRIBE_BACKGROUND':
            if (data.user) {
                unsubscribeUserNotifications(data.user);
            }
            break;

        // Обновление SW
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
    }
});

// ── Подписка на /users/{user}/notifications в Firebase ───────────────
function subscribeUserNotifications(username) {
    if (!initFirebase()) return;

    // Не создаём дублирующий слушатель
    if (activeListeners[username]) {
        console.log('[SW] Уже подписан на:', username);
        return;
    }

    const subscribeTime = Date.now();
    const ref = firebaseDB.ref('users/' + encodeURIComponent(username) + '/notifications');

    const handler = ref.on('child_added', async (snapshot) => {
        const notif  = snapshot.val();
        const notifId = snapshot.key;

        if (!notif || notif.read) return;
        if (notif.timestamp < subscribeTime - 5000) {
            // Старое уведомление — просто помечаем прочитанным, не показываем
            snapshot.ref.update({ read: true });
            return;
        }
        if (knownNotifIds.has(notifId)) return;
        knownNotifIds.add(notifId);

        // Проверяем: есть ли открытая вкладка Twin?
        // Если есть — страница сама покажет уведомление, SW не дублирует
        const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const twinOpen = clientList.some((c) => c.visibilityState === 'visible');
        if (twinOpen) {
            snapshot.ref.update({ read: true });
            return;
        }

        // Браузер свёрнут или закрыт → показываем системное уведомление
        const title = buildTitle(notif);
        const body  = buildBody(notif);

        await self.registration.showNotification(title, {
            body:               body,
            icon:               'icon-192x192.png',
            badge:              'icon-192x192.png',
            vibrate:            [200, 100, 200],
            tag:                'twin-' + notifId,
            renotify:           true,
            requireInteraction: false,
            data: {
                url:      '/',
                username: username,
                notifId:  notifId
            },
            actions: [
                { action: 'open',  title: '💬 Открыть' },
                { action: 'close', title: 'Закрыть'   }
            ]
        });

        // Помечаем прочитанным
        snapshot.ref.update({ read: true });
    });

    // Сохраняем для возможной отписки
    activeListeners[username] = { ref, handler };
    console.log('[SW] Firebase слушатель активен для:', username);
}

// ── Отписка ──────────────────────────────────────────────────────────
function unsubscribeUserNotifications(username) {
    const entry = activeListeners[username];
    if (!entry) return;
    entry.ref.off('child_added', entry.handler);
    delete activeListeners[username];
    console.log('[SW] Отписан от:', username);
}

// ── Заголовок уведомления ────────────────────────────────────────────
function buildTitle(notif) {
    switch (notif.type) {
        case 'message':         return '💬 Новое сообщение';
        case 'group_message':   return `👥 ${notif.groupName || 'Группа'}`;
        case 'channel_message': return `📢 ${notif.channelName || 'Канал'}`;
        case 'group_invite':    return '👥 Приглашение в группу';
        case 'group_remove':    return '👥 Вы удалены из группы';
        case 'new_subscriber':  return '📢 Новый подписчик';
        case 'gift':            return '🎁 Подарок!';
        default:                return 'Twin';
    }
}

// ── Текст уведомления ─────────────────────────────────────────────────
function buildBody(notif) {
    switch (notif.type) {
        case 'message':
            return `${notif.from}: ${notif.text || 'Новое сообщение'}`;
        case 'group_message':
            return `${notif.from}: ${notif.text || 'Новое сообщение'}`;
        case 'channel_message':
            return notif.text || 'Новое сообщение';
        case 'group_invite':
            return `${notif.from} добавил вас в группу "${notif.groupName}"`;
        case 'group_remove':
            return `Вы удалены из группы "${notif.groupName}"`;
        case 'new_subscriber':
            return `${notif.from} подписался на ваш канал`;
        case 'gift':
            return `${notif.from} прислал вам подарок 🎁`;
        default:
            return notif.text || 'Новое уведомление';
    }
}

// ── Клик по уведомлению ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'close') return;

    const targetUrl = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            // Найти открытую вкладку Twin и сфокусироваться
            for (const client of list) {
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    client.postMessage({
                        type: 'NOTIFICATION_CLICK',
                        url:  targetUrl,
                        data: event.notification.data
                    });
                    return client.focus();
                }
            }
            // Нет открытой вкладки — открываем новую
            return clients.openWindow(targetUrl);
        })
    );
});

// ── Push от OneSignal (резервный канал) ──────────────────────────────
self.addEventListener('push', (event) => {
    // OneSignal SDK обрабатывает свои пуши сам.
    // Этот блок — fallback для кастомных серверных пушей.
    if (!event.data) return;

    let payload = { title: 'Twin', body: 'Новое сообщение' };
    try {
        const raw = event.data.json();
        if (raw.headings?.en)  payload.title = raw.headings.en;
        if (raw.contents?.en)  payload.body  = raw.contents.en;
        if (raw.title)         payload.title = raw.title;
        if (raw.body)          payload.body  = raw.body;
    } catch (e) {
        payload.body = event.data.text();
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body:    payload.body,
            icon:    'icon-192x192.png',
            badge:   'icon-192x192.png',
            vibrate: [200, 100, 200],
            tag:     'twin-push-' + Date.now(),
            data:    { url: '/' }
        })
    );
});

// ── Fetch (кеш-первый) ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = event.request.url;
    if (
        url.includes('firebaseio.com') ||
        url.includes('googleapis.com') ||
        url.includes('onesignal.com')
    ) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((res) => {
                if (!res || res.status !== 200 || res.type === 'opaque') return res;
                caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
                return res;
            });
        }).catch(() => caches.match('/index.html'))
    );
});

console.log('[SW] Twin v3 загружен — фоновые уведомления через Firebase');
