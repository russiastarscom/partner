// OneSignalSDKWorker.js — обёртка с защитой от SecurityError
// Проблема: на GitHub Pages (/partner/) importScripts может вызвать SecurityError.
// Решение: try/catch чтобы не ломать основной SW.
try {
    importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (e) {
    console.warn('[OneSignalSDKWorker] importScripts failed:', e.message);
}
