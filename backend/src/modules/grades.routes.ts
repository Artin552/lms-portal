import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { prisma } from '../prisma';
import { studentStatus } from '../services/assignments';
import { publicUser } from '../services/users';
import { forbidden } from '../utils/errors';
import { average } from '../utils/grades';

export const gradesRouter = Router();
gradesRouter.use(requireAuth);

/** «Мои оценки»: проверенные работы студента и средняя оценка по каждому предмету */
gradesRouter.get('/my', requireRole('STUDENT'), async (req, res) => {
  const me = currentUser(req);
  const subs = await prisma.submission.findMany({
    where: { studentId: me.id, status: 'GRADED', score: { not: null } },
    include: { assignment: { include: { subject: true } } },
    orderBy: { gradedAt: 'desc' },
  });
  const bySubject = new Map<number, { subject: { id: number; name: string }; scores: number[] }>();
  for (const s of subs) {
    const subj = s.assignment.subject;
    const acc = bySubject.get(subj.id) ?? { subject: { id: subj.id, name: subj.name }, scores: [] };
    acc.scores.push(s.score!);
    bySubject.set(subj.id, acc);
  }
  res.json({
    grades: subs.map((s) => ({
      submissionId: s.id,
      assignmentId: s.assignmentId,
      title: s.assignment.title,
      subject: { id: s.assignment.subject.id, name: s.assignment.subject.name },
      score: s.score,
      comment: s.teacherComment,
      gradedAt: s.gradedAt,
    })),
    subjects: [...bySubject.values()].map((v) => ({
      subject: v.subject,
      count: v.scores.length,
      average: average(v.scores),
    })),
    average: average(subs.map((s) => s.score!)),
  });
});

const gradebookQuery = z.object({
  groupId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
});

/** Сводная ведомость: студенты группы × задания по предмету, средняя оценка по строке */
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
  res.json({
    assignments: assignments.map((a) => ({ id: a.id, title: a.title, deadline: a.deadline })),
    rows: students.map((st) => {
      const graded: number[] = [];
      const cells = assignments.map((a) => {
        const sub = a.submissions.find((s) => s.studentId === st.id) ?? null;
        if (sub?.status === 'GRADED' && sub.score !== null) graded.push(sub.score);
        return {
          assignmentId: a.id,
          submissionId: sub?.id ?? null,
          status: studentStatus(a, sub),
          score: sub?.score ?? null,
        };
      });
      return { student: publicUser(st), cells, average: average(graded), gradedCount: graded.length };
    }),
  });
});
