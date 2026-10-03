import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import clsx from 'clsx';
import { ArrowRight, CalendarDays, ClipboardCheck, Coffee, Hourglass, MessagesSquare, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { ScheduleEntry, StudentStatus } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { LessonCard } from '../components/LessonCard';
import { Badge, Card, CardHeader, EmptyState, Loading } from '../components/ui';
import { fmtDeadline, hoursLeft, plural, STATUS, STATUS_TONE } from '../utils/format';
import { currentAndNext } from '../utils/schedule';

interface DashboardData {
  today: { date: string; weekNumber: number; parity: 'ODD' | 'EVEN' };
  lessons: ScheduleEntry[];
  unreadMessages: number;
  deadlines?: { id: number; title: string; subject: string; deadline: string; status: StudentStatus }[];
  recentGrades?: { assignmentId: number; title: string; subject: string; score: number; maxScore: number; gradedAt: string }[];
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

function Stat({ icon, label, value, to, tone }: { icon: JSX.Element; label: string; value: number | string; to: string; tone?: 'accent' }) {
  return (
    <Link to={to} className="card group flex items-center gap-4 p-4 transition-colors hover:border-accent/50">
      <span className={clsx('flex h-11 w-11 items-center justify-center rounded-lg', tone === 'accent' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-2xl font-semibold tabular leading-none">{value}</span>
        <span className="mt-1 block text-xs text-muted">{label}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<CalendarDays className="h-5 w-5" />} label={plural(data.lessons.length, ['пара сегодня', 'пары сегодня', 'пар сегодня'])} value={data.lessons.length} to="/schedule" />
        {me.role === 'STUDENT' ? (
          <Stat
            icon={<Hourglass className="h-5 w-5" />}
            label="ближайших дедлайнов"
            value={data.deadlines?.length ?? 0}
            to="/assignments?status=pending"
          />
        ) : (
          <Stat
            icon={<ClipboardCheck className="h-5 w-5" />}
            label={plural(data.toCheckTotal ?? 0, ['работа ждёт проверки', 'работы ждут проверки', 'работ ждут проверки'])}
            value={data.toCheckTotal ?? 0}
            to="/assignments"
            tone={(data.toCheckTotal ?? 0) > 0 ? 'accent' : undefined}
          />
        )}
        <Stat
          icon={<MessagesSquare className="h-5 w-5" />}
          label={plural(data.unreadMessages, ['непрочитанное сообщение', 'непрочитанных сообщения', 'непрочитанных сообщений'])}
          value={data.unreadMessages}
          to="/chats"
          tone={data.unreadMessages > 0 && me.role === 'STUDENT' ? 'accent' : undefined}
        />
      </div>

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
                        <ScorePill score={g.score} max={g.maxScore} />
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

export function ScorePill({ score, max }: { score: number | null; max: number }) {
  if (score === null) return <span className="text-sm text-muted">—</span>;
  const pct = score / max;
  return (
    <span
      className={clsx(
        'shrink-0 rounded-md px-2 py-1 font-display text-sm font-semibold tabular',
        pct >= 0.85 ? 'bg-ok/15 text-ok' : pct >= 0.6 ? 'bg-info/10 text-info' : 'bg-warn/15 text-warn',
      )}
    >
      {score}
      <span className="text-xs font-normal opacity-70">/{max}</span>
    </span>
  );
}
