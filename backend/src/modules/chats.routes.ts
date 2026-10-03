import { Router, type Request } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { prisma } from '../prisma';
import { emitToChat, emitToUser } from '../realtime/io';
import { getOrCreateDirectChat } from '../services/chatSync';
import {
  assertMember,
  canModerate,
  messageInclude,
  serializeChatHeader,
  serializeMessage,
  totalUnread,
  unreadCount,
} from '../services/chats';
import { notifyNewMessage } from '../services/notifications';
import { publicUser, shortName } from '../services/users';
import { saveAttachments } from '../storage/files';
import { storage } from '../storage/storage';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { idParam } from '../utils/zod';

export const chatsRouter = Router();
chatsRouter.use(requireAuth);

const chatInclude = {
  group: true,
  subject: true,
  members: { include: { user: { include: { group: true } } } },
} as const;

/** Список чатов пользователя с последним сообщением и счётчиком непрочитанных */
chatsRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const memberships = await prisma.chatMember.findMany({
    where: { userId: me.id },
    include: {
      chat: {
        include: {
          ...chatInclude,
          messages: { where: { deletedAt: null }, orderBy: { id: 'desc' }, take: 1, include: messageInclude },
        },
      },
    },
  });
  const items = await Promise.all(
    memberships.map(async (m) => {
      const last = m.chat.messages[0];
      return {
        ...serializeChatHeader(m.chat, me.id),
        lastMessage: last ? serializeMessage(last) : null,
        unread: await unreadCount(m.chatId, me.id, m.lastReadAt),
        updatedAt: last?.createdAt ?? m.chat.createdAt,
      };
    }),
  );
  // Порядок: групповой чат, затем по времени последнего сообщения
  items.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  res.json(items);
});

chatsRouter.get('/unread-total', async (req, res) => {
  res.json({ total: await totalUnread(currentUser(req).id) });
});

/** Открыть (или создать) личный диалог с пользователем */
chatsRouter.post('/direct', async (req, res) => {
  const me = currentUser(req);
  const { userId } = z.object({ userId: z.coerce.number().int().positive() }).parse(req.body);
  if (userId === me.id) throw badRequest('Нельзя написать самому себе');
  const other = await prisma.user.findUnique({ where: { id: userId } });
  if (!other || !other.isActive) throw notFound('Пользователь не найден');
  const chat = await getOrCreateDirectChat(me.id, userId);
  res.json({ id: chat.id });
});

chatsRouter.get('/:id', async (req, res) => {
  const me = currentUser(req);
  const chatId = idParam.parse(req.params.id);
  await assertMember(me, chatId);
  const chat = await prisma.chat.findUniqueOrThrow({ where: { id: chatId }, include: chatInclude });
  const pinned = await prisma.message.findMany({
    where: { chatId, pinnedAt: { not: null }, deletedAt: null },
    include: messageInclude,
    orderBy: { pinnedAt: 'desc' },
  });
  res.json({
    ...serializeChatHeader(chat, me.id),
    canModerate: canModerate(me, chat),
    members: chat.members
      .map((m) => ({ ...publicUser(m.user), lastReadAt: m.lastReadAt }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')),
    pinned: pinned.map(serializeMessage),
  });
});

const historyQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** История сообщений постранично: от новых к старым, курсор — id самого старого загруженного */
chatsRouter.get('/:id/messages', async (req, res) => {
  const me = currentUser(req);
  const chatId = idParam.parse(req.params.id);
  await assertMember(me, chatId);
  const { before, limit } = historyQuery.parse(req.query);
  const rows = await prisma.message.findMany({
    where: { chatId, ...(before && { id: { lt: before } }) },
    include: messageInclude,
    orderBy: { id: 'desc' },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  res.json({ messages: rows.slice(0, limit).reverse().map(serializeMessage), hasMore });
});

chatsRouter.post('/:id/messages', upload.array('files'), async (req, res) => {
  const me = currentUser(req);
  const chatId = idParam.parse(req.params.id);
  const member = await assertMember(me, chatId);
  const { text } = z.object({ text: z.string().max(5000).default('') }).parse(req.body);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!text.trim() && !files.length) throw badRequest('Пустое сообщение');

  const msg = await prisma.message.create({ data: { chatId, senderId: me.id, text: text.trim() } });
  await saveAttachments(files, me.id, { messageId: msg.id });
  // Отправитель прочитал всё, что было до его сообщения
  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId: me.id } },
    data: { lastReadAt: msg.createdAt },
  });
  const full = await prisma.message.findUniqueOrThrow({ where: { id: msg.id }, include: messageInclude });
  const payload = serializeMessage(full);
  emitToChat(chatId, 'message:new', payload);

  // Уведомление в колокольчик — для личных сообщений
  if (member.chat.type === 'DIRECT') {
    const others = await prisma.chatMember.findMany({ where: { chatId, userId: { not: me.id } } });
    const preview = payload.text || (payload.attachments.length ? '📎 Вложение' : '');
    await Promise.all(
      others.map((o) => notifyNewMessage(o.userId, chatId, `Сообщение от ${shortName(full.sender)}`, preview)),
    );
  }
  res.status(201).json(payload);
});

