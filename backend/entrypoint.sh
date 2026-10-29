#!/bin/sh
# Запуск API: миграции -> seed (no-op, если данные уже есть) -> сервер.
# exec обязателен: node должен стать PID 1, иначе SIGTERM от docker до него не дойдет
# и graceful shutdown в src/index.ts не выполнится.
set -e

./node_modules/.bin/prisma migrate deploy
node dist/prisma/seed.js
exec node dist/src/index.js
