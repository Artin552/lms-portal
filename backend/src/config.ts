import 'dotenv/config';
import path from 'node:path';

function required(name: string, fallbackForDev?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV !== 'production' && fallbackForDev !== undefined) return fallbackForDev;
  throw new Error(`Не задана переменная окружения ${name}`);
}

// SmartCaptcha включается, только когда заданы оба ключа: клиентский уходит на фронтенд,
// серверный нужен для проверки токена. Один ключ без второго – ошибка конфигурации.
const captchaSitekey = process.env.SMARTCAPTCHA_SITEKEY ?? '';
const captchaServerKey = process.env.SMARTCAPTCHA_SERVER_KEY ?? '';
const captchaEnabled = Boolean(captchaSitekey && captchaServerKey);
if (!captchaEnabled && (captchaSitekey || captchaServerKey)) {
  const message = 'SmartCaptcha: задан только один из ключей SMARTCAPTCHA_SITEKEY / SMARTCAPTCHA_SERVER_KEY';
  if (process.env.NODE_ENV === 'production') throw new Error(message);
  console.warn(`${message} – капча отключена`);
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  /** Разрешённые источники для CORS (через запятую) */
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
  },
  /** Секрет для подписи временных ссылок на файлы */
  fileUrlSecret: required('FILE_URL_SECRET', 'dev-file-secret-change-me'),
  fileUrlTtlSec: Number(process.env.FILE_URL_TTL_SEC ?? 3600),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 20),
  /** Дата начала семестра (понедельник первой, нечётной, недели) */
  semesterStart: process.env.SEMESTER_START ?? '2026-09-01',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  /** Yandex SmartCaptcha: необязательная защита формы входа */
  captcha: {
    enabled: captchaEnabled,
    sitekey: captchaSitekey,
    serverKey: captchaServerKey,
  },
};
