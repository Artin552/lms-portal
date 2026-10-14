import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { GraduationCap, Table2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Profile, PublicUser, Ref, StudentStatus } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { Card, CardHeader, EmptyState, Loading, PageHeader, Select } from '../components/ui';
import { fmtDate, plural, STATUS } from '../utils/format';
import { GradePill } from '../components/GradePill';
import { formatGrade, gradeFraction, gradeTone } from '../utils/grades';

export function GradesPage() {
  const me = useMe();
  return me.role === 'STUDENT' ? <MyGrades /> : <Gradebook />;
}

// ───────────── Студент ─────────────

interface MyGradesData {
  grades: {
    submissionId: number;
    assignmentId: number;
    title: string;
    subject: Ref;
    score: number;
    comment: string | null;
    gradedAt: string;
  }[];
  subjects: { subject: Ref; count: number; average: number | null }[];
  average: number | null;
}

const BAR: Record<ReturnType<typeof gradeTone>, string> = { ok: 'bg-ok', info: 'bg-info', warn: 'bg-warn', danger: 'bg-danger' };

function MyGrades() {
  const { data, isLoading } = useQuery({
    queryKey: ['grades', 'my'],
    queryFn: async () => (await api.get<MyGradesData>('/grades/my')).data,
  });
  const [subject, setSubject] = useState('');

  if (isLoading || !data) return <Loading />;
  const list = data.grades.filter((g) => !subject || g.subject.id === Number(subject));

  return (
    <div>
      <PageHeader
        title="Мои оценки"
        subtitle={
          data.average !== null ? (
            <>
              Средний балл по всем предметам — <b className="tabular text-ink">{formatGrade(data.average)}</b>
            </>
          ) : (
            'Оценки за проверенные работы'
          )
        }
      />
      {!data.grades.length ? (
        <div className="card">
          <EmptyState icon={<GraduationCap />} title="Оценок пока нет" text="Они появятся, когда преподаватель проверит ваши работы" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.subjects.map((s) => (
              <button
                key={s.subject.id}
                onClick={() => setSubject(subject === String(s.subject.id) ? '' : String(s.subject.id))}
                className={clsx(
                  'card p-4 text-left transition-colors hover:border-accent/50',
                  subject === String(s.subject.id) && 'border-accent ring-2 ring-accent/20',
                )}
              >
                <div className="truncate text-sm font-semibold">{s.subject.name}</div>
                <div className="mt-3 flex items-end justify-between">
                  <span className="font-display text-3xl font-semibold tabular leading-none">{formatGrade(s.average)}</span>
                  <span className="text-xs text-muted tabular">
                    средний · {s.count} {plural(s.count, ['оценка', 'оценки', 'оценок'])}
                  </span>
                </div>
                {s.average !== null && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className={clsx('h-full rounded-full', BAR[gradeTone(s.average)])} style={{ width: `${Math.max(4, gradeFraction(s.average) * 100)}%` }} />
                  </div>
                )}
              </button>
            ))}
          </div>

          <Card>
            <CardHeader
              title="Все оценки"
              action={
                <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 w-56 py-1 text-xs">
                  <option value="">Все предметы</option>
                  {data.subjects.map((s) => (
                    <option key={s.subject.id} value={s.subject.id}>
                      {s.subject.name}
                    </option>
                  ))}
                </Select>
              }
            />
            <ul className="divide-y divide-line">
              {list.map((g) => (
                <li key={g.submissionId}>
                  <Link to={`/assignments/${g.assignmentId}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{g.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {g.subject.name} · {fmtDate(g.gradedAt)}
                        {g.comment && ` · «${g.comment}»`}
                      </span>
                    </span>
                    <GradePill score={g.score} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

// ───────────── Преподаватель / администратор ─────────────

interface GradebookData {
  assignments: { id: number; title: string; deadline: string }[];
  rows: {
    student: PublicUser;
    cells: { assignmentId: number; submissionId: number | null; status: StudentStatus; score: number | null }[];
    average: number | null;
    gradedCount: number;
  }[];
}

const CELL: Record<StudentStatus, string> = {
  graded: '',
  submitted: 'text-info',
  returned: 'text-warn',
  pending: 'text-muted/50',
  overdue: 'text-danger',
};

function Gradebook() {
  const me = useMe();
  const [selection, setSelection] = useState<{ groupId: number; subjectId: number } | null>(null);

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await api.get<Profile>('/users/me/profile')).data,
    enabled: me.role === 'TEACHER',
  });
  const adminTeachings = useQuery({
    queryKey: ['admin', 'teachings'],
    queryFn: async () => (await api.get<{ id: number; subject: Ref; group: Ref }[]>('/admin/teachings')).data,
    enabled: me.role === 'ADMIN',
  });

  const options = useMemo(() => {
    const list = me.role === 'TEACHER' ? profile.data?.teachings ?? [] : adminTeachings.data ?? [];
    const seen = new Set<string>();
    return list.filter((t) => {
      const key = `${t.group.id}:${t.subject.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [me.role, profile.data, adminTeachings.data]);

  useEffect(() => {
    if (!selection && options[0]) setSelection({ groupId: options[0].group.id, subjectId: options[0].subject.id });
  }, [options, selection]);

  const { data, isLoading } = useQuery({
    queryKey: ['gradebook', selection?.groupId, selection?.subjectId],
    queryFn: async () => (await api.get<GradebookData>('/grades/gradebook', { params: selection })).data,
    enabled: !!selection,
  });

  return (
    <div>
      <PageHeader
        title="Ведомость"
        subtitle="Оценки группы по предмету и средний балл каждого студента"
        actions={
          options.length > 0 && (
            <Select
              aria-label="Группа и предмет"
              value={selection ? `${selection.groupId}:${selection.subjectId}` : ''}
              onChange={(e) => {
                const [groupId, subjectId] = e.target.value.split(':').map(Number);
                setSelection({ groupId, subjectId });
              }}
              className="w-full sm:w-80"
            >
              {options.map((t) => (
                <option key={`${t.group.id}:${t.subject.id}`} value={`${t.group.id}:${t.subject.id}`}>
                  {t.group.name} — {t.subject.name}
                </option>
              ))}
            </Select>
          )
        }
      />

      {profile.isLoading || adminTeachings.isLoading ? (
        <Loading />
      ) : !options.length ? (
        <div className="card">
          <EmptyState icon={<Table2 />} title="Нет закреплённых предметов" text="Назначения преподавателей настраивает администратор" />
        </div>
      ) : isLoading || !data ? (
        <Loading />
      ) : !data.assignments.length ? (
        <div className="card">
          <EmptyState icon={<Table2 />} title="По этому предмету заданий ещё нет" />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2/60 text-left">
                  <th className="sticky left-0 z-10 min-w-[200px] bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">
                    Студент
                  </th>
                  {data.assignments.map((a) => (
                    <th key={a.id} className="min-w-[110px] px-3 py-3 align-bottom">
                      <Link to={`/assignments/${a.id}`} className="line-clamp-2 text-xs font-semibold hover:text-accent" title={a.title}>
                        {a.title}
                      </Link>
                      <span className="text-[11px] font-normal text-muted">
                        до {fmtDate(a.deadline)}
                      </span>
                    </th>
                  ))}
                  <th className="min-w-[96px] px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">Средний</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.student.id} className="border-b border-line/70 last:border-0 hover:bg-surface-2/40">
                    <td className="sticky left-0 z-10 bg-surface px-4 py-2.5 font-medium">{r.student.fullName}</td>
                    {r.cells.map((c) => (
                      <td key={c.assignmentId} className={clsx('px-3 py-2.5 tabular', CELL[c.status])} title={STATUS[c.status]}>
                        {c.status === 'graded' ? (
                          <GradePill score={c.score} className="py-0.5" />
                        ) : c.status === 'submitted' ? (
                          'сдано'
                        ) : c.status === 'returned' ? (
                          'доработка'
                        ) : c.status === 'overdue' ? (
                          'н/с'
                        ) : (
                          '—'
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right tabular" title={`Оценок: ${r.gradedCount}`}>
                      <b className="font-display text-base">{formatGrade(r.average)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-line px-4 py-3 text-xs text-muted">
            <span>
              <b className="text-ink">2–5</b> — оценка
            </span>
            <span className="text-info">сдано — ждёт проверки</span>
            <span className="text-warn">доработка — возвращено</span>
            <span className="text-danger">н/с — не сдано в срок</span>
          </div>
        </Card>
      )}
    </div>
  );
}
