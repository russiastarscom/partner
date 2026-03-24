/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║          TWIN — ПЛАГИН СИСТЕМЫ ПИТОМЦЕВ v1.0             ║
 * ║    Подключение: <script src="pet-plugin.js"></script>    ║
 * ║    После Firebase, перед закрывающим </body>             ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * ЗАВИСИМОСТИ (должны быть доступны глобально к моменту init):
 *   - window.database        — Firebase Realtime Database ref
 *   - window.currentUser     — текущий юзернейм (строка)
 *   - window.showNotification(msg) — функция показа уведомлений
 *   - window.escapeHtml(str)       — санитайзер HTML
 *   - window.openUserProfile(username) — открыть профиль пользователя
 *
 * ЭКСПОРТИРУЕТ в window:
 *   openPetSetup()
 *   openPetInteract()
 *   openPetZoo()
 *   petAction(action)        — 'feed' | 'play' | 'sleep' | 'pat'
 *   loadMyPetCard()
 *   loadAndRenderPetForProfile(username, containerId)
 *   PetPlugin.init()         — вызывается автоматически
 */

(function PetPlugin() {

    // ─────────────────────────────────────────────────────────
    // 1. ДАННЫЕ
    // ─────────────────────────────────────────────────────────

    const PET_TYPES = [
        { emoji: '🐱', label: 'Котик',    stages: ['🥚','🐱','🐈','👑🐱'] },
        { emoji: '🐶', label: 'Собака',   stages: ['🥚','🐶','🦮','👑🐶'] },
        { emoji: '🐉', label: 'Дракон',   stages: ['🥚','🐣','🐲','👑🐉'] },
        { emoji: '🦊', label: 'Лиса',     stages: ['🥚','🦊','🦊','👑🦊'] },
        { emoji: '🐼', label: 'Панда',    stages: ['🥚','🐼','🐼','👑🐼'] },
        { emoji: '🦄', label: 'Единорог', stages: ['🥚','🦄','🦄','👑🦄'] },
        { emoji: '🐸', label: 'Лягушка',  stages: ['🥚','🐸','🐸','👑🐸'] },
        { emoji: '🦋', label: 'Бабочка',  stages: ['🥚','🐛','🦋','👑🦋'] },
    ];

    const PET_STAGE_NAMES = ['Яйцо', 'Детёныш', 'Взрослый', 'Легенда ✨'];

    const PET_PHRASES = {
        happy:   ['Мур-мур~ 😻', 'Я счастлив!', 'Обожаю тебя! ❤️', 'Это лучший день!', 'Ты лучший хозяин! ✨'],
        hungry:  ['Есть хочу... 🍖', 'Живот урчит...', 'Покорми меня, пожалуйста!', 'Голодааааю! 😿'],
        bored:   ['Скучно... 😒', 'Поиграй со мной!', 'Может, поиграем? 🎾', 'Хочу веселья!'],
        tired:   ['Зеваю... 😴', 'Хочу спать...', 'Устал немного...', 'Дай поспать чуть-чуть...'],
        neutral: ['...', '*смотрит на тебя*', '*виляет хвостом*', 'Мяу~'],
        feed:    ['Ням-ням! Спасибо! 😋', 'Вкусняшка! 🎉', 'Объеденье!', 'Так вкусно! Ещё?'],
        play:    ['Ура! Играем! 🎾', 'Вжух-вжух! Поймал!', 'Это так весело! 😄', 'Ещё-ещё-ещё!'],
        sleep:   ['Zzz... 💤', '*сладко засыпает*', 'Спокойной ночи~ 🌙', 'Zzz... хрр...'],
        pat:     ['Мррр~ ❤️', '*мурлычет*', 'Ещё-ещё! 🥰', 'Тепло и уютно...'],
    };

    // ─────────────────────────────────────────────────────────
    // 2. ЧИСТЫЕ УТИЛИТЫ (без DOM, без Firebase)
    // ─────────────────────────────────────────────────────────

    function getPetStageIndex(hours) {
        if (hours < 48)   return 0;
        if (hours < 336)  return 1;
        if (hours < 1440) return 2;
        return 3;
    }

    function getPetStageProgress(hours) {
        if (hours < 48)   return (hours / 48) * 100;
        if (hours < 336)  return ((hours - 48) / 288) * 100;
        if (hours < 1440) return ((hours - 336) / 1104) * 100;
        return 100;
    }

    function getPetEmoji(typeEmoji, hours) {
        const def = PET_TYPES.find(p => p.emoji === typeEmoji) || PET_TYPES[0];
        return def.stages[getPetStageIndex(hours)] || typeEmoji;
    }

    function calcPetStats(pet) {
        const now = Date.now();
        const hungerDecay = Math.floor((now - (pet.lastFed    || now)) / (4  * 3600000)) * 10;
        const moodDecay   = Math.floor((now - (pet.lastPlayed || now)) / (3  * 3600000)) * 10;
        const energyDecay = Math.floor((now - (pet.lastSlept  || now)) / (5  * 3600000)) * 10;
        return {
            hunger: Math.max(0, Math.min(100, (pet.hunger ?? 100) - hungerDecay)),
            mood:   Math.max(0, Math.min(100, (pet.mood   ?? 100) - moodDecay)),
            energy: Math.max(0, Math.min(100, (pet.energy ?? 100) - energyDecay)),
        };
    }

    function petRandPhrase(key) {
        const arr = PET_PHRASES[key] || PET_PHRASES.neutral;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function petStatPhrase(stats) {
        if (stats.hunger < 20) return petRandPhrase('hungry');
        if (stats.mood   < 20) return petRandPhrase('bored');
        if (stats.energy < 20) return petRandPhrase('tired');
        if (stats.hunger > 80 && stats.mood > 80 && stats.energy > 80) return petRandPhrase('happy');
        return petRandPhrase('neutral');
    }

    // Краткий хелпер для firebase пути
    function petRef(username) {
        if (!window.database) throw new Error('[PetPlugin] window.database не определён');
        return window.database.ref('users/' + encodeURIComponent(username) + '/pet');
    }

    // ─────────────────────────────────────────────────────────
    // 3. ИНЪЕКЦИЯ CSS (чтобы не трогать главный файл)
    // ─────────────────────────────────────────────────────────

    function injectStyles() {
        if (document.getElementById('pet-plugin-styles')) return;
        const style = document.createElement('style');
        style.id = 'pet-plugin-styles';
        style.textContent = `
            /* === PET PLUGIN STYLES === */
            .pet-card {
                background: linear-gradient(135deg, rgba(108,92,231,0.08) 0%, rgba(162,155,254,0.12) 100%);
                border: 1.5px solid rgba(108,92,231,0.2);
                border-radius: 18px;
                padding: 16px;
                margin: 16px 20px;
                display: flex;
                align-items: center;
                gap: 14px;
                cursor: pointer;
                transition: box-shadow 0.2s, transform 0.15s;
            }
            .pet-card:hover {
                box-shadow: 0 4px 20px rgba(108,92,231,0.18);
                transform: translateY(-1px);
            }
            .pet-avatar {
                width: 72px; height: 72px;
                border-radius: 50%;
                background: linear-gradient(135deg, #a29bfe, #6c5ce7);
                display: flex; align-items: center; justify-content: center;
                font-size: 2.4rem; flex-shrink: 0;
                box-shadow: 0 3px 12px rgba(108,92,231,0.3);
                position: relative;
                animation: petBounce 3s ease-in-out infinite;
            }
            @keyframes petBounce {
                0%, 100% { transform: translateY(0); }
                50%       { transform: translateY(-5px); }
            }
            .pet-info { flex: 1; min-width: 0; }
            .pet-name  { font-weight: 700; font-size: 1.05rem; color: var(--text-color); margin-bottom: 2px; }
            .pet-type  { font-size: 0.8rem; color: var(--text-light); margin-bottom: 6px; }
            .pet-age-bar-wrap { display: flex; align-items: center; gap: 8px; }
            .pet-age-bar  { flex: 1; height: 7px; background: var(--border-color); border-radius: 10px; overflow: hidden; }
            .pet-age-fill { height: 100%; border-radius: 10px; background: linear-gradient(90deg, #a29bfe, #6c5ce7); transition: width 0.5s ease; }
            .pet-age-label { font-size: 0.72rem; color: var(--text-light); white-space: nowrap; font-weight: 600; }
            .pet-stage-badge {
                display: inline-block; font-size: 0.7rem; font-weight: 700;
                padding: 2px 9px; border-radius: 20px;
                background: linear-gradient(90deg, #a29bfe, #6c5ce7);
                color: #fff; margin-top: 5px;
            }
            /* Сетка типов питомцев */
            #pet-setup-modal .pet-type-grid {
                display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 10px 0 16px;
            }
            .pet-type-btn {
                background: var(--bg-color); border: 2px solid var(--border-color);
                border-radius: 14px; padding: 12px 8px; cursor: pointer;
                text-align: center; transition: border-color 0.15s, background 0.15s;
                font-family: inherit;
            }
            .pet-type-btn:hover    { background: rgba(108,92,231,0.07); border-color: var(--primary-color); }
            .pet-type-btn.selected { border-color: var(--primary-color); background: rgba(108,92,231,0.1); }
            .pet-type-btn .pt-emoji { font-size: 2rem; display: block; margin-bottom: 4px; }
            .pet-type-btn .pt-label { font-size: 0.75rem; font-weight: 600; color: var(--text-color); }
            /* Превью */
            .pet-big-preview {
                text-align: center; font-size: 4rem; margin: 10px 0;
                animation: petBounce 2s ease-in-out infinite;
            }
            /* Зоопарк */
            .pets-list-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; padding: 4px 2px 10px; }
            .pets-list-card {
                background: var(--modal-bg); border: 1.5px solid var(--border-color);
                border-radius: 16px; padding: 16px 12px 12px; text-align: center;
                cursor: pointer; transition: box-shadow 0.18s, transform 0.15s;
            }
            .pets-list-card:hover { box-shadow: 0 4px 16px rgba(108,92,231,0.15); transform: translateY(-2px); }
            .pets-list-card .plc-emoji    { font-size: 2.4rem; display: block; margin-bottom: 8px; }
            .pets-list-card .plc-pet-name { font-weight: 700; font-size: 0.92rem; color: var(--text-color); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .pets-list-card .plc-owner    { font-size: 0.75rem; color: var(--text-light); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .pets-list-card .plc-stage    { font-size: 0.7rem; font-weight: 700; padding: 2px 9px; border-radius: 20px; background: linear-gradient(90deg, #a29bfe, #6c5ce7); color: #fff; display: inline-block; }
        `;
        document.head.appendChild(style);
    }

    // ─────────────────────────────────────────────────────────
    // 4. ИНЪЕКЦИЯ HTML-МОДАЛОК
    // ─────────────────────────────────────────────────────────

    function injectModals() {
        if (document.getElementById('pet-plugin-modals')) return;
        const wrap = document.createElement('div');
        wrap.id = 'pet-plugin-modals';
        wrap.innerHTML = `
            <!-- Настройка питомца -->
            <div class="modal" id="pet-setup-modal">
                <div class="modal-content">
                    <h2 class="modal-title">🐾 Мой питомец</h2>
                    <div class="pet-big-preview" id="pet-setup-preview">🐱</div>
                    <input type="text" class="modal-input" id="pet-name-input" placeholder="Имя питомца" maxlength="24" style="margin-bottom:14px;">
                    <label style="font-size:0.85rem;font-weight:700;color:var(--text-light);margin-bottom:8px;display:block;">Выберите питомца:</label>
                    <div class="pet-type-grid" id="pet-type-grid"></div>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn-secondary" id="pet-setup-cancel">Отмена</button>
                        <button class="modal-btn modal-btn-primary"   id="pet-setup-save">💾 Сохранить</button>
                    </div>
                </div>
            </div>

            <!-- Зоопарк -->
            <div class="modal" id="pet-zoo-modal">
                <div class="modal-content">
                    <h2 class="modal-title">🦁 Зоопарк</h2>
                    <div id="pets-zoo-list" style="min-height:80px;"></div>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn-secondary" id="pet-zoo-close">Закрыть</button>
                    </div>
                </div>
            </div>

            <!-- Взаимодействие -->
            <div class="modal" id="pet-interact-modal">
                <div class="modal-content" style="text-align:center;">
                    <h2 class="modal-title">🐾 <span id="pet-interact-name">Питомец</span></h2>
                    <div id="pet-interact-emoji" style="font-size:5rem;margin:10px 0 6px;display:block;animation:petBounce 2s ease-in-out infinite;transition:transform 0.15s;">🐱</div>
                    <span id="pet-interact-stage" style="font-size:0.78rem;font-weight:700;padding:3px 12px;border-radius:20px;background:linear-gradient(90deg,#a29bfe,#6c5ce7);color:#fff;display:inline-block;margin-bottom:12px;">Яйцо</span>
                    <div id="pet-interact-speech" style="min-height:24px;font-size:0.93rem;color:var(--text-light);margin-bottom:14px;font-style:italic;">...</div>

                    <!-- Полоски -->
                    <div style="text-align:left;margin-bottom:16px;display:flex;flex-direction:column;gap:8px;">
                        <div>
                            <div style="display:flex;justify-content:space-between;font-size:0.76rem;font-weight:600;color:var(--text-light);margin-bottom:3px;">
                                <span>🍖 Сытость</span><span id="pet-hunger-pct">100%</span>
                            </div>
                            <div style="height:8px;background:var(--border-color);border-radius:10px;overflow:hidden;">
                                <div id="pet-hunger-bar" style="height:100%;border-radius:10px;background:linear-gradient(90deg,#fd79a8,#e17055);transition:width 0.5s;width:100%;"></div>
                            </div>
                        </div>
                        <div>
                            <div style="display:flex;justify-content:space-between;font-size:0.76rem;font-weight:600;color:var(--text-light);margin-bottom:3px;">
                                <span>😊 Настроение</span><span id="pet-mood-pct">100%</span>
                            </div>
                            <div style="height:8px;background:var(--border-color);border-radius:10px;overflow:hidden;">
                                <div id="pet-mood-bar" style="height:100%;border-radius:10px;background:linear-gradient(90deg,#a29bfe,#6c5ce7);transition:width 0.5s;width:100%;"></div>
                            </div>
                        </div>
                        <div>
                            <div style="display:flex;justify-content:space-between;font-size:0.76rem;font-weight:600;color:var(--text-light);margin-bottom:3px;">
                                <span>⚡ Энергия</span><span id="pet-energy-pct">100%</span>
                            </div>
                            <div style="height:8px;background:var(--border-color);border-radius:10px;overflow:hidden;">
                                <div id="pet-energy-bar" style="height:100%;border-radius:10px;background:linear-gradient(90deg,#55efc4,#00b894);transition:width 0.5s;width:100%;"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Кнопки действий -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                        <button onclick="petAction('feed')"  style="padding:10px;border:1.5px solid rgba(108,92,231,0.25);background:rgba(108,92,231,0.07);border-radius:12px;font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;color:var(--text-color);">🍖 Покормить</button>
                        <button onclick="petAction('play')"  style="padding:10px;border:1.5px solid rgba(108,92,231,0.25);background:rgba(108,92,231,0.07);border-radius:12px;font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;color:var(--text-color);">🎾 Поиграть</button>
                        <button onclick="petAction('sleep')" style="padding:10px;border:1.5px solid rgba(108,92,231,0.25);background:rgba(108,92,231,0.07);border-radius:12px;font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;color:var(--text-color);">💤 Поспать</button>
                        <button onclick="petAction('pat')"   style="padding:10px;border:1.5px solid rgba(108,92,231,0.25);background:rgba(108,92,231,0.07);border-radius:12px;font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;color:var(--text-color);">❤️ Погладить</button>
                    </div>
                    <div id="pet-last-fed-label" style="font-size:0.74rem;color:var(--text-light);margin-bottom:10px;"></div>

                    <div class="modal-actions">
                        <button class="modal-btn modal-btn-secondary" onclick="document.getElementById('pet-interact-modal').classList.remove('active')">Закрыть</button>
                        <button class="modal-btn" onclick="document.getElementById('pet-interact-modal').classList.remove('active');openPetSetup();" style="font-size:0.82rem;">✏️ Изменить</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);
    }

    // ─────────────────────────────────────────────────────────
    // 5. ЛОГИКА UI
    // ─────────────────────────────────────────────────────────

    let _selectedPetType = PET_TYPES[0].emoji;

    function buildPetTypeGrid() {
        const grid = document.getElementById('pet-type-grid');
        if (!grid) return;
        grid.innerHTML = '';
        PET_TYPES.forEach(pt => {
            const btn = document.createElement('button');
            btn.className = 'pet-type-btn' + (_selectedPetType === pt.emoji ? ' selected' : '');
            btn.innerHTML = `<span class="pt-emoji">${pt.emoji}</span><span class="pt-label">${pt.label}</span>`;
            btn.addEventListener('click', () => {
                _selectedPetType = pt.emoji;
                document.querySelectorAll('.pet-type-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                updatePetSetupPreview();
            });
            grid.appendChild(btn);
        });
    }

    function updatePetSetupPreview() {
        const preview = document.getElementById('pet-setup-preview');
        if (!preview) return;
        const def = PET_TYPES.find(p => p.emoji === _selectedPetType) || PET_TYPES[0];
        preview.textContent = def.stages[0];
    }

    function updatePetInteractUI(pet, stats) {
        const setBar = (barId, pctId, val) => {
            const b = document.getElementById(barId); if (b) b.style.width = val + '%';
            const p = document.getElementById(pctId); if (p) p.textContent = val + '%';
        };
        setBar('pet-hunger-bar', 'pet-hunger-pct', stats.hunger);
        setBar('pet-mood-bar',   'pet-mood-pct',   stats.mood);
        setBar('pet-energy-bar', 'pet-energy-pct', stats.energy);

        const hours = Math.floor((Date.now() - (pet.bornAt || Date.now())) / 3600000);
        const idx = getPetStageIndex(hours);
        const el = id => document.getElementById(id);

        if (el('pet-interact-emoji'))  el('pet-interact-emoji').textContent  = getPetEmoji(pet.type, hours);
        if (el('pet-interact-name'))   el('pet-interact-name').textContent   = pet.name || 'Питомец';
        if (el('pet-interact-stage'))  el('pet-interact-stage').textContent  = PET_STAGE_NAMES[idx];
        if (el('pet-interact-speech')) el('pet-interact-speech').textContent = petStatPhrase(stats);

        if (el('pet-last-fed-label') && pet.lastFed) {
            const mins = Math.floor((Date.now() - pet.lastFed) / 60000);
            el('pet-last-fed-label').textContent = mins < 60
                ? `Кормил ${mins} мин. назад`
                : mins < 1440 ? `Кормил ${Math.floor(mins / 60)} ч. назад`
                : `Кормил ${Math.floor(mins / 1440)} дн. назад`;
        }
    }

    // ─────────────────────────────────────────────────────────
    // 6. ПУБЛИЧНЫЕ ФУНКЦИИ
    // ─────────────────────────────────────────────────────────

    function openPetSetup() {
        const profileModal = document.getElementById('profile-settings-modal');
        if (profileModal) profileModal.classList.remove('active');

        _selectedPetType = PET_TYPES[0].emoji;
        buildPetTypeGrid();

        if (window.currentUser) {
            petRef(window.currentUser).once('value').then(snap => {
                const pet = snap.val();
                if (pet) {
                    _selectedPetType = pet.type || PET_TYPES[0].emoji;
                    const inp = document.getElementById('pet-name-input');
                    if (inp) inp.value = pet.name || '';
                    buildPetTypeGrid();
                }
                updatePetSetupPreview();
            });
        } else {
            updatePetSetupPreview();
        }

        document.getElementById('pet-setup-modal').classList.add('active');
    }

    async function savePetSetup() {
        if (!window.currentUser) return;
        const nameInput = document.getElementById('pet-name-input');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) { window.showNotification('Введите имя питомца'); return; }

        try {
            const snap = await petRef(window.currentUser).once('value');
            const existing = snap.val();
            const bornAt = existing && existing.bornAt ? existing.bornAt : Date.now();

            await petRef(window.currentUser).set({ name, type: _selectedPetType, bornAt });

            window.showNotification('🐾 Питомец сохранён!');
            document.getElementById('pet-setup-modal').classList.remove('active');
            loadMyPetCard();

            setTimeout(() => {
                const profileModal = document.getElementById('profile-settings-modal');
                if (profileModal) profileModal.classList.add('active');
            }, 200);
        } catch(e) {
            window.showNotification('Ошибка: ' + e.message);
        }
    }

    async function loadMyPetCard() {
        if (!window.currentUser || !window.database) return;
        try {
            const snap = await petRef(window.currentUser).once('value');
            const pet = snap.val();
            const cardWrap = document.getElementById('my-pet-card-profile');
            const noPet   = document.getElementById('no-pet-profile');
            if (!cardWrap || !noPet) return;

            if (!pet || !pet.name) {
                cardWrap.style.display = 'none';
                noPet.style.display   = 'block';
                return;
            }

            cardWrap.style.display = 'block';
            noPet.style.display   = 'none';

            const hours     = Math.floor((Date.now() - (pet.bornAt || Date.now())) / 3600000);
            const stageIdx  = getPetStageIndex(hours);
            const progress  = getPetStageProgress(hours);
            const petEmoji  = getPetEmoji(pet.type, hours);
            const typeLabel = (PET_TYPES.find(p => p.emoji === pet.type) || PET_TYPES[0]).label;

            document.getElementById('my-pet-avatar-prof').textContent = petEmoji;
            document.getElementById('my-pet-name-prof').textContent   = pet.name;
            document.getElementById('my-pet-type-prof').textContent   = typeLabel;
            document.getElementById('my-pet-age-fill').style.width    = progress + '%';
            document.getElementById('my-pet-age-label').textContent   = hours + ' ч.';
            document.getElementById('my-pet-stage-badge').textContent = PET_STAGE_NAMES[stageIdx];
        } catch(e) {
            console.error('[PetPlugin] loadMyPetCard:', e);
        }
    }

    async function loadAndRenderPetForProfile(username, containerId) {
        if (!window.database) return;
        try {
            const snap      = await petRef(username).once('value');
            const pet       = snap.val();
            const container = document.getElementById(containerId);
            if (!container) return;

            if (!pet || !pet.name) { container.innerHTML = ''; return; }

            const hours     = Math.floor((Date.now() - (pet.bornAt || Date.now())) / 3600000);
            const stageIdx  = getPetStageIndex(hours);
            const progress  = getPetStageProgress(hours);
            const petEmoji  = getPetEmoji(pet.type, hours);
            const typeLabel = (PET_TYPES.find(p => p.emoji === pet.type) || PET_TYPES[0]).label;
            const esc       = window.escapeHtml || (s => s);

            container.innerHTML = `
                <div style="margin:0 20px 16px;">
                    <h3 style="font-size:1.1rem;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-color);padding-bottom:10px;margin-bottom:14px;">
                        <span>🐾</span><span>Питомец</span>
                    </h3>
                    <div class="pet-card" style="margin:0;cursor:default;">
                        <div class="pet-avatar" style="animation:petBounce 3s ease-in-out infinite;">${petEmoji}</div>
                        <div class="pet-info">
                            <div class="pet-name">${esc(pet.name)}</div>
                            <div class="pet-type">${typeLabel}</div>
                            <div class="pet-age-bar-wrap">
                                <div class="pet-age-bar"><div class="pet-age-fill" style="width:${progress}%"></div></div>
                                <span class="pet-age-label">${hours} ч.</span>
                            </div>
                            <span class="pet-stage-badge">${PET_STAGE_NAMES[stageIdx]}</span>
                        </div>
                    </div>
                </div>
            `;
        } catch(e) {
            console.error('[PetPlugin] loadAndRenderPetForProfile:', e);
        }
    }

    async function openPetZoo() {
        if (!window.database) return;
        const modal = document.getElementById('pet-zoo-modal');
        const list  = document.getElementById('pets-zoo-list');
        if (!modal || !list) return;

        list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-light);">⏳ Загрузка...</div>';
        modal.classList.add('active');

        const profileModal = document.getElementById('profile-settings-modal');
        if (profileModal) profileModal.classList.remove('active');

        try {
            const snap     = await window.database.ref('users').once('value');
            const allUsers = snap.val() || {};
            const esc      = window.escapeHtml || (s => s);

            const pets = [];
            Object.keys(allUsers).forEach(key => {
                const u = allUsers[key];
                if (u && u.pet && u.pet.name) {
                    pets.push({ username: u.username || key, displayName: u.name || u.username || key, pet: u.pet });
                }
            });

            if (pets.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-light);"><div style="font-size:3rem;margin-bottom:10px;">🥚</div><p>Пока ни у кого нет питомца</p></div>';
                return;
            }

            pets.sort((a, b) => (a.pet.bornAt || 0) - (b.pet.bornAt || 0));

            let html = '<div class="pets-list-grid">';
            pets.forEach(({ username, pet }) => {
                const hours    = Math.floor((Date.now() - (pet.bornAt || Date.now())) / 3600000);
                const stageIdx = getPetStageIndex(hours);
                const petEmoji = getPetEmoji(pet.type, hours);
                html += `
                    <div class="pets-list-card" onclick="openUserProfile('${esc(username)}')">
                        <span class="plc-emoji">${petEmoji}</span>
                        <div class="plc-pet-name">${esc(pet.name)}</div>
                        <div class="plc-owner">@${esc(username)}</div>
                        <div style="font-size:0.72rem;color:var(--text-light);margin-bottom:5px;">${hours} ч.</div>
                        <span class="plc-stage">${PET_STAGE_NAMES[stageIdx]}</span>
                    </div>
                `;
            });
            html += '</div>';
            list.innerHTML = html;
        } catch(e) {
            list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--danger-color);">Ошибка загрузки</div>';
        }
    }

    async function openPetInteract() {
        if (!window.currentUser || !window.database) return;
        const profileModal = document.getElementById('profile-settings-modal');
        if (profileModal) profileModal.classList.remove('active');
        try {
            const snap = await petRef(window.currentUser).once('value');
            const pet  = snap.val();
            if (!pet || !pet.name) { openPetSetup(); return; }
            updatePetInteractUI(pet, calcPetStats(pet));
            document.getElementById('pet-interact-modal').classList.add('active');
        } catch(e) {
            window.showNotification('Ошибка загрузки питомца');
        }
    }

    async function petAction(action) {
        if (!window.currentUser || !window.database) return;
        try {
            const snap  = await petRef(window.currentUser).once('value');
            const pet   = snap.val();
            if (!pet) return;

            const stats = calcPetStats(pet);
            const now   = Date.now();
            let { hunger: newHunger, mood: newMood, energy: newEnergy } = stats;
            let phrase = '';
            let lastFed = pet.lastFed || now, lastPlayed = pet.lastPlayed || now, lastSlept = pet.lastSlept || now;

            if (action === 'feed') {
                if (stats.hunger >= 95) { window.showNotification('Питомец уже сыт! 😋'); return; }
                newHunger = Math.min(100, stats.hunger + 30);
                newMood   = Math.min(100, stats.mood   + 5);
                lastFed   = now;
                phrase    = petRandPhrase('feed');
            } else if (action === 'play') {
                if (stats.energy < 15) { window.showNotification('Питомец слишком устал! 😴'); return; }
                newMood    = Math.min(100, stats.mood   + 30);
                newHunger  = Math.max(0,   stats.hunger - 10);
                newEnergy  = Math.max(0,   stats.energy - 20);
                lastPlayed = now;
                phrase     = petRandPhrase('play');
            } else if (action === 'sleep') {
                if (stats.energy >= 95) { window.showNotification('Питомец уже бодр! ⚡'); return; }
                newEnergy = Math.min(100, stats.energy + 40);
                lastSlept = now;
                phrase    = petRandPhrase('sleep');
            } else if (action === 'pat') {
                newMood = Math.min(100, stats.mood + 15);
                phrase  = petRandPhrase('pat');
            }

            await petRef(window.currentUser).update({ hunger: newHunger, mood: newMood, energy: newEnergy, lastFed, lastPlayed, lastSlept });

            const mergedPet = { ...pet, lastFed, lastPlayed, lastSlept };
            updatePetInteractUI(mergedPet, { hunger: newHunger, mood: newMood, energy: newEnergy });

            const speechEl = document.getElementById('pet-interact-speech');
            if (speechEl) {
                speechEl.textContent = phrase;
                speechEl.style.cssText = 'color:var(--primary-color);font-weight:700;font-style:italic;';
                setTimeout(() => {
                    speechEl.style.cssText = 'font-style:italic;';
                    speechEl.textContent   = petStatPhrase({ hunger: newHunger, mood: newMood, energy: newEnergy });
                }, 2200);
            }
            const emojiEl = document.getElementById('pet-interact-emoji');
            if (emojiEl) {
                emojiEl.style.transform = 'scale(1.4)';
                setTimeout(() => emojiEl.style.transform = '', 300);
            }
            loadMyPetCard();
        } catch(e) {
            window.showNotification('Ошибка: ' + e.message);
        }
    }

    async function checkPetHungerNotification() {
        if (!window.currentUser || !window.database) return;
        try {
            const snap = await petRef(window.currentUser).once('value');
            const pet  = snap.val();
            if (!pet || !pet.name) return;
            const s = calcPetStats(pet);
            if      (s.hunger < 25) setTimeout(() => window.showNotification('🍖 ' + (pet.name || 'Питомец') + ' голодает! Покорми его!'), 3000);
            else if (s.mood   < 25) setTimeout(() => window.showNotification('😿 ' + (pet.name || 'Питомец') + ' скучает! Поиграй с ним!'), 3500);
        } catch(e) {}
    }

    // ─────────────────────────────────────────────────────────
    // 7. ПРИВЯЗКА СОБЫТИЙ (кнопки в модалках)
    // ─────────────────────────────────────────────────────────

    function bindEvents() {
        // Сохранить питомца
        const saveBtn = document.getElementById('pet-setup-save');
        if (saveBtn) saveBtn.addEventListener('click', savePetSetup);

        // Отмена настройки
        const cancelBtn = document.getElementById('pet-setup-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', () => {
            document.getElementById('pet-setup-modal').classList.remove('active');
            setTimeout(() => {
                const profileModal = document.getElementById('profile-settings-modal');
                if (profileModal) profileModal.classList.add('active');
            }, 150);
        });

        // Закрыть зоопарк
        const zooClose = document.getElementById('pet-zoo-close');
        if (zooClose) zooClose.addEventListener('click', () => {
            document.getElementById('pet-zoo-modal').classList.remove('active');
        });

        // Клик вне модалок — закрыть
        ['pet-setup-modal', 'pet-zoo-modal', 'pet-interact-modal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', e => { if (e.target === el) el.classList.remove('active'); });
        });
    }

    // ─────────────────────────────────────────────────────────
    // 8. INIT
    // ─────────────────────────────────────────────────────────

    function init() {
        injectStyles();
        injectModals();
        bindEvents();
        // checkPetHungerNotification вызывается из initApp() главного файла
        // после того как currentUser и database уже готовы
        console.log('[PetPlugin] ✅ Система питомцев загружена');
    }

    // ─────────────────────────────────────────────────────────
    // 9. ЭКСПОРТ В WINDOW
    // ─────────────────────────────────────────────────────────

    window.openPetSetup                  = openPetSetup;
    window.openPetInteract               = openPetInteract;
    window.openPetZoo                    = openPetZoo;
    window.petAction                     = petAction;
    window.loadMyPetCard                 = loadMyPetCard;
    window.loadAndRenderPetForProfile    = loadAndRenderPetForProfile;

    // Публичный namespace для ручного вызова init если нужно
    window.PetPlugin = { init, PET_TYPES, PET_STAGE_NAMES };

    // Авто-старт: ждём Firebase и currentUser
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 800));
    } else {
        setTimeout(init, 800);
    }

})();
