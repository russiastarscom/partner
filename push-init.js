// ════════════════════════════════════════════════════════════
//  Twin — push-init.js  (ИСПРАВЛЕННАЯ ВЕРСИЯ)
//  Подключи этот файл в index.html перед закрывающим </body>:
//  <script src="push-init.js"></script>
// ════════════════════════════════════════════════════════════

// ── VAPID публичный ключ — ДОЛЖЕН совпадать с server.js ──
// ⚠️  ИСПРАВЛЕНО: был другой ключ, из-за чего push не работал
const VAPID_PUBLIC_KEY = 'BANapkW0GhUBLNbQBvsZbHBdcjGm_kVIifEYNBsivgzSkYztpF37z1Ij7YvX3s03J-6RRvNE-PvZ5K2JJVfS_vQ';

// ── URL твоего push-сервера ──────────────────────────────
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
 * Регистрирует service worker и оформляет push-подписку.
 * @param {string} userId - uid текущего пользователя в Firebase
 */
async function initPushNotifications(userId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Push] Браузер не поддерживает Web Push');
        return;
    }

    try {
        // 1. Регистрируем service worker
        // ⚠️ ИСПРАВЛЕНО: путь должен совпадать с тем, что в корне сайта
        const registration = await navigator.serviceWorker.register('/partner/service-worker.js', {
            scope: '/partner/'
        });
        console.log('[Push] SW зарегистрирован:', registration.scope);

        // Ждём активации SW перед подпиской
        await navigator.serviceWorker.ready;
        console.log('[Push] SW активен');

        // 2. Спрашиваем разрешение на уведомления
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[Push] Пользователь отказал в уведомлениях:', permission);
            return;
        }

        // 3. Проверяем существующую подписку
        let subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            // Проверяем, тот ли это VAPID ключ
            // Если ключ изменился — отписываемся и подписываемся заново
            const currentKey = btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey)));
            const expectedKey = btoa(String.fromCharCode(...urlBase64ToUint8Array(VAPID_PUBLIC_KEY)));

            if (currentKey !== expectedKey) {
                console.log('[Push] VAPID ключ изменился, переподписка...');
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
            console.log('[Push] ✓ Подписка сохранена на сервере, всего:', data.totalSubscriptions);
        } else {
            const errText = await res.text();
            console.error('[Push] Сервер вернул ошибку:', res.status, errText);
        }

    } catch (err) {
        console.error('[Push] Ошибка инициализации:', err);
    }
}

/**
 * Отписывается от push-уведомлений (при выходе из аккаунта).
 * @param {string} userId
 */
async function unsubscribePush(userId) {
    try {
        const reg = await navigator.serviceWorker.getRegistration('/partner/service-worker.js');
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
document.addEventListener('DOMContentLoaded', () => {
    const interval = setInterval(() => {
        if (typeof currentUser !== 'undefined' && currentUser) {
            clearInterval(interval);
            initPushNotifications(currentUser);
        }
    }, 1000);

    setTimeout(() => clearInterval(interval), 30000);
});
