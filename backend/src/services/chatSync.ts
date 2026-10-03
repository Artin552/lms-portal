import { prisma } from '../prisma';
import { joinUsersToChat, removeUsersFromChat } from '../realtime/io';

async function setMembers(chatId: number, desired: Set<number>) {
  const current = await prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } });
  const currentIds = new Set(current.map((m) => m.userId));
  const toAdd = [...desired].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !desired.has(id));
  if (toAdd.length) {
    await prisma.chatMember.createMany({
      data: toAdd.map((userId) => ({ chatId, userId })),
      skipDuplicates: true,
    });
    joinUsersToChat(toAdd, chatId);
  }
  if (toRemove.length) {
    await prisma.chatMember.deleteMany({ where: { chatId, userId: { in: toRemove } } });
    removeUsersFromChat(toRemove, chatId);
  }
}

/**
 * Приводит групповые чаты в соответствие с данными:
 *  - общий чат группы: студенты группы + преподаватели, которые у неё ведут;
 *  - чат по каждому предмету группы: студенты + преподаватели этого предмета.
 * Вызывается при изменении состава группы или назначений преподавателей.
 */
export async function syncGroupChats(groupId: number) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      students: { where: { isActive: true }, select: { id: true } },
      teachings: { include: { subject: true } },
    },
  });
  if (!group) return;

  const studentIds = group.students.map((s) => s.id);
  const teacherIds = [...new Set(group.teachings.map((t) => t.teacherId))];

  const groupChat = await prisma.chat.upsert({
    where: { key: `group:${groupId}` },
    create: { key: `group:${groupId}`, type: 'GROUP', groupId, title: `Группа ${group.name}` },
    update: { title: `Группа ${group.name}` },
  });
  await setMembers(groupChat.id, new Set([...studentIds, ...teacherIds]));

  const subjects = new Map(group.teachings.map((t) => [t.subjectId, t.subject]));
  for (const [subjectId, subject] of subjects) {
    const key = `subject:${subjectId}:${groupId}`;
    await prisma.chat.upsert({
      where: { key },
      create: { key, type: 'SUBJECT', groupId, subjectId, title: `${subject.name} · ${group.name}` },
      update: { title: `${subject.name} · ${group.name}` },
    });
  }

  // Все чаты по предметам этой группы, включая те, где предмет больше не ведётся (история сохраняется)
  const subjectChats = await prisma.chat.findMany({ where: { type: 'SUBJECT', groupId } });
  for (const chat of subjectChats) {
    const teachers = group.teachings.filter((t) => t.subjectId === chat.subjectId).map((t) => t.teacherId);
    await setMembers(chat.id, new Set([...studentIds, ...teachers]));
  }
}

export function directKey(a: number, b: number) {
  return `direct:${Math.min(a, b)}:${Math.max(a, b)}`;
}

export async function getOrCreateDirectChat(userId: number, otherId: number) {
  const key = directKey(userId, otherId);
  const existing = await prisma.chat.findUnique({ where: { key } });
  if (existing) return existing;
  try {
    const chat = await prisma.chat.create({
      data: { key, type: 'DIRECT', members: { create: [{ userId }, { userId: otherId }] } },
    });
    joinUsersToChat([userId, otherId], chat.id);
    return chat;
  } catch {
    // параллельное создание того же диалога
    return prisma.chat.findUniqueOrThrow({ where: { key } });
  }
}
