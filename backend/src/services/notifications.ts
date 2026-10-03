import type { NotificationType } from '@prisma/client';
import { prisma } from '../prisma';
import { emitToUser } from '../realtime/io';

interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

export async function notifyUsers(userIds: number[], input: NotifyInput) {
  if (!userIds.length) return;
  const created = await prisma.notification.createManyAndReturn({
    data: userIds.map((userId) => ({ userId, ...input, body: input.body ?? '' })),
  });
  for (const n of created) emitToUser(n.userId, 'notification:new', n);
}

/** Создаёт уведомление один раз на dedupeKey (повторные вызовы игнорируются) */
export async function notifyOnce(userId: number, dedupeKey: string, input: NotifyInput) {
  const existing = await prisma.notification.findUnique({ where: { dedupeKey } });
  if (existing) return;
  try {
    const n = await prisma.notification.create({ data: { userId, dedupeKey, ...input, body: input.body ?? '' } });
    emitToUser(userId, 'notification:new', n);
  } catch {
    // гонка параллельных вызовов — уведомление уже создано
  }
}

/**
 * Уведомление о новом сообщении: на каждый чат у пользователя одно уведомление,
 * которое «поднимается» при новых сообщениях, а не плодит десятки записей.
 */
export async function notifyNewMessage(userId: number, chatId: number, title: string, body: string) {
  const dedupeKey = `msg:${chatId}:${userId}`;
  const data = { type: 'NEW_MESSAGE' as const, title, body: body.slice(0, 140), link: `/chats/${chatId}` };
  const n = await prisma.notification.upsert({
    where: { dedupeKey },
    create: { userId, dedupeKey, ...data },
    update: { ...data, readAt: null, createdAt: new Date() },
  });
  emitToUser(userId, 'notification:new', n);
}
