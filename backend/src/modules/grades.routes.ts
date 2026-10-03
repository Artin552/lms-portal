import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { prisma } from '../prisma';
import { studentStatus } from '../services/assignments';
import { publicUser } from '../services/users';
import { forbidden } from '../utils/errors';

export const gradesRouter = Router();
gradesRouter.use(requireAuth);

/** «Мои оценки»: проверенные работы студента и средний процент по предметам */
gradesRouter.get('/my', requireRole('STUDENT'), async (req, res) => {
  const me = currentUser(req);
  const subs = await prisma.submission.findMany({
    where: { studentId: me.id, status: 'GRADED' },
    include: { assignment: { include: { subject: true } } },
    orderBy: { gradedAt: 'desc' },
  });
  const bySubject = new Map<number, { subject: { id: number; name: string }; earned: number; max: number; count: number }>();
  for (const s of subs) {
    const subj = s.assignment.subject;
    const acc = bySubject.get(subj.id) ?? { subject: { id: subj.id, name: subj.name }, earned: 0, max: 0, count: 0 };
    acc.earned += s.score ?? 0;
    acc.max += s.assignment.maxScore;
    acc.count += 1;
    bySubject.set(subj.id, acc);
  }
  res.json({
    grades: subs.map((s) => ({
      submissionId: s.id,
      assignmentId: s.assignmentId,
      title: s.assignment.title,
      subject: { id: s.assignment.subject.id, name: s.assignment.subject.name },
      score: s.score,
      maxScore: s.assignment.maxScore,
      comment: s.teacherComment,
      gradedAt: s.gradedAt,
    })),
    subjects: [...bySubject.values()].map((v) => ({
      ...v,
      percent: v.max ? Math.round((v.earned / v.max) * 100) : 0,
    })),
  });
});

const gradebookQuery = z.object({
  groupId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
});

/** Сводная ведомость: студенты группы × задания по предмету */
gradesRouter.get('/gradebook', requireRole('TEACHER', 'ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const { groupId, subjectId } = gradebookQuery.parse(req.query);
  if (me.role === 'TEACHER') {
    const teaches = await prisma.teaching.findFirst({ where: { teacherId: me.id, groupId, subjectId } });
    if (!teaches) throw forbidden('Вы не ведёте этот предмет у группы');
  }
  const [students, assignments] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'STUDENT', isActive: true, groupId },
      include: { group: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.assignment.findMany({
      where: { subjectId, groups: { some: { groupId } } },
      include: { submissions: true },
      orderBy: { deadline: 'asc' },
    }),
  ]);
  const totalMax = assignments.reduce((s, a) => s + a.maxScore, 0);
  res.json({
    assignments: assignments.map((a) => ({ id: a.id, title: a.title, deadline: a.deadline, maxScore: a.maxScore })),
    rows: students.map((st) => {
      let earned = 0;
      const cells = assignments.map((a) => {
        const sub = a.submissions.find((s) => s.studentId === st.id) ?? null;
        if (sub?.status === 'GRADED') earned += sub.score ?? 0;
        return {
          assignmentId: a.id,
          submissionId: sub?.id ?? null,
          status: studentStatus(a, sub),
          score: sub?.score ?? null,
        };
      });
      return {
        student: publicUser(st),
        cells,
        total: earned,
        percent: totalMax ? Math.round((earned / totalMax) * 100) : 0,
      };
    }),
    totalMax,
  });
});
