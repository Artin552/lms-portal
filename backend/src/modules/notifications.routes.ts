import { Router } from 'express';
import { currentUser, requireAuth } from '../middleware/auth';
import { prisma } from '../prisma';
import { idParam } from '../utils/zod';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId: me.id, readAt: null } }),
  ]);
  res.json({ items, unread });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: currentUser(req).id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});

notificationsRouter.post('/:id/read', async (req, res) => {
  // Фильтр по userId не даёт пометить чужое уведомление
  await prisma.notification.updateMany({
    where: { id: idParam.parse(req.params.id), userId: currentUser(req).id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});
