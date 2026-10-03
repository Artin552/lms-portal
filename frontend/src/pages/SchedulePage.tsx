import { useQuery } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Coffee } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Ref, WeekSchedule } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { LessonCard } from '../components/LessonCard';
import { Badge, Button, IconButton, Loading, PageHeader, Select } from '../components/ui';
import { DAYS } from '../utils/format';
import { currentAndNext, isoDay, toISODate } from '../utils/schedule';

export function SchedulePage() {
  const me = useMe();
  const [offset, setOffset] = useState(0); // смещение в неделях от текущей
  const [groupId, setGroupId] = useState<number | ''>('');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const date = toISODate(addDays(new Date(), offset * 7));

  const groups = useQuery({
    queryKey: ['admin', 'groups'],
    queryFn: async () => (await api.get<(Ref & { course: number })[]>('/admin/groups')).data,
    enabled: me.role === 'ADMIN',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['schedule', date, groupId],
    queryFn: async () =>
      (await api.get<WeekSchedule>('/schedule', { params: { date, groupId: groupId || undefined } })).data,
  });

  const weekStart = data ? new Date(`${data.weekStart}T00:00:00`) : null;
  const todayIso = offset === 0 ? isoDay(now) : null;
  const days = [1, 2, 3, 4, 5, 6];

  return (
    <div>
      <PageHeader
        title="Расписание"
        subtitle={
          data && weekStart ? (
            <span className="flex flex-wrap items-center gap-2">
              <span>
                {format(weekStart, 'd MMMM', { locale: ru })} — {format(addDays(weekStart, 5), 'd MMMM', { locale: ru })}
              </span>
              <Badge tone={data.parity === 'ODD' ? 'accent' : 'info'}>
                {data.weekNumber}-я неделя · {data.parity === 'ODD' ? 'нечётная' : 'чётная'}
              </Badge>
            </span>
          ) : null
        }
        actions={
          <div className="flex items-center gap-1">
            {me.role === 'ADMIN' && (
              <Select value={groupId} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : '')} className="mr-2 w-40">
                <option value="">Все группы</option>
                {groups.data?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
            <IconButton label="Предыдущая неделя" onClick={() => setOffset((o) => o - 1)} className="border border-line bg-surface">
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <Button variant="secondary" onClick={() => setOffset(0)} disabled={offset === 0}>
              Текущая
            </Button>
            <IconButton label="Следующая неделя" onClick={() => setOffset((o) => o + 1)} className="border border-line bg-surface">
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
        }
      />

      {isLoading || !data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {days.map((day) => {
            const lessons = data.entries.filter((e) => e.dayOfWeek === day);
            const isToday = todayIso === day;
            const { currentId, nextId } = isToday ? currentAndNext(lessons, now) : { currentId: null, nextId: null };
            return (
              <section
                key={day}
                className={clsx('rounded-xl border p-3', isToday ? 'border-accent/60 bg-accent-soft/30' : 'border-line bg-surface/60')}
                aria-label={DAYS[day - 1]}
              >
                <header className="mb-2.5 flex items-baseline justify-between px-1">
                  <h2 className="text-sm font-semibold">{DAYS[day - 1]}</h2>
                  <span className={clsx('text-xs tabular', isToday ? 'font-semibold text-accent' : 'text-muted')}>
                    {isToday ? 'сегодня' : weekStart && format(addDays(weekStart, day - 1), 'd MMM', { locale: ru })}
                  </span>
                </header>
                <div className="space-y-2">
                  {lessons.length ? (
                    lessons.map((l) => (
                      <LessonCard
                        key={l.id}
                        lesson={l}
                        role={me.role}
                        showParity
                        state={l.id === currentId ? 'current' : l.id === nextId ? 'next' : null}
                      />
                    ))
                  ) : (
                    <div className="flex items-center gap-2 rounded border border-dashed border-line px-3 py-4 text-sm text-muted">
                      <Coffee className="h-4 w-4" /> Нет пар
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
