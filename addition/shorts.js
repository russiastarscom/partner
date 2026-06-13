// ==================== СИСТЕМА SHORTS v2 ====================
(function() {
    // Состояние Shorts
    let shortsData = [];
    let currentShortIndex = 0;
    let currentVideo = null;
    let currentFeed = 'all'; // 'all' | 'subs'
    let followingList = []; // кэш подписок

    // DOM элементы - получаем динамически
    function getShortsContainer() { return document.getElementById('shorts-container'); }
    function getShortsFeed() { return document.getElementById('shorts-feed'); }

    // ==================== ПОДПИСКИ ====================

    // Получить список подписок текущего пользователя
    async function getFollowing() {
        if (typeof currentUser === 'undefined' || !currentUser || typeof database === 'undefined') return [];
        try {
            const snap = await database.ref(`shorts_subscriptions/${currentUser}/following`).once('value');
            const data = snap.val();
            return data ? Object.keys(data) : [];
        } catch(e) {
            console.error('[Shorts] Error loading following:', e);
            return [];
        }
    }

    // Подписаться на пользователя
    window.shortsSubscribe = async function(authorId) {
        if (typeof currentUser === 'undefined' || !currentUser) {
            if (typeof showNotification === 'function') showNotification('Войдите в аккаунт');
            return;
        }
        if (authorId === currentUser) return; // на себя нельзя

        const isSub = followingList.includes(authorId);
        try {
            if (isSub) {
                // Отписка
                await database.ref(`shorts_subscriptions/${currentUser}/following/${authorId}`).remove();
                await database.ref(`shorts_subscriptions/${authorId}/followers/${currentUser}`).remove();
                followingList = followingList.filter(id => id !== authorId);
            } else {
                // Подписка
                await database.ref(`shorts_subscriptions/${currentUser}/following/${authorId}`).set(true);
                await database.ref(`shorts_subscriptions/${authorId}/followers/${currentUser}`).set(true);
                followingList.push(authorId);
            }
            // Обновляем все кнопки подписки на экране
            updateSubscribeButtons();
        } catch(e) {
            console.error('[Shorts] Subscribe error:', e);
            if (typeof showNotification === 'function') showNotification('Ошибка');
        }
    };

    // Обновить состояние всех кнопок подписки
    function updateSubscribeButtons() {
        document.querySelectorAll('.short-subscribe-btn').forEach(btn => {
            const aid = btn.dataset.author;
            if (!aid) return;
            const isSub = followingList.includes(aid) || aid === currentUser;
            btn.classList.toggle('subscribed', isSub);
            btn.textContent = aid === currentUser ? 'Вы' : (isSub ? 'Подписка' : 'Подписаться');
        });
        // Обновляем кнопку в профиле если открыт
        const profBtn = document.querySelector('.shorts-profile-follow-btn');
        if (profBtn) {
            const aid = profBtn.dataset.author;
            const isSub = followingList.includes(aid) || aid === currentUser;
            profBtn.classList.toggle('subscribed', isSub);
            profBtn.textContent = aid === currentUser ? 'Вы' : (isSub ? 'Подписка' : 'Подписаться');
        }
    }

    // Получить количество подписчиков
    async function getFollowersCount(userId) {
        if (typeof database === 'undefined') return 0;
        try {
            const snap = await database.ref(`shorts_subscriptions/${userId}/followers`).once('value');
            const data = snap.val();
            return data ? Object.keys(data).length : 0;
        } catch(e) { return 0; }
    }

    // ==================== ПРОСМОТР ПРОФИЛЯ ====================

    window.openShortsProfile = async function(authorId) {
        const container = getShortsContainer();
        if (!container || typeof database === 'undefined') return;

        // Создаём overlay профиля если нет
        let profile = container.querySelector('.shorts-profile');
        if (!profile) {
            profile = document.createElement('div');
            profile.className = 'shorts-profile';
            profile.innerHTML = `
                <div class="shorts-profile-header">
                    <button class="shorts-profile-back" onclick="closeShortsProfile()">←</button>
                    <div class="shorts-profile-avatar" id="sp-avatar"></div>
                    <div class="shorts-profile-info">
                        <div class="shorts-profile-name" id="sp-name"></div>
                        <div class="shorts-profile-stats" id="sp-stats">Загрузка...</div>
                    </div>
                    <button class="shorts-profile-follow-btn" id="sp-follow-btn" onclick="shortsSubscribe(this.dataset.author)">Подписаться</button>
                </div>
                <div class="shorts-profile-videos">
                    <div class="shorts-profile-loading" id="sp-loading">Загрузка видео...</div>
                    <div class="shorts-profile-grid" id="sp-grid" style="display:none"></div>
                </div>
            `;
            container.appendChild(profile);
        }

        // Приостанавливаем текущее видео
        safePauseVideo(currentVideo);

        // Загружаем данные автора
        const authorName = await getAuthorName(authorId);
        const authorEmoji = await getAuthorEmoji(authorId);
        const followersCount = await getFollowersCount(authorId);
        const isSub = followingList.includes(authorId) || authorId === currentUser;

        document.getElementById('sp-avatar').innerHTML = authorEmoji
            ? `<span style="font-size:1.5rem">${authorEmoji}</span>`
            : '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        document.getElementById('sp-name').textContent = authorName;
        document.getElementById('sp-stats').textContent = `${formatCount(followersCount)} подписчиков`;
        const followBtn = document.getElementById('sp-follow-btn');
        followBtn.dataset.author = authorId;
        followBtn.classList.toggle('subscribed', isSub);
        followBtn.textContent = authorId === currentUser ? 'Вы' : (isSub ? 'Подписка' : 'Подписаться');

        profile.classList.add('active');

        // Загружаем видео автора
        const grid = document.getElementById('sp-grid');
        const loading = document.getElementById('sp-loading');
        grid.innerHTML = '';
        grid.style.display = 'none';
        loading.style.display = 'block';

        try {
            const snapshot = await database.ref('shorts').orderByChild('author').equalTo(authorId).once('value');
            const data = snapshot.val();
            loading.style.display = 'none';

            if (!data) {
                grid.innerHTML = '<div class="shorts-profile-empty">Нет опубликованных видео</div>';
                grid.style.display = 'block';
                return;
            }

            const videos = Object.entries(data)
                .map(([id, s]) => ({id, ...s}))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            grid.innerHTML = videos.map(v => `
                <div class="shorts-profile-grid-item" onclick="playProfileVideo('${v.id}', '${authorId}')">
                    <video src="${v.videoUrl}" preload="metadata" muted></video>
                    <div class="grid-views">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        ${formatCount(v.views || 0)}
                    </div>
                </div>
            `).join('');
            grid.style.display = 'grid';
        } catch(e) {
            console.error('[Shorts] Profile load error:', e);
            loading.textContent = 'Ошибка загрузки';
        }
    };

    window.closeShortsProfile = function() {
        const container = getShortsContainer();
        if (!container) return;
        const profile = container.querySelector('.shorts-profile');
        if (profile) profile.classList.remove('active');
        // Возобновляем текущее видео
        if (currentVideo && currentVideo.paused) {
            const p = currentVideo.play();
            if (currentPlayPromise !== null) currentPlayPromise = p;
            p.catch(e => { if (e.name !== 'AbortError') console.log('Resume play:', e.message); });
        }
    };

    // Играть видео из профиля (закрыть профиль, показать это видео)
    window.playProfileVideo = function(shortId, authorId) {
        closeShortsProfile();
        // Ищем это видео в текущих shortsData
        const idx = shortsData.findIndex(s => s.id === shortId);
        if (idx >= 0) {
            showShort(idx);
        } else {
            // Если видео нет в текущей ленте, перезагружаем все и ищем
            currentFeed = 'all';
            loadShorts().then(() => {
                const newIdx = shortsData.findIndex(s => s.id === shortId);
                if (newIdx >= 0) showShort(newIdx);
            });
        }
    };

    // ==================== ВСПМОГАТЕЛЬНЫЕ ====================

    async function getAuthorName(authorId) {
        if (authorId === currentUser && typeof window._appGetUserName === 'function') {
            try { return await window._appGetUserName(); } catch(e) {}
        }
        // Попробуем найти в кэше shortsData
        const known = shortsData.find(s => s.author === authorId && s.authorName);
        if (known) return known.authorName;
        // Из Firebase
        if (typeof database !== 'undefined') {
            try {
                const snap = await database.ref(`users/${authorId}/displayName`).once('value');
                if (snap.val()) return snap.val();
            } catch(e) {}
        }
        return authorId;
    }

    async function getAuthorEmoji(authorId) {
        if (authorId === currentUser && typeof userEmoji !== 'undefined') return userEmoji;
        const known = shortsData.find(s => s.author === authorId && s.authorEmoji);
        return known ? known.authorEmoji : null;
    }

    // ==================== ОСНОВНОЙ ПОТОК ====================

    window.toggleShortsMode = function() {
        const shortsContainer = getShortsContainer();
        if (!shortsContainer) { console.error('Shorts container not found'); return; }
        if (shortsContainer.classList.contains('active')) {
            closeShortsMode();
        } else {
            openShortsMode();
        }
    };

    window.openShortsMode = async function() {
        const shortsContainer = getShortsContainer();
        const shortsFeed = getShortsFeed();
        if (!shortsContainer || !shortsFeed) { console.error('Shorts elements not found'); return; }

        shortsContainer.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Загружаем подписки
        followingList = await getFollowing();

        // Загружаем shorts
        await loadShorts();

        // Обработчики свайпов
        shortsFeed.addEventListener('touchstart', handleTouchStart, { passive: true });
        shortsFeed.addEventListener('touchmove', handleTouchMove, { passive: false });
        shortsFeed.addEventListener('touchend', handleTouchEnd, { passive: true });
        shortsFeed.addEventListener('wheel', handleWheel, { passive: false });
        shortsFeed.addEventListener('mousedown', handleMouseDown);

        // Обновляем табы
        updateFeedTabs();
    };

    window.closeShortsMode = function() {
        const shortsContainer = getShortsContainer();
        const shortsFeed = getShortsFeed();
        if (!shortsContainer || !shortsFeed) return;

        shortsContainer.classList.remove('active');
        document.body.style.overflow = '';

        safePauseVideo(currentVideo);
        currentVideo = null;

        // Убираем обработчики
        shortsFeed.removeEventListener('touchstart', handleTouchStart);
        shortsFeed.removeEventListener('touchmove', handleTouchMove);
        shortsFeed.removeEventListener('touchend', handleTouchEnd);
        shortsFeed.removeEventListener('wheel', handleWheel);
        shortsFeed.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // Закрываем профиль
        const profile = shortsContainer.querySelector('.shorts-profile');
        if (profile) profile.classList.remove('active');

        // Возвращаемся к предыдущей вкладке
        if (typeof tabBeforeShorts !== 'undefined' && typeof tabOrder !== 'undefined' && typeof switchTab === 'function') {
            var prevTab = tabOrder[tabBeforeShorts] || 'chats';
            previousTabIndex = -1;
            switchTab(prevTab);
        }
    };

    // ==================== ТАБЫ ЛЕНТЫ ====================

    function updateFeedTabs() {
        const allTab = document.getElementById('shorts-tab-all');
        const subsTab = document.getElementById('shorts-tab-subs');
        if (!allTab || !subsTab) return;
        allTab.classList.toggle('active', currentFeed === 'all');
        subsTab.classList.toggle('active', currentFeed === 'subs');
    }

    window.switchShortsFeed = async function(feed) {
        if (feed === currentFeed) return;
        currentFeed = feed;
        updateFeedTabs();
        await loadShorts();
    };

    // ==================== ЗАГРУЗКА SHORTS ====================

    async function loadShorts() {
        if (typeof database === 'undefined') { renderEmptyShorts(); return; }

        try {
            const snapshot = await database.ref('shorts').orderByChild('createdAt').limitToLast(50).once('value');
            const data = snapshot.val();

            if (!data) { renderEmptyShorts(); return; }

            let allShorts = Object.entries(data)
                .map(([id, short]) => ({ id, ...short }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            // Фильтруем по подпискам если нужно
            if (currentFeed === 'subs' && followingList.length > 0) {
                allShorts = allShorts.filter(s => followingList.includes(s.author) || s.author === currentUser);
            }

            shortsData = allShorts;
            renderShorts();
        } catch (e) {
            console.error('Error loading shorts:', e);
            renderEmptyShorts();
        }
    }

    // ==================== ОТРИСОВКА ====================

    function renderEmptyShorts() {
        const shortsFeed = getShortsFeed();
        if (!shortsFeed) return;
        const msg = currentFeed === 'subs'
            ? 'Подпишитесь на авторов, чтобы видеть их видео здесь'
            : 'Станьте первым, кто опубликует короткое видео!';
        shortsFeed.innerHTML = `
            <div class="shorts-empty">
                <div class="shorts-empty-icon"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div>
                <div class="shorts-empty-title">Нет видео</div>
                <div class="shorts-empty-text">${msg}</div>
                <button class="shorts-upload-btn" onclick="openShortsUpload()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Опубликовать видео</button>
            </div>
        `;
    }

    function renderShorts() {
        if (!shortsData.length) { renderEmptyShorts(); return; }

        const shortsFeed = getShortsFeed();
        if (!shortsFeed) return;

        const userId = typeof currentUser !== 'undefined' && currentUser ? currentUser : 'anonymous';
        const likedKey = `shorts_liked_${userId}`;
        const liked = JSON.parse(localStorage.getItem(likedKey) || '[]');

        shortsData.forEach(short => { short.userLiked = liked.includes(short.id); });

        shortsFeed.innerHTML = shortsData.map((short, index) => {
            const isOwn = short.author === currentUser;
            const isSub = isOwn || followingList.includes(short.author);
            const subLabel = isOwn ? 'Вы' : (isSub ? 'Подписка' : 'Подписаться');
            const subClass = isOwn || isSub ? 'subscribed' : '';

            return `
            <div class="short-item ${index === 0 ? 'active' : ''}" data-index="${index}" data-id="${short.id}">
                <video class="short-video" src="${short.videoUrl}" loop playsinline preload="auto" onclick="toggleShortVideo(this)"></video>
                <div class="short-overlay">
                    <div class="short-author" onclick="openShortsProfile('${escapeAttr(short.author)}')">
                        <div class="short-author-avatar">${short.authorEmoji ? '<span style="font-size:1.2rem">'+short.authorEmoji+'</span>' : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'}</div>
                        <span class="short-author-name">${escapeHtml(short.authorName || short.author)}</span>
                    </div>
                    ${!isOwn ? `<button class="short-subscribe-btn ${subClass}" data-author="${escapeAttr(short.author)}" onclick="event.stopPropagation();shortsSubscribe('${escapeAttr(short.author)}')">${subLabel}</button>` : ''}
                    <div class="short-description">${escapeHtml(short.description || '')}</div>
                </div>
                <div class="short-actions">
                    <button class="short-action-btn ${short.userLiked ? 'liked' : ''}" onclick="toggleShortLike('${short.id}')">
                        <div class="short-action-icon">${short.userLiked ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'}</div>
                        <span class="short-action-count">${formatCount(short.likes || 0)}</span>
                    </button>
                    <div class="short-action-btn" style="cursor:default">
                        <div class="short-action-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div>
                        <span class="short-action-count">${formatCount(short.views || 0)}</span>
                    </div>
                    <button class="short-action-btn" onclick="openShortsProfile('${escapeAttr(short.author)}')">
                        <div class="short-action-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
                        <span class="short-action-count">Профиль</span>
                    </button>
                    <button class="short-action-btn" onclick="shareShort('${short.id}')">
                        <div class="short-action-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></div>
                        <span class="short-action-count">Поделиться</span>
                    </button>
                </div>
            </div>`;
        }).join('');

        showShort(0);
    }

    // ==================== ВИДЕО УПРАВЛЕНИЕ ====================

    let currentPlayPromise = null;

    function safePauseVideo(video) {
        if (!video) return;
        if (currentPlayPromise) {
            currentPlayPromise.then(() => { video.pause(); }).catch(() => { video.pause(); });
            currentPlayPromise = null;
        } else {
            video.pause();
        }
    }

    function showShort(index, direction = null) {
        if (index < 0 || index >= shortsData.length) return;

        const prevIndex = currentShortIndex;
        safePauseVideo(currentVideo);

        const allItems = document.querySelectorAll('.short-item');
        const prevItem = document.querySelector(`.short-item[data-index="${prevIndex}"]`);
        const nextItem = document.querySelector(`.short-item[data-index="${index}"]`);

        if (direction === null) direction = index > prevIndex ? 'up' : 'down';

        allItems.forEach(item => { item.classList.remove('active', 'prev', 'next'); });

        if (prevItem && prevIndex !== index) {
            prevItem.classList.add(direction === 'up' ? 'prev' : 'next');
        }

        if (nextItem) {
            nextItem.classList.add('active');
            currentVideo = nextItem.querySelector('.short-video');
            if (currentVideo) {
                currentVideo.currentTime = 0;
                currentPlayPromise = currentVideo.play();
                currentPlayPromise.catch(e => {
                    if (e.name !== 'AbortError') console.log('Autoplay prevented:', e.message);
                });
            }
            incrementViews(shortsData[index].id);
        }

        currentShortIndex = index;
    }

    window.toggleShortVideo = function(video) {
        if (video.paused) {
            const p = video.play();
            if (video === currentVideo) currentPlayPromise = p;
            p.catch(e => { if (e.name !== 'AbortError') console.log('Play prevented:', e.message); });
        } else {
            safePauseVideo(video);
        }
    };

    // ==================== ЛАЙКИ ====================

    window.toggleShortLike = async function(shortId) {
        if (typeof currentUser === 'undefined' || !currentUser) {
            if (typeof showNotification === 'function') showNotification('Войдите в аккаунт');
            return;
        }

        const short = shortsData.find(s => s.id === shortId);
        if (!short) return;

        const likedKey = `shorts_liked_${currentUser}`;
        let liked = JSON.parse(localStorage.getItem(likedKey) || '[]');

        const btn = document.querySelector(`.short-item[data-id="${shortId}"] .short-action-btn`);
        const isLiked = liked.includes(shortId);

        if (isLiked) {
            short.likes = Math.max(0, (short.likes || 1) - 1);
            short.userLiked = false;
            liked = liked.filter(id => id !== shortId);
            if (btn) { btn.classList.remove('liked'); btn.querySelector('.short-action-icon').textContent = '🤍'; }
        } else {
            short.likes = (short.likes || 0) + 1;
            short.userLiked = true;
            liked.push(shortId);
            if (btn) { btn.classList.add('liked'); btn.querySelector('.short-action-icon').textContent = '❤️'; }
        }

        const countEl = btn?.querySelector('.short-action-count');
        if (countEl) countEl.textContent = formatCount(short.likes);

        localStorage.setItem(likedKey, JSON.stringify(liked));

        try {
            await database.ref(`shorts/${shortId}/likes`).set(short.likes);
        } catch (e) { console.error('Error updating like:', e); }
    };

    // ==================== ПРОСМОТРЫ ====================

    async function incrementViews(shortId) {
        if (typeof database === 'undefined') return;
        const userId = typeof currentUser !== 'undefined' && currentUser ? currentUser : 'anonymous';
        const viewedKey = `shorts_viewed_${userId}`;
        let viewed = JSON.parse(localStorage.getItem(viewedKey) || '[]');
        if (viewed.includes(shortId)) return;

        try {
            await database.ref(`shorts/${shortId}/views`).transaction(v => (v || 0) + 1);
            viewed.push(shortId);
            if (viewed.length > 1000) viewed = viewed.slice(-1000);
            localStorage.setItem(viewedKey, JSON.stringify(viewed));
        } catch (e) { console.error('Error incrementing views:', e); }
    }

    // ==================== УДАЛЕНИЕ ====================

    window.deleteShort = async function(shortId) {
        if (typeof currentUser === 'undefined' || !currentUser) {
            if (typeof showNotification === 'function') showNotification('Войдите в аккаунт');
            return;
        }
        if (!confirm('Удалить это видео?')) return;

        try {
            await database.ref(`shorts/${shortId}`).remove();
            if (typeof showNotification === 'function') showNotification('Видео удалено');
            await loadShorts();
        } catch (e) {
            console.error('Error deleting short:', e);
            if (typeof showNotification === 'function') showNotification('Ошибка удаления');
        }
    };

    // ==================== ПОДЕЛИТЬСЯ ====================

    window.shareShort = function(shortId) {
        const url = `${window.location.origin}${window.location.pathname}?short=${shortId}`;
        if (navigator.share) {
            navigator.share({ title: 'Shorts', url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url).then(() => {
                if (typeof showNotification === 'function') showNotification('Ссылка скопирована');
            });
        }
    };

    // ==================== СВАЙПЫ И МЫШЬ ====================

    let isDragging = false;
    let dragStartY = 0;
    let dragCurrentY = 0;

    function handleMouseDown(e) {
        isDragging = true;
        dragStartY = e.clientY;
        dragCurrentY = dragStartY;
        const currentItem = document.querySelector('.short-item.active');
        if (currentItem) currentItem.classList.add('dragging');
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e) {
        if (!isDragging) return;
        dragCurrentY = e.clientY;
        const diff = dragCurrentY - dragStartY;
        const currentItem = document.querySelector('.short-item.active');
        const nextItem = document.querySelector(`.short-item[data-index="${currentShortIndex + 1}"]`);
        const prevItem = document.querySelector(`.short-item[data-index="${currentShortIndex - 1}"]`);
        if (currentItem) currentItem.style.transform = `translateY(${diff}px)`;
        if (diff < 0 && nextItem) { nextItem.style.transform = `translateY(calc(100% + ${diff}px))`; nextItem.style.zIndex = '2'; }
        if (diff > 0 && prevItem) { prevItem.style.transform = `translateY(calc(-100% + ${diff}px))`; prevItem.style.zIndex = '2'; }
    }

    function handleMouseUp(e) {
        if (!isDragging) return;
        isDragging = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        const diff = dragCurrentY - dragStartY;
        const threshold = window.innerHeight * 0.15;
        document.querySelectorAll('.short-item').forEach(item => {
            item.classList.remove('dragging');
            item.style.transform = '';
            item.style.zIndex = '';
        });
        if (diff < -threshold && currentShortIndex < shortsData.length - 1) showShort(currentShortIndex + 1, 'up');
        else if (diff > threshold && currentShortIndex > 0) showShort(currentShortIndex - 1, 'down');
    }

    function handleTouchStart(e) {
        isDragging = true;
        dragStartY = e.touches[0].clientY;
        dragCurrentY = dragStartY;
        const currentItem = document.querySelector('.short-item.active');
        if (currentItem) currentItem.classList.add('dragging');
    }

    function handleTouchMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        dragCurrentY = e.touches[0].clientY;
        const diff = dragCurrentY - dragStartY;
        const currentItem = document.querySelector('.short-item.active');
        const nextItem = document.querySelector(`.short-item[data-index="${currentShortIndex + 1}"]`);
        const prevItem = document.querySelector(`.short-item[data-index="${currentShortIndex - 1}"]`);
        if (currentItem) currentItem.style.transform = `translateY(${diff}px)`;
        if (diff < 0 && nextItem) { nextItem.style.transform = `translateY(calc(100% + ${diff}px))`; nextItem.style.zIndex = '2'; }
        if (diff > 0 && prevItem) { prevItem.style.transform = `translateY(calc(-100% + ${diff}px))`; prevItem.style.zIndex = '2'; }
    }

    function handleTouchEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        const diff = dragCurrentY - dragStartY;
        const threshold = window.innerHeight * 0.25;
        document.querySelectorAll('.short-item').forEach(item => {
            item.classList.remove('dragging');
            item.style.transform = '';
            item.style.zIndex = '';
        });
        if (diff < -threshold && currentShortIndex < shortsData.length - 1) showShort(currentShortIndex + 1, 'up');
        else if (diff > threshold && currentShortIndex > 0) showShort(currentShortIndex - 1, 'down');
    }

    let wheelTimeout = null;
    function handleWheel(e) {
        e.preventDefault();
        if (wheelTimeout) return;
        wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 400);
        if (e.deltaY > 30) showShort(currentShortIndex + 1, 'up');
        else if (e.deltaY < -30) showShort(currentShortIndex - 1, 'down');
    }

    // ==================== УТИЛИТЫ ====================

    function formatCount(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function escapeAttr(text) {
        if (!text) return '';
        return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    // ==================== ЗАГРУЗКА ВИДЕО ====================

    window.openShortsUpload = function() {
        if (typeof currentUser === 'undefined' || !currentUser) {
            if (typeof showNotification === 'function') showNotification('Войдите в аккаунт');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'shorts-upload-modal';
        modal.style.zIndex = '9500';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:400px;z-index:9501">
                <h2 class="modal-title">📤 Опубликовать Short</h2>
                <div style="margin:16px 0">
                    <div id="shorts-upload-zone" style="border:2px dashed var(--border-color);border-radius:16px;padding:30px;text-align:center;cursor:pointer;transition:all 0.2s">
                        <div style="font-size:3rem;margin-bottom:10px">🎬</div>
                        <div style="font-size:0.9rem;color:var(--text-light)">Нажмите или перетащите видео</div>
                        <div style="font-size:0.75rem;color:var(--text-light);margin-top:8px;opacity:0.7">MP4, WebM • до 60 секунд • до 50MB</div>
                    </div>
                    <input type="file" id="shorts-file-input" accept="video/mp4,video/webm" style="display:none">
                    <div id="shorts-preview" style="display:none;margin-top:16px">
                        <video id="shorts-preview-video" style="max-width:100%;max-height:300px;border-radius:12px;object-fit:contain;background:#000" playsinline muted autoplay loop></video>
                    </div>
                    <div id="shorts-upload-status" style="display:none;font-size:0.85rem;color:var(--primary-color);font-weight:600;margin-top:12px;text-align:center;"></div>
                    <div style="margin-top:16px">
                        <textarea id="shorts-description" placeholder="Описание видео..." style="width:100%;height:80px;padding:12px;border:1px solid var(--border-color);border-radius:12px;font-size:0.9rem;resize:none;font-family:inherit;background:var(--input-bg);color:var(--text-color)"></textarea>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn" onclick="document.getElementById('shorts-upload-modal').remove()">Отмена</button>
                    <button class="modal-btn modal-btn-primary" id="shorts-publish-btn" onclick="publishShort()">Опубликовать</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const uploadZone = document.getElementById('shorts-upload-zone');
        const fileInput = document.getElementById('shorts-file-input');
        const preview = document.getElementById('shorts-preview');
        const previewVideo = document.getElementById('shorts-preview-video');

        uploadZone.onclick = () => fileInput.click();

        uploadZone.ondragover = (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--primary-color)';
            uploadZone.style.background = 'rgba(108,92,231,0.05)';
        };
        uploadZone.ondragleave = () => {
            uploadZone.style.borderColor = 'var(--border-color)';
            uploadZone.style.background = '';
        };
        uploadZone.ondrop = (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--border-color)';
            uploadZone.style.background = '';
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('video/')) handleShortFile(file);
        };
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) handleShortFile(file);
        };

        window._shortUploadFile = null;

        function handleShortFile(file) {
            if (file.size > 50 * 1024 * 1024) {
                if (typeof showNotification === 'function') showNotification('Файл слишком большой (макс 50MB)');
                return;
            }
            window._shortUploadFile = file;
            previewVideo.src = URL.createObjectURL(file);
            preview.style.display = 'block';
            uploadZone.style.display = 'none';
        }
    };

    window.publishShort = async function() {
        const file = window._shortUploadFile;
        const description = document.getElementById('shorts-description')?.value || '';

        if (!file) {
            if (typeof showNotification === 'function') showNotification('Выберите видео');
            return;
        }

        const btn = document.getElementById('shorts-publish-btn');
        const statusEl = document.getElementById('shorts-upload-status');

        if (btn) { btn.disabled = true; btn.textContent = 'Загрузка...'; }
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = '⏳ Подготовка...'; }

        try {
            if (statusEl) statusEl.textContent = '🎬 Загрузка видео...';

            const CLOUD = 'dzrlzyjpg';
            const PRESET = 'twiin_unsigned';
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', PRESET);
            formData.append('folder', 'twiin_shorts');

            const response = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/video/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!data.secure_url) {
                throw new Error(data.error ? data.error.message : 'Ошибка загрузки видео');
            }

            if (statusEl) statusEl.textContent = '💾 Сохранение...';

            const shortRef = database.ref('shorts').push();
            const shortData = {
                id: shortRef.key,
                videoUrl: data.secure_url,
                description: description,
                author: currentUser,
                authorName: typeof window._appGetUserName === 'function' ? await window._appGetUserName() : currentUser,
                authorEmoji: typeof userEmoji !== 'undefined' ? userEmoji : '😊',
                likes: 0,
                views: 0,
                createdAt: Date.now()
            };

            await shortRef.set(shortData);

            document.getElementById('shorts-upload-modal')?.remove();
            if (typeof showNotification === 'function') showNotification('Видео опубликовано!');
            await loadShorts();

        } catch (e) {
            console.error('Error publishing short:', e);
            if (statusEl) statusEl.style.display = 'none';
            if (typeof showNotification === 'function') showNotification('Ошибка: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Опубликовать'; }
        }
    };

    console.log('[Shorts v2] System initialized — subscriptions, profile, feed tabs');
})();
// ==================== КОНЕЦ СИСТЕМЫ SHORTS v2 ====================
