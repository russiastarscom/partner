// ════════════════════════════════════════════════════════════
//  Twin — push-init.js
// ════════════════════════════════════════════════════════════

const VAPID_PUBLIC_KEY = 'BHWhY-ozjg5GkVLxFhhG_VEtj198PkvEjRtTDSfOMtNKGr1RpX_ELO9YAQChg7E0gLIrERJW0LzolDkkD0RBzbM';
const PUSH_SERVER_URL  = 'https://twin-push-server-production.up.railway.app';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function initPushNotifications(userId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Push] Браузер не поддерживает Web Push');
        return;
    }

    try {
        // Путь к SW = та же папка, где лежит index.html
        const pagePath   = window.location.pathname;
        const folderPath = pagePath.endsWith('/')
            ? pagePath
            : pagePath.substring(0, pagePath.lastIndexOf('/') + 1);

        const swUrl   = folderPath + 'service-worker.js';   // '/partner/service-worker.js'
        const swScope = folderPath;                          // '/partner/'

        console.log('[Push] Регистрируем SW:', swUrl, '→ scope:', swScope);

        const registration = await navigator.serviceWorker.register(swUrl, { scope: swScope });
        await navigator.serviceWorker.ready;
        console.log('[Push] SW активен');

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[Push] Нет разрешения на уведомления');
            return;
        }

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        console.log('[Push] Подписка:', subscription.endpoint);

        const res = await fetch(`${PUSH_SERVER_URL}/subscribe`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ userId, subscription })
        });

        console.log(res.ok ? '[Push] ✓ Подписка сохранена' : `[Push] Ошибка сервера: ${res.status}`);

    } catch (err) {
        console.error('[Push] Ошибка инициализации:', err);
    }
}

async function unsubscribePush(userId) {
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;

        await fetch(`${PUSH_SERVER_URL}/unsubscribe`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ userId, endpoint: sub.endpoint })
        });

        await sub.unsubscribe();
        console.log('[Push] Подписка удалена');
    } catch (err) {
        console.error('[Push] Ошибка отписки:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const interval = setInterval(() => {
        if (typeof currentUser !== 'undefined' && currentUser) {
            clearInterval(interval);
            initPushNotifications(currentUser);
        }
    }, 1000);

    setTimeout(() => clearInterval(interval), 30000);
});
