const CACHE_NAME = 'twin-app-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/admin.html',
  '/get-key.html',
  '/encryption.js',
  '/gift_animations.css',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Импорт OneSignal Service Worker
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// Установка service worker
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE).catch((err) => {
        console.log('Some files failed to cache:', err);
      });
    })
  );
});

// Активация
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(clients.claim());
});

// Обработка push-уведомлений (фоновые уведомления)
self.addEventListener('push', (event) => {
  console.log('📬 Push received:', event);
  
  let data = { 
    title: 'Twin', 
    body: 'Новое сообщение', 
    icon: 'icon-192x192.png',
    badge: 'icon-192x192.png',
    vibrate: [200, 100, 200],
    data: { url: '/' }
  };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || 'icon-192x192.png',
    badge: data.badge || 'icon-192x192.png',
    vibrate: data.vibrate || [200, 100, 200],
    data: data.data || { url: '/' },
    actions: data.actions || [
      { action: 'open', title: 'Открыть чат' },
      { action: 'close', title: 'Закрыть' }
    ],
    tag: 'twin-notification',
    renotify: true,
    requireInteraction: false,
    silent: false
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Twin', options)
  );
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification click:', event);
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  // Открываем приложение
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});

// Обработка fetch запросов
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      });
    }).catch(() => {
      return caches.match('/index.html');
    })
  );
});