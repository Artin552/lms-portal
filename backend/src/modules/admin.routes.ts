import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { prisma } from '../prisma';
import { syncGroupChats } from '../services/chatSync';
import { scheduleInclude, serializeEntry } from '../services/schedule';
import { PAIR_TIMES, parseScheduleCsv } from '../services/scheduleImport';
import { publicUser } from '../services/users';
import { storage } from '../storage/storage';
import { badRequest } from '../utils/errors';
import { idParam } from '../utils/zod';
import { hashPassword } from './auth.routes';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

// ───────────── Группы ─────────────

const groupBody = z.object({
  name: z.string().trim().min(1, 'Введите название').max(50),
  course: z.coerce.number().int().min(1).max(6).default(1),
});

adminRouter.get('/groups', async (_req, res) => {
  const groups = await prisma.group.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { students: { where: { role: 'STUDENT', isActive: true } } } } },
  });
  res.json(groups.map((g) => ({ id: g.id, name: g.name, course: g.course, studentsCount: g._count.students })));
});

adminRouter.post('/groups', async (req, res) => {
  const group = await prisma.group.create({ data: groupBody.parse(req.body) });
  await syncGroupChats(group.id); // общий чат группы создаётся автоматически
  res.status(201).json(group);
});

adminRouter.put('/groups/:id', async (req, res) => {
  const group = await prisma.group.update({ where: { id: idParam.parse(req.params.id) }, data: groupBody.parse(req.body) });
  await syncGroupChats(group.id);
  res.json(group);
});

adminRouter.delete('/groups/:id', async (req, res) => {
  await prisma.group.delete({ where: { id: idParam.parse(req.params.id) } });
  res.status(204).end();
});

// ───────────── Предметы ─────────────

const subjectBody = z.object({
  name: z.string().trim().min(1, 'Введите название').max(200),
  shortName: z.string().trim().max(30).optional().nullable(),
});

adminRouter.get('/subjects', async (_req, res) => {
  res.json(await prisma.subject.findMany({ orderBy: { name: 'asc' } }));
});

adminRouter.post('/subjects', async (req, res) => {
  res.status(201).json(await prisma.subject.create({ data: subjectBody.parse(req.body) }));
});

adminRouter.put('/subjects/:id', async (req, res) => {
  const subject = await prisma.subject.update({ where: { id: idParam.parse(req.params.id) }, data: subjectBody.parse(req.body) });
  const groups = await prisma.teaching.findMany({ where: { subjectId: subject.id }, distinct: ['groupId'] });
  for (const t of groups) await syncGroupChats(t.groupId); // обновить названия чатов
  res.json(subject);
});

adminRouter.delete('/subjects/:id', async (req, res) => {
  await prisma.subject.delete({ where: { id: idParam.parse(req.params.id) } });
  res.status(204).end();
});

// ───────────── Пользователи ─────────────

const userBase = z.object({
  login: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Логин: латиница, цифры, . _ -'),
  email: z.string().trim().toLowerCase().email('Некорректный email'),
  role: z.enum(['STUDENT', 'TEACHER', 'ADMIN']),
  lastName: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100).optional().nullable(),
  groupId: z.coerce.number().int().positive().optional().nullable(),
  department: z.string().trim().max(200).optional().nullable(),
  isActive: z.boolean().optional(),
});

const createUserBody = userBase.extend({ password: z.string().min(8, 'Пароль не короче 8 символов').max(128) });
const updateUserBody = userBase.partial().extend({ password: z.string().min(8).max(128).optional() });

/** Группа есть только у студента, кафедра — только у преподавателя */
function normalizeRoleFields<T extends { role?: string; groupId?: number | null; department?: string | null }>(d: T, role: string) {
  return {
    ...d,
    groupId: role === 'STUDENT' ? d.groupId ?? null : null,
    department: role === 'TEACHER' ? d.department ?? null : null,
  };
}

