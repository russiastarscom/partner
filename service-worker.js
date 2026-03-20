// =====================================================
//  Twin — Service Worker
//  Поддержка фоновых уведомлений через OneSignal
// =====================================================

// ВАЖНО: OneSignal должен быть первым импортом
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

const CACHE_NAME = 'twin-app-v2';
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

// Установка
self.addEventListener('install', (event) => {
  console.log('[SW] Установка...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(URLS_TO_CACHE).catch((err) =>
        console.warn('[SW] Не все файлы закешированы:', err)
      )
    )
  );
});

// Активация — удаляем старые кеши
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация...');
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => clients.claim())
  );
});

// Push-уведомления (работает когда браузер ЗАКРЫТ)
self.addEventListener('push', (event) => {
  console.log('[SW] Push получен');

  let payload = {
    title: 'Twin',
    body: 'Новое сообщение',
    icon: 'icon-192x192.png',
    badge: 'icon-192x192.png',
    vibrate: [200, 100, 200],
    data: { url: '/' },
    tag: 'twin-msg',
    renotify: true,
    requireInteraction: false
  };

  if (event.data) {
    try {
      const raw = event.data.json();
      // Формат OneSignal: { headings: {en}, contents: {en}, data: {...} }
      if (raw.headings && raw.headings.en) payload.title = raw.headings.en;
      if (raw.contents && raw.contents.en) payload.body  = raw.contents.en;
      if (raw.icon)  payload.icon = raw.icon;
      if (raw.data)  payload.data = raw.data;
      // Прямой формат: { title, body }
      if (raw.title) payload.title = raw.title;
      if (raw.body)  payload.body  = raw.body;
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:               payload.body,
      icon:               payload.icon,
      badge:              payload.badge,
      vibrate:            payload.vibrate,
      tag:                payload.tag,
      renotify:           payload.renotify,
      requireInteraction: payload.requireInteraction,
      data:               payload.data,
      actions: [
        { action: 'open',  title: '💬 Открыть чат' },
        { action: 'close', title: 'Закрыть' }
      ]
    })
  );
});

// Клик по уведомлению
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl });
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// Fetch (кеш-первый для статики)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  // Не трогаем Firebase и OneSignal
  if (url.includes('firebaseio.com') || url.includes('googleapis.com') || url.includes('onesignal.com')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      });
    }).catch(() => caches.match('/index.html'))
  );
});

// Сообщения от страницы (например skipWaiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

console.log('[SW] Загружен — Twin с поддержкой фоновых уведомлений');
