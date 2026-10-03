import { execSync } from 'node:child_process';
import fs from 'node:fs';

/** Применяет миграции к тестовой БД (создаёт её при необходимости) и чистит тестовые загрузки */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://lms:lms@localhost:5432/lms_test?schema=public';
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
  return () => fs.rmSync('./uploads-test', { recursive: true, force: true });
}
