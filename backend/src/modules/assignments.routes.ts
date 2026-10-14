import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { prisma } from '../prisma';
import {
  assertCanManage,
  assertCanView,
  assertTeaches,
  assignmentInclude,
  canSubmit,
  loadAssignment,
  serializeAssignment,
  serializeSubmission,
  studentIdsOfGroups,
  studentStatus,
  type StudentStatus,
} from '../services/assignments';
import { notifyUsers } from '../services/notifications';
import { publicUser } from '../services/users';
import { saveAttachments } from '../storage/files';
import { storage } from '../storage/storage';
import { badRequest, forbidden } from '../utils/errors';
import { idList, idParam } from '../utils/zod';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

const listQuery = z.object({
  subjectId: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending', 'submitted', 'returned', 'graded', 'overdue']).optional(),
  groupId: z.coerce.number().int().positive().optional(),
});

assignmentsRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const q = listQuery.parse(req.query);

  if (me.role === 'STUDENT') {
    const student = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!student.groupId) return res.json([]);
    const list = await prisma.assignment.findMany({
      where: { groups: { some: { groupId: student.groupId } }, ...(q.subjectId && { subjectId: q.subjectId }) },
      include: { ...assignmentInclude, submissions: { where: { studentId: me.id } } },
      orderBy: { deadline: 'asc' },
    });
    const now = new Date();
    const result = list
      .map((a) => {
        const sub = a.submissions[0] ?? null;
        return {
          ...serializeAssignment(a),
          status: studentStatus(a, sub, now) as StudentStatus,
          canSubmit: canSubmit(a, sub, now),
          score: sub?.score ?? null,
        };
      })
      .filter((a) => !q.status || a.status === q.status);
    return res.json(result);
  }

  // Преподаватель видит свои задания, администратор — все
  const list = await prisma.assignment.findMany({
    where: {
      ...(me.role === 'TEACHER' && { teacherId: me.id }),
      ...(q.subjectId && { subjectId: q.subjectId }),
      ...(q.groupId && { groups: { some: { groupId: q.groupId } } }),
    },
    include: { ...assignmentInclude, submissions: { select: { status: true } } },
    orderBy: { deadline: 'desc' },
  });
  const studentCounts = await prisma.user.groupBy({
    by: ['groupId'],
    where: { role: 'STUDENT', isActive: true, groupId: { not: null } },
    _count: true,
  });
  const perGroup = new Map(studentCounts.map((c) => [c.groupId, c._count]));
  res.json(
    list.map((a) => ({
      ...serializeAssignment(a),
      stats: {
        students: a.groups.reduce((sum, g) => sum + (perGroup.get(g.group.id) ?? 0), 0),
        submitted: a.submissions.length,
        toCheck: a.submissions.filter((s) => s.status === 'SUBMITTED').length,
        graded: a.submissions.filter((s) => s.status === 'GRADED').length,
      },
    })),
  );
});

const assignmentBody = z.object({
  subjectId: z.coerce.number().int().positive(),
  groupIds: idList.refine((v) => v.length > 0, 'Выберите хотя бы одну группу'),
  title: z.string().trim().min(1, 'Введите название').max(200),
  description: z.string().max(20000).default(''),
  deadline: z.coerce.date({ invalid_type_error: 'Некорректный дедлайн' }),
});

assignmentsRouter.post('/', requireRole('TEACHER'), upload.array('files'), async (req, res) => {
  const me = currentUser(req);
  const data = assignmentBody.parse(req.body);
  if (data.deadline < new Date()) throw badRequest('Дедлайн должен быть в будущем');
  await assertTeaches(me.id, data.subjectId, data.groupIds);

  const created = await prisma.assignment.create({
    data: {
      subjectId: data.subjectId,
      teacherId: me.id,
      title: data.title,
      description: data.description,
      deadline: data.deadline,
      groups: { create: data.groupIds.map((groupId) => ({ groupId })) },
    },
  });
  await saveAttachments(req.files as Express.Multer.File[], me.id, { assignmentId: created.id });
  const full = await loadAssignment(created.id);

  await notifyUsers(await studentIdsOfGroups(data.groupIds), {
    type: 'NEW_ASSIGNMENT',
    title: `Новое задание: ${full.title}`,
    body: `${full.subject.name}, срок до ${full.deadline.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`,
    link: `/assignments/${full.id}`,
  });
  res.status(201).json(serializeAssignment(full));
});

assignmentsRouter.get('/:id', async (req, res) => {
  const me = currentUser(req);
  const a = await loadAssignment(idParam.parse(req.params.id));
  await assertCanView(me, a);
  if (me.role === 'STUDENT') {
    const sub = await prisma.submission.findUnique({
      where: { assignmentId_studentId: { assignmentId: a.id, studentId: me.id } },
      include: { files: true },
    });
    return res.json({
      ...serializeAssignment(a),
      status: studentStatus(a, sub),
      canSubmit: canSubmit(a, sub),
      submission: sub ? serializeSubmission(sub) : null,
    });
  }
  res.json(serializeAssignment(a));
});

