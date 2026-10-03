import crypto from 'node:crypto';
import type { Attachment, Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../prisma';
import { badRequest } from '../utils/errors';
import { storage } from './storage';

/** Разрешённые расширения файлов (вложения к заданиям, сдачам и сообщениям) */
const ALLOWED_EXT = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'md', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'zip', 'rar', '7z',
  'dwg', 'dxf', 'py', 'js', 'ts', 'java', 'c', 'cpp', 'h', 'cs', 'sql', 'ipynb',
]);

export const INLINE_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function assertAllowedFile(file: Express.Multer.File) {
  const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXT.has(ext)) throw badRequest(`Тип файла .${ext} не поддерживается`);
}

/** multer отдаёт имя в latin1 — восстанавливаем UTF-8 (кириллица) */
export function decodeName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

type Owner = { assignmentId?: number; submissionId?: number; messageId?: number };

export async function saveAttachments(
  files: Express.Multer.File[] | undefined,
  uploadedById: number,
  owner: Owner,
  tx: Prisma.TransactionClient = prisma,
) {
  if (!files?.length) return [];
  files.forEach(assertAllowedFile);
  const saved: Attachment[] = [];
  for (const f of files) {
    const fileName = decodeName(f.originalname);
    const storageKey = await storage.put(f.buffer, fileName);
    saved.push(
      await tx.attachment.create({
        data: { storageKey, fileName, mimeType: f.mimetype, size: f.size, uploadedById, ...owner },
      }),
    );
  }
  return saved;
}

function sign(id: number, exp: number) {
  return crypto.createHmac('sha256', config.fileUrlSecret).update(`${id}.${exp}`).digest('base64url');
}

/**
 * Ссылки на файлы — временные и подписанные (аналог presigned URL в S3).
 * Права проверяются в момент выдачи ссылки, т.е. при чтении сущности-владельца.
 */
export function signedFileUrl(id: number): string {
  const exp = Math.floor(Date.now() / 1000) + config.fileUrlTtlSec;
  return `/api/files/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}

export function verifyFileSignature(id: number, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(id, exp));
  const got = Buffer.from(sig);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

export function serializeAttachment(a: Attachment) {
  return {
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    isImage: INLINE_IMAGE_MIME.has(a.mimeType),
    url: signedFileUrl(a.id),
  };
}
