import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * Access-токен живёт только в памяти (не в localStorage — защита от XSS-кражи).
 * Refresh-токен — в httpOnly-cookie, браузер отправляет его сам на /api/auth/*.
 */
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  listeners.forEach((l) => l(token));
}

export function onTokenChange(fn: (token: string | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const api = axios.create({ baseURL: '/api', withCredentials: true });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;
let onSessionExpired: () => void = () => undefined;

export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

/** Одно обновление на все параллельные запросы, получившие 401 */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= axios
    .post('/api/auth/refresh', null, { withCredentials: true })
    .then((res) => {
      setAccessToken(res.data.accessToken);
      return res.data.accessToken as string;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) return api(original);
      onSessionExpired();
    }
    return Promise.reject(error);
  },
);

/** Человекочитаемое сообщение об ошибке API */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; details?: unknown } | undefined;
    if (data?.details && Array.isArray(data.details)) {
      const lines = data.details.map((d) => (typeof d === 'string' ? d : (d as { message: string }).message));
      return [data.message, ...lines].filter(Boolean).join('\n');
    }
    if (data?.message) return data.message;
    if (!err.response) return 'Нет связи с сервером';
  }
  return 'Что-то пошло не так';
}
