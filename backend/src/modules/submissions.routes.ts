import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { prisma } from '../prisma';
import { assertCanManage, serializeSubmission } from '../services/assignments';
import { notifyUsers } from '../services/notifications';
import { notFound } from '../utils/errors';
import { formatGrade, gradeSchema } from '../utils/grades';
import { idParam } from '../utils/zod';

export const submissionsRouter = Router();
submissionsRouter.use(requireAuth, requireRole('TEACHER', 'ADMIN'));

async function loadForReview(id: number) {
  const sub = await prisma.submission.findUnique({ where: { id }, include: { assignment: { include: { subject: true } } } });
  if (!sub) throw notFound('Сдача не найдена');
  return sub;
}

const gradeBody = z.object({
  score: gradeSchema,
  comment: z.string().max(5000).optional(),
});

submissionsRouter.patch('/:id/grade', async (req, res) => {
  const me = currentUser(req);
  const sub = await loadForReview(idParam.parse(req.params.id));
  assertCanManage(me, sub.assignment);
  const { score, comment } = gradeBody.parse(req.body);

  const updated = await prisma.submission.update({
    where: { id: sub.id },
    data: { status: 'GRADED', score, teacherComment: comment ?? null, gradedAt: new Date() },
    include: { files: true },
  });
  await notifyUsers([sub.studentId], {
    type: 'GRADED',
    title: `Оценка: ${formatGrade(score)}`,
    body: `${sub.assignment.subject.name} — ${sub.assignment.title}`,
    link: `/assignments/${sub.assignmentId}`,
  });
  res.json(serializeSubmission(updated));
});

const returnBody = z.object({
  comment: z.string().trim().min(1, 'Напишите, что нужно доработать').max(5000),
});

submissionsRouter.patch('/:id/return', async (req, res) => {
  const me = currentUser(req);
  const sub = await loadForReview(idParam.parse(req.params.id));
  assertCanManage(me, sub.assignment);
  const { comment } = returnBody.parse(req.body);

  const updated = await prisma.submission.update({
    where: { id: sub.id },
    data: { status: 'RETURNED', score: null, teacherComment: comment, gradedAt: new Date() },
    include: { files: true },
  });
  await notifyUsers([sub.studentId], {
    type: 'RETURNED',
    title: 'Работа возвращена на доработку',
    body: `${sub.assignment.subject.name} — ${sub.assignment.title}`,
    link: `/assignments/${sub.assignmentId}`,
  });
  res.json(serializeSubmission(updated));
});