adminRouter.get('/users', async (req, res) => {
  const q = z
    .object({
      role: z.enum(['STUDENT', 'TEACHER', 'ADMIN']).optional(),
      groupId: z.coerce.number().int().positive().optional(),
      q: z.string().trim().optional(),
    })
    .parse(req.query);
  const users = await prisma.user.findMany({
    where: {
      role: q.role,
      groupId: q.groupId,
      ...(q.q && {
        OR: [
          { lastName: { contains: q.q, mode: 'insensitive' } },
          { firstName: { contains: q.q, mode: 'insensitive' } },
          { login: { contains: q.q, mode: 'insensitive' } },
          { email: { contains: q.q, mode: 'insensitive' } },
        ],
      }),
    },
    include: { group: true },
    orderBy: [{ role: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
  });
  res.json(users.map((u) => ({ ...publicUser(u), login: u.login, email: u.email, isActive: u.isActive })));
});

adminRouter.post('/users', async (req, res) => {
  const { password, ...data } = createUserBody.parse(req.body);
  if (data.role === 'STUDENT' && !data.groupId) throw badRequest('Для студента нужно указать группу');
  const user = await prisma.user.create({
    data: { ...normalizeRoleFields(data, data.role), passwordHash: await hashPassword(password) },
    include: { group: true },
  });
  if (user.groupId) await syncGroupChats(user.groupId);
  res.status(201).json({ ...publicUser(user), login: user.login, email: user.email, isActive: user.isActive });
});

adminRouter.put('/users/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  const me = currentUser(req);
  const { password, ...data } = updateUserBody.parse(req.body);
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (id === me.id && (data.role && data.role !== 'ADMIN' || data.isActive === false)) {
    throw badRequest('Нельзя снять с себя роль администратора или деактивировать себя');
  }
  const role = data.role ?? before.role;
  const normalized = normalizeRoleFields({ groupId: before.groupId, department: before.department, ...data }, role);
  if (role === 'STUDENT' && !normalized.groupId) throw badRequest('Для студента нужно указать группу');

  const user = await prisma.user.update({
    where: { id },
    data: { ...normalized, ...(password && { passwordHash: await hashPassword(password) }) },
    include: { group: true },
  });
  if (password || data.isActive === false) {
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  const affected = new Set([before.groupId, user.groupId].filter((g): g is number => !!g));
  if (before.role !== user.role || before.isActive !== user.isActive) {
    // смена роли или блокировка влияет на чаты групп, где пользователь вёл занятия
    const t = await prisma.teaching.findMany({ where: { teacherId: id } });
    t.forEach((x) => affected.add(x.groupId));
  }
  for (const g of affected) await syncGroupChats(g);
  res.json({ ...publicUser(user), login: user.login, email: user.email, isActive: user.isActive });
});

adminRouter.delete('/users/:id', async (req, res) => {
  const id = idParam.parse(req.params.id);
  if (id === currentUser(req).id) throw badRequest('Нельзя удалить самого себя');
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: { teachings: true, uploadedFiles: true } });
  await prisma.user.delete({ where: { id } });
  await Promise.all(user.uploadedFiles.map((f) => storage.remove(f.storageKey)));
  if (user.avatarKey) await storage.remove(user.avatarKey);
  const groups = new Set([user.groupId, ...user.teachings.map((t) => t.groupId)].filter((g): g is number => !!g));
  for (const g of groups) await syncGroupChats(g);
  res.status(204).end();
});

// ───────────── Назначения преподавателей ─────────────

const teachingBody = z.object({
  teacherId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
  groupId: z.coerce.number().int().positive(),
});

adminRouter.get('/teachings', async (_req, res) => {
  const list = await prisma.teaching.findMany({
    include: { teacher: true, subject: true, group: true },
    orderBy: [{ group: { name: 'asc' } }, { subject: { name: 'asc' } }],
  });
  res.json(
    list.map((t) => ({
      id: t.id,
      teacher: publicUser(t.teacher),
      subject: { id: t.subject.id, name: t.subject.name },
      group: { id: t.group.id, name: t.group.name },
    })),
  );
});

