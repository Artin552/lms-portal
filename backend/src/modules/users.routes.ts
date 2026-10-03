import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { prisma } from '../prisma';
import { INLINE_IMAGE_MIME } from '../storage/files';
import { storage } from '../storage/storage';
import { publicUser, selfUser } from '../services/users';
import { badRequest, notFound } from '../utils/errors';

export const usersRouter = Router();

/** Аватар отдаётся без авторизации (используется в <img>), ключ файла не раскрывается */
usersRouter.get('/:id/avatar', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: Number(req.params.id) } });
  if (!user?.avatarKey || !(await storage.exists(user.avatarKey))) throw notFound();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ext = user.avatarKey.split('.').pop() ?? '';
  res.type(['png', 'jpeg', 'gif', 'webp'].includes(ext) ? ext : 'application/octet-stream');
  (await storage.get(user.avatarKey)).pipe(res);
});

usersRouter.use(requireAuth);

/** Полный профиль текущего пользователя (+ предметы преподавателя) */
usersRouter.get('/me/profile', async (req, res) => {
  const me = currentUser(req);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, include: { group: true } });
  const teachings =
    user.role === 'TEACHER'
      ? await prisma.teaching.findMany({
          where: { teacherId: me.id },
          include: { subject: true, group: true },
          orderBy: [{ subject: { name: 'asc' } }, { group: { name: 'asc' } }],
        })
      : [];
  res.json({
    ...selfUser(user),
    teachings: teachings.map((t) => ({
      id: t.id,
      subject: { id: t.subject.id, name: t.subject.name },
      group: { id: t.group.id, name: t.group.name },
    })),
  });
});

const profileSchema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный email').optional(),
});

usersRouter.patch('/me', async (req, res) => {
  const data = profileSchema.parse(req.body);
  const user = await prisma.user.update({ where: { id: currentUser(req).id }, data, include: { group: true } });
  res.json(selfUser(user));
});

usersRouter.post('/me/avatar', upload.single('avatar'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Файл не передан');
  if (!INLINE_IMAGE_MIME.has(file.mimetype)) throw badRequest('Аватар должен быть изображением PNG, JPG, GIF или WebP');
  if (file.size > 5 * 1024 * 1024) throw badRequest('Аватар должен быть не больше 5 МБ');
  const me = currentUser(req);
  const old = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  // Расширение берём из проверенного MIME, а не из имени файла
  const key = await storage.put(file.buffer, `avatar.${file.mimetype.split('/')[1]}`);
  const user = await prisma.user.update({ where: { id: me.id }, data: { avatarKey: key }, include: { group: true } });
  if (old.avatarKey) await storage.remove(old.avatarKey).catch(() => undefined);
  res.json(selfUser(user));
});

usersRouter.delete('/me/avatar', async (req, res) => {
  const me = currentUser(req);
  const old = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  const user = await prisma.user.update({ where: { id: me.id }, data: { avatarKey: null }, include: { group: true } });
  if (old.avatarKey) await storage.remove(old.avatarKey).catch(() => undefined);
  res.json(selfUser(user));
});

/** Поиск собеседников для личных сообщений */
usersRouter.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const me = currentUser(req);
  const words = q.split(/\s+/).filter(Boolean).slice(0, 3);
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: me.id },
      AND: words.map((w) => ({
        OR: [
          { lastName: { contains: w, mode: 'insensitive' as const } },
          { firstName: { contains: w, mode: 'insensitive' as const } },
          { middleName: { contains: w, mode: 'insensitive' as const } },
          { group: { name: { contains: w, mode: 'insensitive' as const } } },
        ],
      })),
    },
    include: { group: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 30,
  });
  res.json(users.map(publicUser));
});

usersRouter.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: Number(req.params.id) }, include: { group: true } });
  if (!user) throw notFound('Пользователь не найден');
  res.json(publicUser(user));
});
