import type { Assignment, Attachment, Group, Prisma, Subject, Submission, User } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { prisma } from '../prisma';
import { serializeAttachment } from '../storage/files';
import { forbidden, notFound } from '../utils/errors';
import { publicUser, shortName } from './users';

/** Статус задания с точки зрения студента */
export type StudentStatus = 'pending' | 'submitted' | 'returned' | 'graded' | 'overdue';

export function studentStatus(a: Pick<Assignment, 'deadline'>, s: Pick<Submission, 'status'> | null, now = new Date()): StudentStatus {
  if (s?.status === 'GRADED') return 'graded';
  if (s?.status === 'RETURNED') return 'returned';
  if (s?.status === 'SUBMITTED') return 'submitted';
  return a.deadline < now ? 'overdue' : 'pending';
}

/**
 * Правило пересдачи: до дедлайна можно сдать/пересдать, пока работа не проверена;
 * работу, возвращённую на доработку, можно сдать и после дедлайна.
 */
export function canSubmit(a: Pick<Assignment, 'deadline'>, s: Pick<Submission, 'status'> | null, now = new Date()) {
  if (s?.status === 'GRADED') return false;
  if (s?.status === 'RETURNED') return true;
  return a.deadline >= now;
}

export const assignmentInclude = {
  subject: true,
  teacher: true,
  groups: { include: { group: true } },
  files: true,
} satisfies Prisma.AssignmentInclude;

type FullAssignment = Assignment & {
  subject: Subject;
  teacher: User;
  groups: { group: Group }[];
  files: Attachment[];
};

export function serializeAssignment(a: FullAssignment) {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    deadline: a.deadline,
    createdAt: a.createdAt,
    subject: { id: a.subject.id, name: a.subject.name },
    teacher: { id: a.teacher.id, shortName: shortName(a.teacher), fullName: publicUser(a.teacher).fullName },
    groups: a.groups.map((g) => ({ id: g.group.id, name: g.group.name })),
    files: a.files.map(serializeAttachment),
  };
}

export function serializeSubmission(s: Submission & { files: Attachment[]; student?: User & { group?: Group | null } }) {
  return {
    id: s.id,
    text: s.text,
    status: s.status,
    score: s.score,
    teacherComment: s.teacherComment,
    attempt: s.attempt,
    submittedAt: s.submittedAt,
    gradedAt: s.gradedAt,
    files: s.files.map(serializeAttachment),
    student: s.student ? publicUser(s.student) : undefined,
  };
}

export async function loadAssignment(id: number) {
  const a = await prisma.assignment.findUnique({ where: { id }, include: assignmentInclude });
  if (!a) throw notFound('Задание не найдено');
  return a;
}

/** Просматривать задание могут: студенты назначенных групп, автор, администратор */
export async function assertCanView(user: AuthUser, a: FullAssignment) {
  if (user.role === 'ADMIN' || a.teacherId === user.id) return;
  if (user.role === 'STUDENT') {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (me.groupId && a.groups.some((g) => g.group.id === me.groupId)) return;
  }
  throw forbidden('Нет доступа к заданию');
}

/** Управлять заданием (редактировать, проверять сдачи) могут автор и администратор */
export function assertCanManage(user: AuthUser, a: Pick<Assignment, 'teacherId'>) {
  if (user.role === 'ADMIN' || a.teacherId === user.id) return;
  throw forbidden('Вы не автор этого задания');
}

/** Преподаватель может давать задания только тем группам, у которых ведёт этот предмет */
export async function assertTeaches(teacherId: number, subjectId: number, groupIds: number[]) {
  const count = await prisma.teaching.count({ where: { teacherId, subjectId, groupId: { in: groupIds } } });
  if (count !== new Set(groupIds).size) throw forbidden('Вы не ведёте этот предмет у выбранных групп');
}

export async function studentIdsOfGroups(groupIds: number[]) {
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', isActive: true, groupId: { in: groupIds } },
    select: { id: true },
  });
  return students.map((s) => s.id);
}
