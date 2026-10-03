import { prisma } from '../prisma';
import { notifyOnce } from '../services/notifications';

/**
 * Напоминание «до дедлайна меньше 24 часов» студентам, которые ещё не сдали работу.
 * Идемпотентно (dedupeKey), поэтому безопасно запускать часто и после рестарта.
 */
export async function sendDeadlineReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 3600 * 1000);
  const assignments = await prisma.assignment.findMany({
    where: { deadline: { gt: now, lte: soon } },
    include: { subject: true, groups: true, submissions: { select: { studentId: true, status: true } } },
  });
  let sent = 0;
  for (const a of assignments) {
    const done = new Set(a.submissions.filter((s) => s.status !== 'RETURNED').map((s) => s.studentId));
    const students = await prisma.user.findMany({
      where: { role: 'STUDENT', isActive: true, groupId: { in: a.groups.map((g) => g.groupId) } },
      select: { id: true },
    });
    for (const s of students) {
      if (done.has(s.id)) continue;
      await notifyOnce(s.id, `deadline:${a.id}:${s.id}`, {
        type: 'DEADLINE_SOON',
        title: `Скоро дедлайн: ${a.title}`,
        body: `${a.subject.name}, сдать до ${a.deadline.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`,
        link: `/assignments/${a.id}`,
      });
      sent++;
    }
  }
  return sent;
}

export function startDeadlineReminderJob(intervalMs = 10 * 60 * 1000) {
  const run = () => sendDeadlineReminders().catch((e) => console.error('Ошибка напоминаний о дедлайнах', e));
  run();
  return setInterval(run, intervalMs);
}
