// ========================================
// Firebase Cloud Messaging Service Worker
// Twiin Messenger - Push Notifications
// ========================================

// Firebase конфигурация (twiin-f5e4e проект)
const firebaseConfig = {
    apiKey: "AIzaSyAaozzjaOHWRtzfhz_KlNqT_mzoxq72rjE",
    authDomain: "twiin-f5e4e.firebaseapp.com",
    databaseURL: "https://twiin-f5e4e-default-rtdb.firebaseio.com",
    projectId: "twiin-f5e4e",
    storageBucket: "twiin-f5e4e.firebasestorage.app",
    messagingSenderId: "986659672429",
    appId: "1:986659672429:web:b8e5920579312e8fe88a64",
    measurementId: "G-7GGRSMGE63"
};

// Импортируем Firebase (для Service Worker используем importScripts)
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);

// Получаем экземпляр Messaging
const messaging = firebase.messaging();

// ========================================
// Обработка сообщений в фоновом режиме
// ========================================

messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Получено фоновое сообщение:', payload);

    const data = payload.data || {};
    const notification = payload.notification || {};

    // Извлекаем данные уведомления
    const title = notification.title || data.title || 'Twiin Messenger';
    const body = notification.body || data.body || 'Новое сообщение';
    const icon = notification.icon || data.icon || '/icon-192x192.png';
    const badge = '/badge-72x72.png';
    const tag = data.tag || `message-${data.chatId || Date.now()}`;
    const chatId = data.chatId || '';
    const senderId = data.senderId || '';
    const senderName = data.senderName || 'Пользователь';

    // Настройки уведомления
    const notificationOptions = {
        body: body,
        icon: icon,
        badge: badge,
        tag: tag,
        data: {
            chatId: chatId,
            senderId: senderId,
            senderName: senderName,
            url: data.url || '/',
            timestamp: Date.now(),
            click_action: data.click_action || '/'
        },
        requireInteraction: false,
        silent: false,
        vibrate: [200, 100, 200],
        actions: [
            {
                action: 'open',
                title: '📝 Открыть чат'
            },
            {
                action: 'dismiss',
                title: '✕ Закрыть'
            }
        ]
    };

    // Показываем уведомление
    return self.registration.showNotification(title, notificationOptions);
});

// ========================================
// Обработка клика по уведомлению
// ========================================

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Клик по уведомлению:', event);

    event.notification.close();

    const data = event.notification.data || {};
    const action = event.action;

    // Если нажали "Закрыть" - просто закрываем
    if (action === 'dismiss') {
        return;
    }

    // Формируем URL для открытия
    let targetUrl = data.url || '/';
    if (data.chatId) {
        targetUrl = `/?chat=${data.chatId}`;
    }

    // Открываем или фокусируем окно
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Ищем уже открытое окно
            for (const client of clientList) {
                if (client.url.includes('twiin') && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // Если нет открытого окна - открываем новое
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// ========================================
// Обработка закрытия уведомления
// ========================================

self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Уведомление закрыто:', event);
    // Можно отправить аналитику или обновить статус
});

// ========================================
// Обработка сообщений от клиента
// ========================================

self.addEventListener('message', (event) => {
    console.log('[SW] Сообщение от клиента:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    // Обновление токена FCM
    if (event.data && event.data.type === 'UPDATE_FCM_TOKEN') {
        const token = event.data.token;
        const userId = event.data.userId;
        console.log('[SW] Запрос на обновление токена:', { userId, token: token?.substring(0, 10) + '...' });
    }

    // Показать уведомление от клиента (для push без сервера)
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, data } = event.data;
        
        const options = {
            body: body,
            icon: '/icon-192x192.png',
            badge: '/badge-72x72.png',
            tag: data?.tag || `notification-${Date.now()}`,
            data: data || {},
            vibrate: [200, 100, 200],
            requireInteraction: false,
            actions: [
                { action: 'open', title: '📝 Открыть' },
                { action: 'dismiss', title: '✕ Закрыть' }
            ]
        };

        self.registration.showNotification(title || 'Twiin Messenger', options);
        console.log('[SW] Показано уведомление от клиента:', title);
    }
});

// ========================================
// Прослушивание изменений в Firebase (Realtime)
// ========================================

// Подключение к Firebase для мониторинга уведомлений
let notificationListener = null;

async function startNotificationListener() {
    try {
        // Получаем ID пользователя из IndexedDB или localStorage
        // Service Worker имеет доступ к IndexedDB
        const db = await getDb();
        const userData = await db.get('userData', 'current');
        
        if (userData && userData.userId) {
            // Слушаем новые уведомления для пользователя
            // Это будет работать через FCM onBackgroundMessage
            console.log('[SW] Запущен мониторинг уведомлений для:', userData.userId);
        }
    } catch (error) {
        console.log('[SW] Не удалось запустить мониторинг:', error);
    }
}

// Простая обёртка для IndexedDB
function getDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('twiin-db', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve({
            get: (store, key) => {
                return new Promise((res, rej) => {
                    const tx = request.result.transaction(store, 'readonly');
                    const st = tx.objectStore(store);
                    const r = st.get(key);
                    r.onerror = () => rej(r.error);
                    r.onsuccess = () => res(r.result);
                });
            }
        });
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('userData')) {
                db.createObjectStore('userData');
            }
        };
    });
}

// ========================================
// Жизненный цикл Service Worker
// ========================================

self.addEventListener('install', (event) => {
    console.log('[SW] Установка Service Worker');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Активация Service Worker');
    event.waitUntil(
        clients.claim().then(() => {
            console.log('[SW] Захватил контроль над всеми клиентами');
        })
    );
});

// ========================================
// Периодическая синхронизация (если поддерживается)
// ========================================

self.addEventListener('periodicsync', (event) => {
    console.log('[SW] Периодическая синхронизация:', event.tag);
    
    if (event.tag === 'check-messages') {
        event.waitUntil(checkForNewMessages());
    }
});

async function checkForNewMessages() {
    // Здесь можно добавить логику проверки новых сообщений
    console.log('[SW] Проверка новых сообщений...');
}

// ========================================
// Push событие (fallback если onBackgroundMessage не сработал)
// ========================================

self.addEventListener('push', (event) => {
    console.log('[SW] Push событие получено');

    if (!event.data) {
        console.log('[SW] Push событие без данных');
        return;
    }

    try {
        const payload = event.data.json();
        console.log('[SW] Push данные:', payload);

        const data = payload.data || {};
        const notification = payload.notification || {};

        const title = notification.title || data.title || 'Twiin Messenger';
        const body = notification.body || data.body || 'Новое сообщение';

        const options = {
            body: body,
            icon: notification.icon || '/icon-192x192.png',
            badge: '/badge-72x72.png',
            tag: data.tag || `push-${Date.now()}`,
            data: data,
            vibrate: [200, 100, 200],
            actions: [
                { action: 'open', title: '📝 Открыть' },
                { action: 'dismiss', title: '✕ Закрыть' }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    } catch (error) {
        console.error('[SW] Ошибка обработки push:', error);
    }
});

console.log('[SW] Firebase Messaging Service Worker загружен');
