import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import clsx from 'clsx';
import { CalendarDays, ClipboardCheck, Coffee, Hourglass, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Role, ScheduleEntry, StudentStatus } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { GradePill } from '../components/GradePill';
import { LessonCard } from '../components/LessonCard';
import { countLabel, TodayStrip, type TodayFact } from '../components/TodayStrip';
import { Badge, Card, CardHeader, EmptyState, Loading } from '../components/ui';
import { fmtDeadline, hoursLeft, STATUS, STATUS_TONE } from '../utils/format';
import { formatGrade } from '../utils/grades';
import { currentAndNext } from '../utils/schedule';

interface DashboardData {
  today: { date: string; weekNumber: number; parity: 'ODD' | 'EVEN' };
  lessons: ScheduleEntry[];
  unreadMessages: number;
  deadlines?: { id: number; title: string; subject: string; deadline: string; status: StudentStatus }[];
  recentGrades?: { assignmentId: number; title: string; subject: string; score: number; gradedAt: string }[];
  toCheckTotal?: number;
  toCheck?: { id: number; title: string; subject: string; count: number }[];
}

/** Тикает раз в минуту, чтобы подсветка текущей пары обновлялась без перезагрузки */
function useMinuteTick() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

/** Короткие факты под линейкой дня — словами, а не крупными цифрами */
function buildFacts(data: DashboardData, role: Role): TodayFact[] {
  const facts: TodayFact[] = [];
  if (role === 'STUDENT') {
    const list = data.deadlines ?? [];
    const first = list[0];
    facts.push({
      label: 'Дедлайны',
      to: '/assignments?status=pending',
      hot: !!first && hoursLeft(first.deadline) < 24,
      value: first ? `${countLabel(list.length, ['задание', 'задания', 'заданий'])}, ближайшее ${fmtDeadline(first.deadline)}` : 'всё сдано',
    });
    const grade = data.recentGrades?.[0];
    facts.push({
      label: 'Последняя оценка',
      to: '/grades',
      value: grade ? `${formatGrade(grade.score)} — ${grade.title}` : 'пока нет',
    });
  } else {
    const total = data.toCheckTotal ?? 0;
    facts.push({
      label: 'На проверке',
      to: '/assignments',
      hot: total > 0,
      value: total ? `${countLabel(total, ['работа', 'работы', 'работ'])}, больше всего — «${data.toCheck?.[0]?.title}»` : 'всё проверено',
    });
  }
  facts.push({
    label: 'Сообщения',
    to: '/chats',
    hot: data.unreadMessages > 0,
    value: data.unreadMessages ? countLabel(data.unreadMessages, ['новое', 'новых', 'новых']) : 'нет новых',
  });
  return facts;
}

export function DashboardPage() {
  const me = useMe();
  const now = useMinuteTick();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
    refetchInterval: 5 * 60_000,
  });

  if (isLoading || !data) return <Loading />;
  const { currentId, nextId } = currentAndNext(data.lessons, now);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted first-letter:uppercase">
            {format(now, 'EEEE, d MMMM', { locale: ru })} · {data.today.weekNumber}-я неделя,{' '}
            {data.today.parity === 'ODD' ? 'нечётная' : 'чётная'}
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">
            {greeting(now)}, {me.firstName}
          </h1>
        </div>
      </div>

      <TodayStrip lessons={data.lessons} now={now} facts={buildFacts(data, me.role)} />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader
            title="Пары на сегодня"
            icon={<CalendarDays className="h-4 w-4" />}
            action={
              <Link to="/schedule" className="text-xs font-semibold text-accent hover:underline">
                Вся неделя
              </Link>
            }
          />
          <div className="space-y-2.5 p-4">
            {data.lessons.length ? (
              data.lessons.map((l) => (
                <LessonCard key={l.id} lesson={l} role={me.role} state={l.id === currentId ? 'current' : l.id === nextId ? 'next' : null} />
              ))
            ) : (
              <EmptyState icon={<Coffee />} title="Сегодня пар нет" text="Можно спокойно заняться заданиями" />
            )}
          </div>
        </Card>

        {me.role === 'STUDENT' ? (
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Ближайшие дедлайны"
                icon={<Hourglass className="h-4 w-4" />}
                action={
                  <Link to="/assignments" className="text-xs font-semibold text-accent hover:underline">
                    Все задания
                  </Link>
                }
              />
              {data.deadlines?.length ? (
                <ul className="divide-y divide-line">
                  {data.deadlines.map((d) => {
                    const urgent = hoursLeft(d.deadline) < 24;
                    return (
                      <li key={d.id}>
                        <Link to={`/assignments/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{d.title}</span>
                            <span className="block truncate text-xs text-muted">{d.subject}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className={clsx('block text-xs font-semibold tabular', urgent ? 'text-danger' : 'text-ink')}>
                              {fmtDeadline(d.deadline)}
                            </span>
                            {d.status === 'returned' && (
                              <Badge tone={STATUS_TONE[d.status]} className="mt-1">
                                {STATUS[d.status]}
                              </Badge>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState title="Все задания сданы" text="Новых дедлайнов пока нет" />
              )}
            </Card>

            <Card>
              <CardHeader
                title="Последние оценки"
                icon={<Star className="h-4 w-4" />}
                action={
                  <Link to="/grades" className="text-xs font-semibold text-accent hover:underline">
                    Все оценки
                  </Link>
                }
              />
              {data.recentGrades?.length ? (
                <ul className="divide-y divide-line">
                  {data.recentGrades.map((g) => (
                    <li key={g.assignmentId}>
                      <Link to={`/assignments/${g.assignmentId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{g.title}</span>
                          <span className="block truncate text-xs text-muted">{g.subject}</span>
                        </span>
                        <GradePill score={g.score} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Оценок пока нет" />
              )}
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader title="Ждут проверки" icon={<ClipboardCheck className="h-4 w-4" />} />
            {data.toCheck?.length ? (
              <ul className="divide-y divide-line">
                {data.toCheck.map((a) => (
                  <li key={a.id}>
                    <Link to={`/assignments/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{a.title}</span>
                        <span className="block truncate text-xs text-muted">{a.subject}</span>
                      </span>
                      <Badge tone="accent">{a.count}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<ClipboardCheck />} title="Всё проверено" text="Новые сдачи появятся здесь" />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