adminRouter.post('/teachings', async (req, res) => {
  const data = teachingBody.parse(req.body);
  const teacher = await prisma.user.findUnique({ where: { id: data.teacherId } });
  if (teacher?.role !== 'TEACHER') throw badRequest('Пользователь не является преподавателем');
  const t = await prisma.teaching.create({ data });
  await syncGroupChats(t.groupId); // создаёт чат по предмету и добавляет преподавателя
  res.status(201).json(t);
});

adminRouter.delete('/teachings/:id', async (req, res) => {
  const t = await prisma.teaching.delete({ where: { id: idParam.parse(req.params.id) } });
  await syncGroupChats(t.groupId);
  res.status(204).end();
});

// ───────────── Расписание ─────────────

const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время в формате ЧЧ:ММ');
const entryBody = z
  .object({
    groupId: z.coerce.number().int().positive(),
    subjectId: z.coerce.number().int().positive(),
    teacherId: z.coerce.number().int().positive(),
    dayOfWeek: z.coerce.number().int().min(1).max(6),
    pairNumber: z.coerce.number().int().min(1).max(8),
    startTime: timeStr.optional(),
    endTime: timeStr.optional(),
    type: z.enum(['LECTURE', 'PRACTICE', 'LAB']),
    room: z.string().trim().min(1, 'Укажите аудиторию').max(50),
    weekParity: z.enum(['ALL', 'ODD', 'EVEN']).default('ALL'),
  })
  .transform((d) => ({
    ...d,
    startTime: d.startTime ?? PAIR_TIMES[d.pairNumber]?.[0] ?? '08:30',
    endTime: d.endTime ?? PAIR_TIMES[d.pairNumber]?.[1] ?? '10:00',
  }))
  .refine((d) => d.startTime < d.endTime, { message: 'Время начала должно быть раньше окончания', path: ['endTime'] });

async function assertIsTeacher(teacherId: number) {
  const t = await prisma.user.findUnique({ where: { id: teacherId } });
  if (t?.role !== 'TEACHER') throw badRequest('Выбранный пользователь не преподаватель');
}

adminRouter.get('/schedule', async (req, res) => {
  const { groupId } = z.object({ groupId: z.coerce.number().int().positive().optional() }).parse(req.query);
  const entries = await prisma.scheduleEntry.findMany({
    where: { groupId },
    include: scheduleInclude,
    orderBy: [{ group: { name: 'asc' } }, { dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
  res.json(entries.map(serializeEntry));
});

adminRouter.get('/schedule/pair-times', (_req, res) => {
  res.json(PAIR_TIMES);
});

adminRouter.post('/schedule', async (req, res) => {
  const data = entryBody.parse(req.body);
  await assertIsTeacher(data.teacherId);
  const e = await prisma.scheduleEntry.create({ data, include: scheduleInclude });
  res.status(201).json(serializeEntry(e));
});

adminRouter.put('/schedule/:id', async (req, res) => {
  const data = entryBody.parse(req.body);
  await assertIsTeacher(data.teacherId);
  const e = await prisma.scheduleEntry.update({ where: { id: idParam.parse(req.params.id) }, data, include: scheduleInclude });
  res.json(serializeEntry(e));
});

adminRouter.delete('/schedule/:id', async (req, res) => {
  await prisma.scheduleEntry.delete({ where: { id: idParam.parse(req.params.id) } });
  res.status(204).end();
});

/** Импорт из CSV. replace=true — перед импортом удалить расписание групп, упомянутых в файле */
adminRouter.post('/schedule/import', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Файл не передан');
  const replace = String(req.body.replace ?? 'false') === 'true';
  const { rows, errors } = await parseScheduleCsv(req.file.buffer.toString('utf8'));
  if (errors.length) throw badRequest('Ошибки в файле, ничего не импортировано', errors);
  if (!rows.length) throw badRequest('В файле нет строк расписания');
  const groupIds = [...new Set(rows.map((r) => r.groupId))];
  await prisma.$transaction([
    ...(replace ? [prisma.scheduleEntry.deleteMany({ where: { groupId: { in: groupIds } } })] : []),
    prisma.scheduleEntry.createMany({ data: rows }),
  ]);
  res.json({ imported: rows.length, replacedGroups: replace ? groupIds.length : 0 });
});
