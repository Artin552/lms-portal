import type { Group, Prisma, ScheduleEntry, Subject, User } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { prisma } from '../prisma';
import { shortName } from './users';

export const scheduleInclude = { group: true, subject: true, teacher: true } satisfies Prisma.ScheduleEntryInclude;

export function serializeEntry(e: ScheduleEntry & { group: Group; subject: Subject; teacher: User }) {
  return {
    id: e.id,
    dayOfWeek: e.dayOfWeek,
    pairNumber: e.pairNumber,
    startTime: e.startTime,
    endTime: e.endTime,
    type: e.type,
    room: e.room,
    weekParity: e.weekParity,
    subject: { id: e.subject.id, name: e.subject.name },
    group: { id: e.group.id, name: e.group.name },
    teacher: { id: e.teacher.id, shortName: shortName(e.teacher) },
  };
}

/** Фильтр «чьё расписание»: студент — своей группы, преподаватель — свои пары */
export async function scheduleScope(user: AuthUser, groupId?: number): Promise<Prisma.ScheduleEntryWhereInput | null> {
  if (user.role === 'STUDENT') {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return me.groupId ? { groupId: me.groupId } : null;
  }
  if (user.role === 'TEACHER') return { teacherId: user.id };
  return groupId ? { groupId } : {};
}

export async function lessonsForDay(user: AuthUser, dayOfWeek: number, parity: 'ODD' | 'EVEN') {
  const scope = await scheduleScope(user);
  if (!scope) return [];
  const entries = await prisma.scheduleEntry.findMany({
    where: { ...scope, dayOfWeek, weekParity: { in: ['ALL', parity] } },
    include: scheduleInclude,
    orderBy: [{ startTime: 'asc' }],
  });
  return entries.map(serializeEntry);
}
