#!/bin/sh
# Создает тестовую базу для `npm test` при первой инициализации тома Postgres.
# Скрипт запускает entrypoint образа postgres (файлы из /docker-entrypoint-initdb.d)
# один раз, пока каталог данных пуст.
set -e

createdb \
  --username "$POSTGRES_USER" \
  --owner "$POSTGRES_USER" \
  lms_test
