// ════════════════════════════════════════════════════════════
//  Twin — push-init.js
//  Подключи этот файл в index.html перед закрывающим </body>:
//  <script src="push-init.js"></script>
//
//  ⚠️  Замени VAPID_PUBLIC_KEY на свой ключ (см. инструкцию)
// ════════════════════════════════════════════════════════════

// ── Вставь сюда свой публичный VAPID-ключ ───────────────
const VAPID_PUBLIC_KEY = 'BHWhY-ozjg5GkVLxFhhG_VEtj198PkvEjRtTDSfOMtNKGr1RpX_ELO9YAQChg7E0gLIrERJW0LzolDkkD0RBzbM';

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
 * Определяет путь к service-worker.js относительно текущей страницы.
 * Работает и на GitHub Pages (/partner/), и на корневом хосте (/).
 */
function getSwPath() {
    // Берём путь текущей страницы без имени файла
    const base = window.location.pathname.replace(/\/[^/]*$/, '') || '/';
    return base + '/service-worker.js';
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
        // 1. Регистрируем SW с правильным путём и scope
        const swPath = getSwPath();
        const swScope = swPath.replace('/service-worker.js', '/');
        console.log('[Push] Регистрируем SW:', swPath, '| scope:', swScope);

        const registration = await navigator.serviceWorker.register(swPath, { scope: swScope });
        console.log('[Push] SW зарегистрирован');

        // 2. Ждём, пока SW станет активным
        await navigator.serviceWorker.ready;

        // 3. Спрашиваем разрешение на уведомления
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[Push] Пользователь отказал в уведомлениях');
            return;
        }

        // 4. Подписываемся через VAPID
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        console.log('[Push] Подписка получена:', subscription.endpoint);

        // 5. Отправляем подписку на сервер
        const res = await fetch(`${PUSH_SERVER_URL}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, subscription })
        });

        if (res.ok) {
            console.log('[Push] ✓ Подписка сохранена на сервере');
        } else {
            console.error('[Push] Сервер вернул ошибку:', res.status);
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
        const reg = await navigator.serviceWorker.getRegistration();
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
