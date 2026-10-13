# Подключение серверной части без замены рабочего сайта

Ветка PR содержит нормальную структуру `src/`, `server/`, `tests/`: прежняя загрузка файлов в корень потеряла папки. Main и работающий Pages не изменены. Pages может собирать интерфейс командой `npm run build`, выходная папка `dist`; API, D1 и cron для этой сборки обслуживает Worker на том же origin. Сначала тестовый Worker `budget-staging`.

```sh
npm ci
npm run login:cloudflare
npx wrangler d1 create budget-staging
```

Для входа терминал покажет ссылку подтверждения Cloudflare: её можно открыть в своём браузере, пароль и токен в чат не отправлять. ID новой D1 из результата последней команды.

```sh
node scripts/configure-staging.mjs --owner ВАШ_ID --friends ID_ДРУГА --database ID_НОВОЙ_D1 --url https://budget-staging.apersunov5.workers.dev
npm run db:staging
npm test
npm run build
npm run worker:check
npm run deploy:staging
```

Настоящий адрес, полученный при deploy, должен совпадать с `MINI_APP_URL`; при отличии обновить локальный конфиг и повторить deploy. Владелец — ID первоначального владельца данных, не ID друга. Доступ закрыт списком ID.

Далее вручную через защищённые запросы Wrangler задать секреты:

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN --config server/wrangler.staging.jsonc
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --config server/wrangler.staging.jsonc
```

Создать отдельного тестового бота в BotFather, настроить кнопку Mini App и Bot API setWebhook на `<АДРЕС_STAGING>/telegram/webhook` с совпадающим `secret_token`. Никогда не переключать webhook рабочего бота на staging. Если тестового бота ещё нет, создание выполняет пользователь через BotFather; секреты не коммитить.

Отправить `/start`, открыть Mini App, импортировать свой JSON и сверить остатки. Друг стартует с пустой базой. Для веб-входа каждый получает `/web` в своём чате. Проверить отчёт, добавление и отмену, конфликт двух устройств и изоляцию двух аккаунтов.

После приёмки отдельно подготовить переключение production: свежий экспорт, резервная копия, согласование базы и адресов. Нельзя просто переименовать staging Worker в budget и забыть его отдельные секреты/webhook. Подробная миграция: server/MULTIUSER.md.
