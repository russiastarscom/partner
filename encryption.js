/**
 * Модуль шифрования сообщений - AES-256-GCM
 * Автоматическое одноключевое шифрование
 */

class MessageEncryption {
    constructor() {
        this.key = null;
        this.keyStr = null;
        this.init();
    }

    async init() {
        // Загружаем или генерируем ключ при инициализации
        const savedKey = localStorage.getItem('messageEncryptionKey');
        if (savedKey) {
            this.keyStr = savedKey;
        } else {
            // Генерируем новый ключ при первом запуске
            this.keyStr = await this.generateKey();
            localStorage.setItem('messageEncryptionKey', this.keyStr);
        }
    }

    /**
     * Генерирует случайный ключ шифрования
     * @returns {Promise<string>} Ключ в формате base64
     */
    async generateKey() {
        try {
            const key = await window.crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
            
            const exportedKey = await window.crypto.subtle.exportKey('raw', key);
            return this.bufferToBase64(exportedKey);
        } catch (error) {
            console.error('Ошибка при генерации ключа:', error);
            throw error;
        }
    }

    /**
     * Импортирует ключ из строки base64
     * @param {string} keyStr - Ключ в формате base64
     * @returns {Promise<CryptoKey>}
     */
    async importKey(keyStr) {
        try {
            const keyBuffer = this.base64ToBuffer(keyStr);
            return await window.crypto.subtle.importKey(
                'raw',
                keyBuffer,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
        } catch (error) {
            console.error('Ошибка при импорте ключа:', error);
            throw error;
        }
    }

    /**
     * Шифрует сообщение собственным ключом
     * @param {string} message - Текст сообщения
     * @returns {Promise<string>} Зашифрованное сообщение
     */
    async encryptMessage(message) {
        try {
            if (!this.keyStr) {
                console.warn('Ключ еще не инициализирован');
                return null;
            }

            const key = await this.importKey(this.keyStr);
            const encoder = new TextEncoder();
            const data = encoder.encode(message);

            // Генерируем IV для каждого сообщения
            const iv = window.crypto.getRandomValues(new Uint8Array(12));

            // Шифруем сообщение
            const encrypted = await window.crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                data
            );

            // Объединяем IV и зашифрованные данные
            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(encrypted), iv.length);

            return this.bufferToBase64(combined);
        } catch (error) {
            console.error('Ошибка при шифровании:', error);
            return null;
        }
    }

    /**
     * Дешифрует сообщение собственным ключом
     * @param {string} encryptedMessage - Зашифрованное сообщение
     * @returns {Promise<string>} Расшифрованное сообщение
     */
    async decryptMessage(encryptedMessage) {
        try {
            if (!this.keyStr) {
                console.warn('Ключ еще не инициализирован');
                return null;
            }

            const key = await this.importKey(this.keyStr);
            const combined = this.base64ToBuffer(encryptedMessage);

            // Извлекаем IV (первые 12 байт)
            const iv = combined.slice(0, 12);
            // Извлекаем зашифрованные данные
            const encrypted = combined.slice(12);

            // Дешифруем
            const decrypted = await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                encrypted
            );

            // Преобразуем обратно в строку
            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            console.error('Ошибка при дешифровании:', error);
            return null;
        }
    }

    /**
     * Преобразует ArrayBuffer в base64
     * @param {ArrayBuffer} buffer
     * @returns {string}
     */
    bufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Преобразует base64 в ArrayBuffer
     * @param {string} base64
     * @returns {Uint8Array}
     */
    base64ToBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
}

// Глобальный экземпляр
const encryption = new MessageEncryption();

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = encryption;
}
