export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg = 'Некорректный запрос', details?: unknown) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Требуется авторизация') => new HttpError(401, msg);
export const forbidden = (msg = 'Недостаточно прав') => new HttpError(403, msg);
export const notFound = (msg = 'Не найдено') => new HttpError(404, msg);
export const conflict = (msg = 'Конфликт данных') => new HttpError(409, msg);
