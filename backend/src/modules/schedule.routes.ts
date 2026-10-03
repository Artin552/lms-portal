import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth';
import { prisma } from '../prisma';
import { scheduleInclude, scheduleScope, serializeEntry } from '../services/schedule';
import { mondayOf, parityOf, weekNumber } from '../utils/week';

export const scheduleRouter = Router();
scheduleRouter.use(requireAuth);

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  groupId: z.coerce.number().int().positive().optional(), // только для администратора
});

/**
 * Расписание на неделю, в которую попадает date (по умолчанию — текущая).
 * Пары отфильтрованы по чётности этой недели.
 */
scheduleRouter.get('/', async (req, res) => {
  const { date, groupId } = querySchema.parse(req.query);
  const day = date ? new Date(`${date}T12:00:00`) : new Date();
  const parity = parityOf(day);
  const scope = await scheduleScope(currentUser(req), groupId);
  const entries = scope
    ? await prisma.scheduleEntry.findMany({
        where: { ...scope, weekParity: { in: ['ALL', parity] } },
        include: scheduleInclude,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      })
    : [];
  const monday = mondayOf(day);
  res.json({
    weekNumber: weekNumber(day),
    parity,
    weekStart: `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`,
    entries: entries.map(serializeEntry),
  });
});
