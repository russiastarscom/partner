// ════════════════════════════════════════════════════════════
//  Twin — push-notify.js  (Web Push триггеры)
//
//  Подключи ПОСЛЕ push-init.js, перед </body>:
//  <script src="push-notify.js"></script>
//
//  Этот файл перехватывает ключевые функции приложения
//  и отправляет Web Push уведомления через твой сервер.
// ════════════════════════════════════════════════════════════

const PUSH_SERVER = 'https://twin-push-server-production.up.railway.app';

// ── Отправка push конкретному пользователю ────────────────
async function sendPushToUser(targetUserId, payload) {
    if (!targetUserId || !payload) return;
    try {
        const res = await fetch(`${PUSH_SERVER}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: targetUserId, payload })
        });
        if (!res.ok) {
            console.warn(`[PushNotify] Ошибка отправки push для ${targetUserId}:`, res.status);
        }
    } catch (err) {
        console.warn('[PushNotify] Ошибка запроса:', err);
    }
}

// ── Отправка push нескольким пользователям ────────────────
async function sendPushToMany(userIds, payload) {
    if (!userIds || !userIds.length) return;
    const targets = userIds.filter(uid => uid && uid !== (typeof currentUser !== 'undefined' ? currentUser : null));
    await Promise.all(targets.map(uid => sendPushToUser(uid, payload)));
}

// ════════════════════════════════════════════════════════════
//  Патч: перехват sendMessage
//  Триггеры: личное сообщение, групповое, пост в канале
// ════════════════════════════════════════════════════════════

function patchSendMessage() {
    // Ждём пока оригинальная функция появится
    const origFn = window.sendMessage;
    if (typeof origFn !== 'function') return;

    window.sendMessage = async function() {
        // Запоминаем состояние ДО отправки
        const chatType   = typeof currentChatType !== 'undefined' ? currentChatType : null;
        const chat       = typeof currentChat     !== 'undefined' ? currentChat     : null;
        const text       = document.getElementById('message-text')
                         ? document.getElementById('message-text').value.trim()
                         : '';
        const sender     = typeof currentUser     !== 'undefined' ? currentUser     : null;
        const group      = typeof currentGroup    !== 'undefined' ? currentGroup    : null;
        const channel    = typeof currentChannel  !== 'undefined' ? currentChannel  : null;

        // Вызываем оригинал
        await origFn.apply(this, arguments);

        // Теперь отправляем Web Push
        if (!text || !sender) return;

        try {
            if (chatType === 'user' && chat) {
                // ── Личное сообщение ──────────────────────────
                await sendPushToUser(chat, {
                    title: sender,
                    body: text.length > 100 ? text.slice(0, 100) + '…' : text,
                    icon: '/icon-192x192.png',
                    badge: '/icon-192x192.png',
                    tag: `msg-${sender}`,
                    url: `/index.html`
                });

            } else if (chatType === 'group' && group && group.participants) {
                // ── Групповое сообщение ───────────────────────
                const recipients = group.participants.filter(p => p !== sender);
                const groupName  = group.name || 'Группа';
                await sendPushToMany(recipients, {
                    title: `${groupName}`,
                    body: `${sender}: ${text.length > 80 ? text.slice(0, 80) + '…' : text}`,
                    icon: '/icon-192x192.png',
                    badge: '/icon-192x192.png',
                    tag: `group-${chat}`,
                    url: `/index.html`
                });

            } else if (chatType === 'channel' && channel && channel.subscribers) {
                // ── Пост в канале ─────────────────────────────
                const subscribers = channel.subscribers.filter(s => s !== sender);
                const channelName = channel.name || 'Канал';
                await sendPushToMany(subscribers, {
                    title: `📢 ${channelName}`,
                    body: text.length > 100 ? text.slice(0, 100) + '…' : text,
                    icon: '/icon-192x192.png',
                    badge: '/icon-192x192.png',
                    tag: `channel-${chat}`,
                    url: `/index.html`
                });
            }
        } catch (err) {
            console.warn('[PushNotify] Ошибка отправки push:', err);
        }
    };
    console.log('[PushNotify] ✓ sendMessage пропатчен');
}

// ════════════════════════════════════════════════════════════
//  Патч: перехват createGroup
//  Триггер: добавление в группу
// ════════════════════════════════════════════════════════════

function patchCreateGroup() {
    const origFn = window.createGroup;
    if (typeof origFn !== 'function') return;

    window.createGroup = async function() {
        // Сохраняем список участников до создания
        const pendingBefore = typeof pendingParticipants !== 'undefined'
            ? pendingParticipants.map(p => p.username)
            : [];
        const creator = typeof currentUser !== 'undefined' ? currentUser : null;
        const groupName = (document.getElementById('group-name-input') || {}).value || 'Группа';

        await origFn.apply(this, arguments);

        // Отправляем push всем приглашённым
        if (!creator || !pendingBefore.length) return;
        try {
            await sendPushToMany(pendingBefore, {
                title: '👥 Вас добавили в группу',
                body: `${creator} добавил вас в группу «${groupName}»`,
                icon: '/icon-192x192.png',
                badge: '/icon-192x192.png',
                tag: `group-invite-${Date.now()}`,
                url: `/index.html`
            });
        } catch (err) {
            console.warn('[PushNotify] Ошибка push (createGroup):', err);
        }
    };
    console.log('[PushNotify] ✓ createGroup пропатчен');
}

// ════════════════════════════════════════════════════════════
//  Патч: перехват добавления участника в группу (настройки)
//  Ищем функции addGroupMember / addMemberToGroup / addParticipant
// ════════════════════════════════════════════════════════════

function patchAddGroupMember() {
    // Перебираем возможные имена функции
    const candidates = ['addGroupMember', 'addMemberToGroup', 'addParticipant', 'addGroupParticipant'];
    for (const name of candidates) {
        if (typeof window[name] === 'function') {
            const origFn = window[name];
            window[name] = async function(username, ...rest) {
                const groupObj = typeof currentGroup !== 'undefined' ? currentGroup : null;
                const adder    = typeof currentUser  !== 'undefined' ? currentUser  : null;
                const gName    = groupObj ? groupObj.name : 'группу';

                await origFn.apply(this, [username, ...rest]);

                if (username && adder) {
                    try {
                        await sendPushToUser(username, {
                            title: '👥 Вас добавили в группу',
                            body: `${adder} добавил вас в «${gName}»`,
                            icon: '/icon-192x192.png',
                            badge: '/icon-192x192.png',
                            tag: `group-added`,
                            url: `/index.html`
                        });
                    } catch (err) {
                        console.warn('[PushNotify] Ошибка push (addMember):', err);
                    }
                }
            };
            console.log(`[PushNotify] ✓ ${name} пропатчен`);
        }
    }
}

// ════════════════════════════════════════════════════════════
//  Патч: подписка на канал
//  Уведомляем создателя канала о новом подписчике
// ════════════════════════════════════════════════════════════

function patchChannelSubscribe() {
    // Ищем кнопку подписки — после рендера каналов
    // Используем MutationObserver для динамических кнопок

    const observer = new MutationObserver(() => {
        document.querySelectorAll('.subscribe-btn:not([data-push-patched])').forEach(btn => {
            btn.setAttribute('data-push-patched', '1');
            btn.addEventListener('click', async () => {
                const channelItem = btn.closest('[data-channel-id]') || btn.closest('.channel-item');
                const channelId   = channelItem ? channelItem.dataset.channelId : null;
                const channel     = (typeof channels !== 'undefined' && channelId)
                    ? channels.find(c => c.id === channelId)
                    : null;
                const subscriber  = typeof currentUser !== 'undefined' ? currentUser : null;
                const isNowSubscribing = !btn.classList.contains('subscribed'); // до клика

                if (!channel || !subscriber || !isNowSubscribing) return;
                if (!channel.creator || channel.creator === subscriber) return;

                try {
                    await sendPushToUser(channel.creator, {
                        title: '📢 Новый подписчик',
                        body: `${subscriber} подписался на «${channel.name}»`,
                        icon: '/icon-192x192.png',
                        badge: '/icon-192x192.png',
                        tag: `channel-sub-${channelId}`,
                        url: `/index.html`
                    });
                } catch (err) {
                    console.warn('[PushNotify] Ошибка push (subscribe):', err);
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[PushNotify] ✓ MutationObserver для кнопок подписки запущен');
}

// ════════════════════════════════════════════════════════════
//  Патч: входящий звонок → push получателю
// ════════════════════════════════════════════════════════════

function patchStartCall() {
    const origFn = window.startCall;
    if (typeof origFn !== 'function') return;

    window.startCall = async function(targetUser, callType, ...rest) {
        await origFn.apply(this, [targetUser, callType, ...rest]);

        const caller = typeof currentUser !== 'undefined' ? currentUser : null;
        if (!targetUser || !caller) return;

        const isIncoming = rest[0]; // третий аргумент — isIncoming
        if (isIncoming) return;    // не уведомляем того, кто принимает

        try {
            const typeLabel = callType === 'audio' ? '🔊 Аудио звонок' : '📹 Видео звонок';
            await sendPushToUser(targetUser, {
                title: `📲 Входящий звонок от ${caller}`,
                body: typeLabel,
                icon: '/icon-192x192.png',
                badge: '/icon-192x192.png',
                tag: `call-${caller}`,
                url: `/index.html`
            });
        } catch (err) {
            console.warn('[PushNotify] Ошибка push (startCall):', err);
        }
    };
    console.log('[PushNotify] ✓ startCall пропатчен');
}

// ════════════════════════════════════════════════════════════
//  Инициализация — ждём, пока Firebase залогинит пользователя
// ════════════════════════════════════════════════════════════

(function initPushNotify() {
    let attempts = 0;

    const interval = setInterval(() => {
        attempts++;
        if (attempts > 60) { clearInterval(interval); return; } // 60 сек

        const ready = typeof currentUser !== 'undefined' && currentUser
                   && typeof sendMessage  === 'function';
        if (!ready) return;

        clearInterval(interval);

        patchSendMessage();
        patchCreateGroup();
        patchAddGroupMember();
        patchChannelSubscribe();
        patchStartCall();

        console.log('[PushNotify] ✅ Все патчи установлены для пользователя:', currentUser);
    }, 1000);
})();
