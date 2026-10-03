import { defineConfig } from 'vitest/config';

// Тесты идут против отдельной БД (по умолчанию lms_test на локальном Postgres из docker-compose).
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lms:lms@localhost:5432/lms_test?schema=public';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    globalSetup: './tests/globalSetup.ts',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      UPLOAD_DIR: './uploads-test',
      REFRESH_REUSE_GRACE_MS: '0',
    },
  },
});
