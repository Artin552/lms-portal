import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { config } from '../config';
import { HttpError } from '../utils/errors';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ message: 'Маршрут не найден' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Ошибка валидации',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? `Файл больше ${config.maxUploadMb} МБ` : `Ошибка загрузки файла: ${err.code}`;
    return res.status(400).json({ message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Запись с такими данными уже существует' });
    if (err.code === 'P2025') return res.status(404).json({ message: 'Запись не найдена' });
    if (err.code === 'P2003') return res.status(400).json({ message: 'Связанная запись не найдена' });
  }
  console.error(err);
  res.status(500).json({ message: 'Внутренняя ошибка сервера' });
}
