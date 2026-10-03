import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookOpenCheck, CalendarClock, Paperclip, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Assignment, StudentStatus } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { Badge, Button, EmptyState, Loading, PageHeader, Select, Tabs } from '../components/ui';
import { fmtDeadline, hoursLeft, STATUS, STATUS_TONE } from '../utils/format';
import { ScorePill } from './DashboardPage';

type Filter = 'all' | StudentStatus;

const STATUS_TABS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Не сдано' },
  { value: 'returned', label: 'На доработке' },
  { value: 'submitted', label: 'Сдано' },
  { value: 'graded', label: 'Проверено' },
  { value: 'overdue', label: 'Просрочено' },
];

export function AssignmentsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Filter | null) ?? 'all';
  const subjectId = params.get('subject') ?? '';
  const isStudent = me.role === 'STUDENT';

  // Загружаем всё и фильтруем на клиенте — заданий у студента немного, а фильтры мгновенные
  const { data, isLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: async () => (await api.get<Assignment[]>('/assignments')).data,
  });

  const subjects = useMemo(() => {
    const map = new Map<number, string>();
    data?.forEach((a) => map.set(a.subject.id, a.subject.name));
    return [...map].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [data]);

  const filtered = (data ?? []).filter(
    (a) => (!subjectId || a.subject.id === Number(subjectId)) && (status === 'all' || a.status === status),
  );

  const counts = useMemo(() => {
    const c: Partial<Record<Filter, number>> = { all: data?.length ?? 0 };
    data?.forEach((a) => a.status && (c[a.status] = (c[a.status] ?? 0) + 1));
    return c;
  }, [data]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Задания"
        subtitle={isStudent ? 'Домашние и лабораторные работы вашей группы' : me.role === 'TEACHER' ? 'Задания, которые вы выдали' : 'Все задания портала'}
        actions={
          me.role === 'TEACHER' && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/assignments/new')}>
              Новое задание
            </Button>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {isStudent && (
          <Tabs
            value={status}
            onChange={(v) => setParam('status', v)}
            items={STATUS_TABS.map((t) => ({
              value: t.value,
              label: (
                <>
                  {t.label}
                  {!!counts[t.value] && <span className="ml-1.5 text-xs opacity-60 tabular">{counts[t.value]}</span>}
                </>
              ),
            }))}
          />
        )}
        <Select value={subjectId} onChange={(e) => setParam('subject', e.target.value)} className="lg:w-72" aria-label="Предмет">
          <option value="">Все предметы</option>
          {subjects.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <Loading />
      ) : !filtered.length ? (
        <div className="card">
          <EmptyState
            icon={<BookOpenCheck />}
            title={data?.length ? 'Ничего не найдено' : 'Заданий пока нет'}
            text={data?.length ? 'Попробуйте изменить фильтры' : isStudent ? 'Когда преподаватель выдаст задание, оно появится здесь' : undefined}
          />
        </div>
      ) : (
        <ul className="grid gap-3">
          {filtered.map((a) => (
            <li key={a.id}>
              <Link to={`/assignments/${a.id}`} className="card group flex flex-col gap-3 p-4 transition-colors hover:border-accent/50 sm:flex-row sm:items-center sm:p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold uppercase tracking-wider">{a.subject.name}</span>
                    {!isStudent && <span>· {a.groups.map((g) => g.name).join(', ')}</span>}
                    {a.files.length > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Paperclip className="h-3 w-3" />
                        {a.files.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-semibold group-hover:text-accent">{a.title}</div>
                  <div
                    className={clsx(
                      'mt-1.5 inline-flex items-center gap-1.5 text-xs tabular',
                      isStudent && a.canSubmit && hoursLeft(a.deadline) < 24 && hoursLeft(a.deadline) > 0 ? 'font-semibold text-danger' : 'text-muted',
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" /> до {fmtDeadline(a.deadline)}
                    <span className="text-muted">· макс. {a.maxScore} б.</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {isStudent && a.status && (
                    <>
                      {a.status === 'graded' && <ScorePill score={a.score ?? null} max={a.maxScore} />}
                      <Badge tone={STATUS_TONE[a.status]}>{STATUS[a.status]}</Badge>
                    </>
                  )}
                  {a.stats && (
                    <div className="flex items-center gap-2 text-xs">
                      {a.stats.toCheck > 0 && <Badge tone="accent">Проверить: {a.stats.toCheck}</Badge>}
                      <span className="tabular text-muted">
                        сдали {a.stats.submitted}/{a.stats.students}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
