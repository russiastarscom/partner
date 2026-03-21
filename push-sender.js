/**
 * Twin — Отправка Push-уведомлений через Pusher Beams
 * 
 * Используй этот файл на сервере (Node.js / Firebase Functions / любой бэкенд)
 * чтобы отправлять уведомления пользователям даже когда браузер закрыт.
 * 
 * Установка:
 *   npm install @pusher/push-notifications-server
 * 
 * Или через fetch без зависимостей (см. sendPushRaw ниже).
 */

const PUSHER_INSTANCE_ID = 'dd53d38d-8cda-49c0-b2ed-85c95ef442a1';
const PUSHER_SECRET_KEY  = '5EA5BA7B9B9BBFF9C66834138DD02FC709985BCC6CD4FD703DD7F69B0CE164C1';
const PUSHER_API_URL     = `https://${PUSHER_INSTANCE_ID}.pushnotifications.pusher.com/publish_api/v1/instances/${PUSHER_INSTANCE_ID}/publishes`;

/**
 * Отправить уведомление пользователю по username
 * 
 * @param {string} toUsername   - получатель (как в Firebase)
 * @param {string} title        - заголовок уведомления
 * @param {string} body         - текст уведомления
 * @param {object} [extra={}]   - дополнительные поля (deep_link и т.д.)
 */
async function sendPushToUser(toUsername, title, body, extra = {}) {
    // Interest формируется так же, как в subscribeToPusherBeams() в index.html
    const interest = 'user-' + toUsername.toLowerCase().replace(/[^a-z0-9_\-=@,.]/g, '_');

    return sendPushToInterest(interest, title, body, extra);
}

/**
 * Отправить уведомление по interest (группа подписчиков)
 */
async function sendPushToInterest(interest, title, body, extra = {}) {
    const payload = {
        interests: [interest],
        web: {
            notification: {
                title,
                body,
                icon: 'https://russiastarscom.github.io/icon-192x192.png',
                deep_link: extra.url || 'https://russiastarscom.github.io/index.html',
                ...extra
            }
        }
    };

    const response = await fetch(PUSHER_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PUSHER_SECRET_KEY}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Pusher error ${response.status}: ${err}`);
    }

    const result = await response.json();
    console.log(`[Push] ✅ Отправлено на ${interest}:`, result);
    return result;
}

// ─────────────────────────────────────────────────
//  ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ
// ─────────────────────────────────────────────────

// Новое сообщение от alice к bob:
// sendPushToUser('bob', '💬 Новое сообщение', 'alice: Привет!');

// Приглашение в группу:
// sendPushToUser('bob', '👥 Приглашение в группу', 'alice добавила вас в «Друзья»');

// Подарок:
// sendPushToUser('bob', '🎁 Подарок!', 'alice прислала подарок 🎁');

// Всем пользователям Twin:
// sendPushToInterest('twin-all', '📢 Объявление', 'Новая версия Twin доступна!');

module.exports = { sendPushToUser, sendPushToInterest };

// ─────────────────────────────────────────────────
//  CURL ПРИМЕР (без Node.js)
// ─────────────────────────────────────────────────
/*
curl -H "Content-Type: application/json" \
     -H "Authorization: Bearer 5EA5BA7B9B9BBFF9C66834138DD02FC709985BCC6CD4FD703DD7F69B0CE164C1" \
     -X POST "https://dd53d38d-8cda-49c0-b2ed-85c95ef442a1.pushnotifications.pusher.com/publish_api/v1/instances/dd53d38d-8cda-49c0-b2ed-85c95ef442a1/publishes" \
     -d '{
       "interests": ["user-bob"],
       "web": {
         "notification": {
           "title": "💬 Новое сообщение",
           "body": "alice: Привет!",
           "icon": "https://russiastarscom.github.io/icon-192x192.png"
         }
       }
     }'
*/