/** Отметить чат прочитанным до текущего момента */
chatsRouter.post('/:id/read', async (req, res) => {
  const me = currentUser(req);
  const chatId = idParam.parse(req.params.id);
  await assertMember(me, chatId);
  const lastReadAt = new Date();
  await prisma.chatMember.update({ where: { chatId_userId: { chatId, userId: me.id } }, data: { lastReadAt } });
  await prisma.notification.updateMany({
    where: { userId: me.id, dedupeKey: `msg:${chatId}:${me.id}`, readAt: null },
    data: { readAt: lastReadAt },
  });
  emitToChat(chatId, 'chat:read', { chatId, userId: me.id, lastReadAt });
  emitToUser(me.id, 'unread:changed', { total: await totalUnread(me.id) });
  res.json({ lastReadAt });
});

async function loadMessage(chatId: number, messageId: number) {
  const msg = await prisma.message.findFirst({ where: { id: messageId, chatId }, include: { attachments: true } });
  if (!msg || msg.deletedAt) throw notFound('Сообщение не найдено');
  return msg;
}

async function setPinned(req: Request, pinned: boolean) {
  const me = currentUser(req);
  const chatId = idParam.parse(req.params.id);
  const member = await assertMember(me, chatId);
  if (!canModerate(me, member.chat)) throw forbidden('Закреплять сообщения может только преподаватель');
  const msg = await loadMessage(chatId, idParam.parse(req.params.messageId));
  const updated = await prisma.message.update({
    where: { id: msg.id },
    data: pinned ? { pinnedAt: new Date(), pinnedById: me.id } : { pinnedAt: null, pinnedById: null },
    include: messageInclude,
  });
  const payload = serializeMessage(updated);
  emitToChat(chatId, 'message:updated', payload);
  return payload;
}

chatsRouter.post('/:id/messages/:messageId/pin', async (req, res) => {
  res.json(await setPinned(req, true));
});

chatsRouter.delete('/:id/messages/:messageId/pin', async (req, res) => {
  res.json(await setPinned(req, false));
});

/** Удаление: своё сообщение — любой участник, чужое — преподаватель в групповом чате */
chatsRouter.delete('/:id/messages/:messageId', async (req, res) => {
  const me = currentUser(req);
  const chatId = idParam.parse(req.params.id);
  const member = await assertMember(me, chatId);
  const msg = await loadMessage(chatId, idParam.parse(req.params.messageId));
  if (msg.senderId !== me.id && !canModerate(me, member.chat)) throw forbidden('Нельзя удалить чужое сообщение');

  await prisma.message.update({ where: { id: msg.id }, data: { deletedAt: new Date(), pinnedAt: null, pinnedById: null } });
  await prisma.attachment.deleteMany({ where: { messageId: msg.id } });
  await Promise.all(msg.attachments.map((a) => storage.remove(a.storageKey)));
  emitToChat(chatId, 'message:deleted', { chatId, messageId: msg.id });
  res.status(204).end();
});
