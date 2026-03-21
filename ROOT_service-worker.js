// Этот файл должен лежать в КОРНЕ репозитория: /service-worker.js
// (russiastarscom.github.io/service-worker.js)
//
// Pusher Beams SDK жёстко ищет /service-worker.js в корне сайта.
// Без этого файла Beams выдаёт ошибку 404 и не работает.

importScripts('https://js.pusher.com/beams/service-worker.js');
