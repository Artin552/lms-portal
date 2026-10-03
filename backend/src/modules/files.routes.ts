import { Router } from 'express';
import { prisma } from '../prisma';
import { INLINE_IMAGE_MIME, verifyFileSignature } from '../storage/files';
import { storage } from '../storage/storage';
import { forbidden, notFound } from '../utils/errors';

export const filesRouter = Router();

/** Скачивание по подписанной временной ссылке (выдаётся вместе с сущностью, к которой есть доступ) */
filesRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!verifyFileSignature(id, Number(req.query.exp), String(req.query.sig ?? ''))) {
    throw forbidden('Ссылка на файл недействительна или устарела');
  }
  const file = await prisma.attachment.findUnique({ where: { id } });
  if (!file || !(await storage.exists(file.storageKey))) throw notFound('Файл не найден');

  const inline = INLINE_IMAGE_MIME.has(file.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.setHeader('Cache-Control', 'private, max-age=3600');
  // Всё, кроме картинок, — только на скачивание и как бинарный поток, чтобы файл не исполнился в браузере
  res.setHeader('Content-Type', inline ? file.mimeType : 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  );
  res.setHeader('Content-Length', String(file.size));
  (await storage.get(file.storageKey)).pipe(res);
});
