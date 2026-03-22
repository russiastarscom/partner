// ════════════════════════════════════════════════════════════
//  Twin — push-init.js
//  Подключи этот файл в index.html перед закрывающим </body>:
//  <script src="push-init.js"></script>
//
//  ⚠️  Замени VAPID_PUBLIC_KEY на свой ключ (см. инструкцию)
// ════════════════════════════════════════════════════════════

// ── Вставь сюда свой публичный VAPID-ключ ───────────────
//    Получить: https://vapidkeys.com  или командой:
//    npx web-push generate-vapid-keys
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
 * Регистрирует service worker и оформляет push-подписку.
 * Вызывается после логина пользователя.
 * @param {string} userId - uid текущего пользователя в Firebase
 */
async function initPushNotifications(userId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Push] Браузер не поддерживает Web Push');
        return;
    }

    try {
        // 1. Регистрируем service worker
        //    На GitHub Pages файл лежит в /partner/, регистрируем относительно текущей страницы
        let registration;
        try {
            // Сначала проверяем — вдруг уже зарегистрирован
            registration = await navigator.serviceWorker.getRegistration();
        } catch(e) {}

        if (!registration) {
            // Определяем путь к SW динамически (работает и на localhost и на GitHub Pages)
            const swPath = new URL('service-worker.js', window.location.href).pathname;
            registration = await navigator.serviceWorker.register(swPath);
            console.log('[Push] SW зарегистрирован по пути:', swPath);
        } else {
            console.log('[Push] SW уже зарегистрирован');
        }

        // 2. Спрашиваем разрешение на уведомления
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[Push] Пользователь отказал в уведомлениях');
            return;
        }

        // 3. Подписываемся через VAPID
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        console.log('[Push] Подписка получена:', subscription.endpoint);

        // 4. Отправляем подписку на наш сервер, привязывая к userId
        const res = await fetch(`${PUSH_SERVER_URL}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                subscription   // { endpoint, keys: { p256dh, auth } }
            })
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
// Twin использует Firebase Auth — ловим момент, когда
// currentUser появляется в глобальной переменной.
// Если у тебя есть колбэк onLogin — вызови там initPushNotifications(uid).

document.addEventListener('DOMContentLoaded', () => {
    // Ждём, пока Firebase инициализирует пользователя
    const interval = setInterval(() => {
        // currentUser — глобальная переменная из index.html
        if (typeof currentUser !== 'undefined' && currentUser) {
            clearInterval(interval);
            initPushNotifications(currentUser);
        }
    }, 1000);

    // Останавливаем через 30 сек если не залогинился
    setTimeout(() => clearInterval(interval), 30000);
});
