import type { Attachment, Chat, Group, Message, Prisma, Subject, User } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { prisma } from '../prisma';
import { serializeAttachment } from '../storage/files';
import { forbidden, notFound } from '../utils/errors';
import { avatarUrl, publicUser, shortName } from './users';

export const messageInclude = {
  sender: true,
  pinnedBy: true,
  attachments: true,
} satisfies Prisma.MessageInclude;

type FullMessage = Message & { sender: User; pinnedBy: User | null; attachments: Attachment[] };

export function serializeMessage(m: FullMessage) {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    chatId: m.chatId,
    sender: {
      id: m.sender.id,
      shortName: shortName(m.sender),
      fullName: publicUser(m.sender).fullName,
      role: m.sender.role,
      avatarUrl: avatarUrl(m.sender),
    },
    text: deleted ? '' : m.text,
    createdAt: m.createdAt,
    deletedAt: m.deletedAt,
    pinnedAt: deleted ? null : m.pinnedAt,
    pinnedBy: m.pinnedBy && !deleted ? { id: m.pinnedBy.id, shortName: shortName(m.pinnedBy) } : null,
    attachments: deleted ? [] : m.attachments.map(serializeAttachment),
  };
}

/** Проверка членства: доступ к чату есть только у его участников */
export async function assertMember(user: AuthUser, chatId: number) {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId: user.id } },
    include: { chat: true },
  });
  if (!member) {
    const exists = await prisma.chat.count({ where: { id: chatId } });
    throw exists ? forbidden('Вы не участник этого чата') : notFound('Чат не найден');
  }
  return member;
}

/** Модерация (закрепление, удаление чужих сообщений) — преподаватели и админ в групповых чатах */
export function canModerate(user: AuthUser, chat: Chat) {
  return chat.type !== 'DIRECT' && (user.role === 'TEACHER' || user.role === 'ADMIN');
}

type ChatWithRelations = Chat & {
  group: Group | null;
  subject: Subject | null;
  members: { userId: number; lastReadAt: Date | null; user: User & { group?: Group | null } }[];
};

export function chatTitle(chat: ChatWithRelations, meId: number) {
  if (chat.type === 'DIRECT') {
    const other = chat.members.find((m) => m.userId !== meId)?.user;
    return other ? publicUser(other).fullName : 'Диалог';
  }
  return chat.title ?? 'Чат';
}

export function serializeChatHeader(chat: ChatWithRelations, meId: number) {
  const other = chat.type === 'DIRECT' ? chat.members.find((m) => m.userId !== meId)?.user : undefined;
  return {
    id: chat.id,
    type: chat.type,
    title: chatTitle(chat, meId),
    group: chat.group ? { id: chat.group.id, name: chat.group.name } : null,
    subject: chat.subject ? { id: chat.subject.id, name: chat.subject.name } : null,
    peer: other ? publicUser(other) : null,
    membersCount: chat.members.length,
  };
}

export async function unreadCount(chatId: number, userId: number, lastReadAt: Date | null) {
  return prisma.message.count({
    where: {
      chatId,
      senderId: { not: userId },
      deletedAt: null,
      ...(lastReadAt && { createdAt: { gt: lastReadAt } }),
    },
  });
}

export async function totalUnread(userId: number) {
  const memberships = await prisma.chatMember.findMany({ where: { userId } });
  const counts = await Promise.all(memberships.map((m) => unreadCount(m.chatId, userId, m.lastReadAt)));
  return counts.reduce((a, b) => a + b, 0);
}
