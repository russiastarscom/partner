// ════════════════════════════════════════════════════════════
//  Twin — push-init.js  (ИСПРАВЛЕННАЯ ВЕРСИЯ)
//  Файл: /partner/push-init.js
//  Подключи перед </body> в index.html:
//  <script src="push-init.js"></script>
// ════════════════════════════════════════════════════════════

// ── VAPID публичный ключ — совпадает с server.js ─────────
const VAPID_PUBLIC_KEY = 'BANapkW0GhUBLNbQBvsZbHBdcjGm_kVIifEYNBsivgzSkYztpF37z1Ij7YvX3s03J-6RRvNE-PvZ5K2JJVfS_vQ';

// ── URL push-сервера ─────────────────────────────────────
const PUSH_SERVER_URL = 'https://twin-push-server-production.up.railway.app';

// ════════════════════════════════════════════════════════════

/**
 * Конвертирует base64url → Uint8Array (нужно для VAPID)
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

/**
 * Сравнивает два applicationServerKey (Uint8Array / ArrayBuffer)
 */
function keysMatch(buf1, buf2) {
    const a = new Uint8Array(buf1);
    const b = new Uint8Array(buf2);
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

/**
 * Регистрирует service worker из корня и оформляет push-подписку.
 * @param {string} userId - uid/username текущего пользователя
 */
async function initPushNotifications(userId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Push] Браузер не поддерживает Web Push');
        return;
    }

    try {
        // 1. Регистрируем service worker ИЗ КОРНЯ сайта
        // ⚠️ КРИТИЧНО: scope '/' позволяет SW обрабатывать push для всего сайта
        const registration = await navigator.serviceWorker.register('/service-worker.js', {
            scope: '/'
        });
        console.log('[Push] SW зарегистрирован, scope:', registration.scope);

        // Ждём активации SW
        await navigator.serviceWorker.ready;
        console.log('[Push] SW активен');

        // 2. Запрашиваем разрешение на уведомления
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[Push] Пользователь отказал в уведомлениях:', permission);
            return;
        }

        // 3. Проверяем существующую подписку
        let subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            // Проверяем совпадение VAPID ключа
            const expectedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            const currentKey  = subscription.options && subscription.options.applicationServerKey;

            if (currentKey && !keysMatch(currentKey, expectedKey)) {
                console.log('[Push] VAPID ключ изменился — переподписка...');
                await subscription.unsubscribe();
                subscription = null;
            } else {
                console.log('[Push] Используем существующую подписку');
            }
        }

        // 4. Создаём новую подписку если нужно
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
            console.log('[Push] Новая подписка создана:', subscription.endpoint);
        }

        // 5. Отправляем подписку на сервер
        const res = await fetch(`${PUSH_SERVER_URL}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, subscription })
        });

        if (res.ok) {
            const data = await res.json();
            console.log('[Push] ✓ Подписка сохранена. Всего подписок:', data.totalSubscriptions);
        } else {
            const errText = await res.text();
            console.error('[Push] Сервер вернул ошибку:', res.status, errText);
        }

    } catch (err) {
        console.error('[Push] Ошибка инициализации:', err);
    }
}

/**
 * Отписывается от push-уведомлений (вызывать при выходе из аккаунта).
 * @param {string} userId
 */
async function unsubscribePush(userId) {
    try {
        const reg = await navigator.serviceWorker.getRegistration('/service-worker.js');
        if (!reg) return;

        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;

        await fetch(`${PUSH_SERVER_URL}/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, endpoint: sub.endpoint })
        });

        await sub.unsubscribe();
        console.log('[Push] Подписка удалена');
    } catch (err) {
        console.error('[Push] Ошибка отписки:', err);
    }
}

// ── Автозапуск после логина ──────────────────────────────
// Ждём появления currentUser (Firebase async auth)
document.addEventListener('DOMContentLoaded', () => {
    let attempts = 0;
    const interval = setInterval(() => {
        if (++attempts > 30) { clearInterval(interval); return; } // 30 сек

        if (typeof currentUser !== 'undefined' && currentUser) {
            clearInterval(interval);
            initPushNotifications(currentUser);
        }
    }, 1000);
});