const updateBody = assignmentBody
  .omit({ subjectId: true })
  .partial()
  .extend({ removeFileIds: idList.optional() });

assignmentsRouter.put('/:id', requireRole('TEACHER', 'ADMIN'), upload.array('files'), async (req, res) => {
  const me = currentUser(req);
  const a = await loadAssignment(idParam.parse(req.params.id));
  assertCanManage(me, a);
  const data = updateBody.parse(req.body);
  if (data.groupIds && me.role === 'TEACHER') await assertTeaches(me.id, a.subjectId, data.groupIds);

  if (data.removeFileIds?.length) {
    const files = await prisma.attachment.findMany({ where: { id: { in: data.removeFileIds }, assignmentId: a.id } });
    await prisma.attachment.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
    await Promise.all(files.map((f) => storage.remove(f.storageKey)));
  }
  await prisma.assignment.update({
    where: { id: a.id },
    data: {
      title: data.title,
      description: data.description,
      deadline: data.deadline,
      ...(data.groupIds && {
        groups: { deleteMany: {}, create: data.groupIds.map((groupId) => ({ groupId })) },
      }),
    },
  });
  await saveAttachments(req.files as Express.Multer.File[], me.id, { assignmentId: a.id });
  // Напоминание о дедлайне должно сработать заново, если срок перенесли
  if (data.deadline) await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: `deadline:${a.id}:` } } });
  res.json(serializeAssignment(await loadAssignment(a.id)));
});

assignmentsRouter.delete('/:id', requireRole('TEACHER', 'ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const a = await loadAssignment(idParam.parse(req.params.id));
  assertCanManage(me, a);
  const files = await prisma.attachment.findMany({
    where: { OR: [{ assignmentId: a.id }, { submission: { assignmentId: a.id } }] },
  });
  await prisma.assignment.delete({ where: { id: a.id } });
  await Promise.all(files.map((f) => storage.remove(f.storageKey)));
  res.status(204).end();
});

/** Все студенты назначенных групп и их сдачи (для проверки преподавателем) */
assignmentsRouter.get('/:id/submissions', requireRole('TEACHER', 'ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const a = await loadAssignment(idParam.parse(req.params.id));
  assertCanManage(me, a);
  const groupIds = a.groups.map((g) => g.group.id);
  const [students, submissions] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'STUDENT', isActive: true, groupId: { in: groupIds } },
      include: { group: true },
      orderBy: [{ group: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.submission.findMany({ where: { assignmentId: a.id }, include: { files: true } }),
  ]);
  const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
  res.json({
    assignment: serializeAssignment(a),
    rows: students.map((st) => {
      const sub = byStudent.get(st.id) ?? null;
      return {
        student: publicUser(st),
        status: studentStatus(a, sub),
        submission: sub ? serializeSubmission(sub) : null,
      };
    }),
  });
});

const submitBody = z.object({
  text: z.string().max(20000).default(''),
  removeFileIds: idList.optional(),
});

/** Сдача или пересдача работы студентом */
assignmentsRouter.post('/:id/submission', requireRole('STUDENT'), upload.array('files'), async (req, res) => {
  const me = currentUser(req);
  const a = await loadAssignment(idParam.parse(req.params.id));
  await assertCanView(me, a);
  const data = submitBody.parse(req.body);
  const newFiles = (req.files as Express.Multer.File[] | undefined) ?? [];

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId: a.id, studentId: me.id } },
    include: { files: true },
  });
  if (!canSubmit(a, existing)) {
    throw forbidden(existing?.status === 'GRADED' ? 'Работа уже проверена' : 'Срок сдачи истёк');
  }

  const removed = existing?.files.filter((f) => data.removeFileIds?.includes(f.id)) ?? [];
  const keptCount = (existing?.files.length ?? 0) - removed.length;
  if (!data.text.trim() && keptCount + newFiles.length === 0) {
    throw badRequest('Добавьте текст ответа или прикрепите файл');
  }

  const submission = existing
    ? await prisma.submission.update({
        where: { id: existing.id },
        data: {
          text: data.text,
          status: 'SUBMITTED',
          score: null,
          gradedAt: null,
          attempt: { increment: 1 },
          submittedAt: new Date(),
        },
      })
    : await prisma.submission.create({ data: { assignmentId: a.id, studentId: me.id, text: data.text } });

  if (removed.length) {
    await prisma.attachment.deleteMany({ where: { id: { in: removed.map((f) => f.id) } } });
    await Promise.all(removed.map((f) => storage.remove(f.storageKey)));
  }
  await saveAttachments(newFiles, me.id, { submissionId: submission.id });

  const full = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id }, include: { files: true } });
  res.status(existing ? 200 : 201).json({
    ...serializeSubmission(full),
    assignmentStatus: studentStatus(a, full),
    canSubmit: canSubmit(a, full),
  });
});
