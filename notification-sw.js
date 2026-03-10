// notification-sw.js
const CACHE_NAME = 'twin-notifications-v1';

// Установка Service Worker
self.addEventListener('install', (event) => {
    console.log('[Notification SW] Установка');
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/',
                '/index.html',
                '/notifications.html'
            ]).catch(error => {
                console.log('[Notification SW] Кэширование необязательно');
            });
        })
    );
});

// Активация
self.addEventListener('activate', (event) => {
    console.log('[Notification SW] Активация');
    event.waitUntil(clients.claim());
});

// Обработка push-сообщений от Firebase
self.addEventListener('push', (event) => {
    console.log('[Notification SW] Получено push:', event);
    
    let data = {
        title: 'Twin Messenger',
        body: 'Новое уведомление',
        icon: 'icon-192x192.png',
        badge: 'icon-192x192.png',
        vibrate: [200, 100, 200],
        data: {
            url: 'index.html',
            timestamp: Date.now()
        }
    };
    
    if (event.data) {
        try {
            const pushData = event.data.json();
            data = { ...data, ...pushData };
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(data.title, data)
    );
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', (event) => {
    console.log('[Notification SW] Клик по уведомлению:', event);
    
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || 'index.html';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Если есть открытое окно, фокусируемся на нем
            for (const client of clientList) {
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Иначе открываем новое
            return clients.openWindow(urlToOpen);
        })
    );
});

// Обработка закрытия уведомления
self.addEventListener('notificationclose', (event) => {
    console.log('[Notification SW] Уведомление закрыто:', event.notification.title);
});

// Обработка fetch запросов
self.addEventListener('fetch', (event) => {
    // Просто пропускаем через сеть
    event.respondWith(fetch(event.request));
});

console.log('[Notification SW] Загружен');
