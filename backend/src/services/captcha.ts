import { config } from '../config';

/** Адрес проверки токена SmartCaptcha (актуальный домен из документации Яндекса) */
const VALIDATE_URL = 'https://smartcaptcha.cloud.yandex.ru/validate';
const TIMEOUT_MS = 5000;

/**
 * ok – человек, failed – робот или недействительный токен,
 * unavailable – сервис Яндекса недоступен или ответил не по формату.
 */
export type CaptchaVerdict = 'ok' | 'failed' | 'unavailable';

/** Проверяет одноразовый токен SmartCaptcha. Токен живет 5 минут и принимается только один раз */
export async function verifyCaptcha(token: string, ip?: string): Promise<CaptchaVerdict> {
  const body = new URLSearchParams({ secret: config.captcha.serverKey, token });
  if (ip) body.set('ip', ip);
  try {
    const res = await fetch(VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`SmartCaptcha: сервис проверки ответил ${res.status}`);
      return 'unavailable';
    }
    const data = (await res.json()) as { status?: string; message?: string };
    if (data.status === 'ok') return 'ok';
    if (data.message) console.warn(`SmartCaptcha: проверка не пройдена (${data.message})`);
    return 'failed';
  } catch (err) {
    console.warn('SmartCaptcha: не удалось проверить токен', err);
    return 'unavailable';
  }
}
