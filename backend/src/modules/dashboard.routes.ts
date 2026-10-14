import { Router } from 'express';
import { currentUser, requireAuth } from '../middleware/auth';
import { prisma } from '../prisma';
import { canSubmit, studentStatus } from '../services/assignments';
import { totalUnread } from '../services/chats';
import { lessonsForDay } from '../services/schedule';
import { isoDayOfWeek, parityOf, weekNumber } from '../utils/week';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const now = new Date();
  const parity = parityOf(now);
  const base = {
    today: { date: now, weekNumber: weekNumber(now), parity },
    lessons: await lessonsForDay(me, isoDayOfWeek(now), parity),
    unreadMessages: await totalUnread(me.id),
  };

  if (me.role === 'STUDENT') {
    const student = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    const [upcoming, grades] = await Promise.all([
      student.groupId
        ? prisma.assignment.findMany({
            where: { groups: { some: { groupId: student.groupId } }, deadline: { gte: now } },
            include: { subject: true, submissions: { where: { studentId: me.id } } },
            orderBy: { deadline: 'asc' },
            take: 20,
          })
        : [],
      prisma.submission.findMany({
        where: { studentId: me.id, status: 'GRADED' },
        include: { assignment: { include: { subject: true } } },
        orderBy: { gradedAt: 'desc' },
        take: 5,
      }),
    ]);
    return res.json({
      ...base,
      deadlines: upcoming
        .filter((a) => canSubmit(a, a.submissions[0] ?? null, now) && a.submissions[0]?.status !== 'SUBMITTED')
        .slice(0, 6)
        .map((a) => ({
          id: a.id,
          title: a.title,
          subject: a.subject.name,
          deadline: a.deadline,
          status: studentStatus(a, a.submissions[0] ?? null, now),
        })),
      recentGrades: grades.map((s) => ({
        assignmentId: s.assignmentId,
        title: s.assignment.title,
        subject: s.assignment.subject.name,
        score: s.score,
        gradedAt: s.gradedAt,
      })),
    });
  }

  const toCheck = await prisma.submission.findMany({
    where: { status: 'SUBMITTED', ...(me.role === 'TEACHER' && { assignment: { teacherId: me.id } }) },
    include: { assignment: { include: { subject: true } } },
  });
  const byAssignment = new Map<number, { id: number; title: string; subject: string; count: number }>();
  for (const s of toCheck) {
    const cur = byAssignment.get(s.assignmentId) ?? {
      id: s.assignmentId,
      title: s.assignment.title,
      subject: s.assignment.subject.name,
      count: 0,
    };
    cur.count += 1;
    byAssignment.set(s.assignmentId, cur);
  }
  res.json({
    ...base,
    toCheckTotal: toCheck.length,
    toCheck: [...byAssignment.values()].sort((a, b) => b.count - a.count).slice(0, 6),
  });
});
