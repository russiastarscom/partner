// Twin — Service Worker v12

const CACHE_NAME = 'twin-v12';
const CACHE_URLS = [
    '/partner/',
    '/partner/index.html',
    '/partner/manifest.json',
    '/partner/icon-192x192.png',
    '/partner/icon-512x512.png'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(CACHE_URLS).catch(err => console.warn('[SW] cache partial:', err)))
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const u = e.request.url;

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
