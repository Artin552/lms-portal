import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, CalendarClock, Check, ChevronDown, MessageSquareText, Pencil, RotateCcw, Send, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Assignment, StudentStatus, Submission, SubmissionRow } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { FileList, FilePicker } from '../components/files';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Tabs, Textarea } from '../components/ui';
import { fmtDateTime, fmtDeadline, hoursLeft, STATUS, STATUS_TONE } from '../utils/format';
import { ScorePill } from './DashboardPage';

export function AssignmentDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const { data, isLoading, error } = useQuery({
    queryKey: ['assignment', Number(id)],
    queryFn: async () => (await api.get<Assignment>(`/assignments/${id}`)).data,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox message={errorMessage(error)} />;

  return (
    <div className="space-y-6">
      <Link to="/assignments" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Все задания
      </Link>
      <AssignmentInfo a={data} canManage={me.role === 'ADMIN' || data.teacher.id === me.id} />
      {me.role === 'STUDENT' ? <StudentPanel a={data} /> : <ReviewPanel assignmentId={data.id} maxScore={data.maxScore} />}
    </div>
  );
}

function AssignmentInfo({ a, canManage }: { a: Assignment; canManage: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.delete(`/assignments/${a.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      navigate('/assignments');
    },
  });
  const left = hoursLeft(a.deadline);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">{a.subject.name}</p>
            <h1 className="mt-1.5 text-xl font-semibold leading-snug sm:text-2xl">{a.title}</h1>
            <p className="mt-2 text-sm text-muted">
              {a.teacher.fullName} · {a.groups.map((g) => g.name).join(', ')}
            </p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => navigate(`/assignments/${a.id}/edit`)}>
                Изменить
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={remove.isPending}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => confirm('Удалить задание вместе со всеми сдачами?') && remove.mutate()}
              >
                Удалить
              </Button>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 tabular',
              left > 0 && left < 24 ? 'border-danger/30 bg-danger/5 font-semibold text-danger' : 'border-line bg-surface-2/60',
            )}
          >
            <CalendarClock className="h-4 w-4" /> Дедлайн: {fmtDateTime(a.deadline)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2/60 px-2.5 py-1">
            Максимум: <b className="tabular">{a.maxScore}</b> б.
          </span>
        </div>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        {a.description ? (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{a.description}</p>
        ) : (
          <p className="text-sm text-muted">Описание не указано.</p>
        )}
        <FileList files={a.files} />
      </div>
    </Card>
  );
}

// ───────────── Студент ─────────────

function StudentPanel({ a }: { a: Assignment }) {
  const qc = useQueryClient();
  const sub = a.submission;
  const [text, setText] = useState(sub?.text ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [removeIds, setRemoveIds] = useState<number[]>([]);
  const [editing, setEditing] = useState(!sub);
  const status = a.status as StudentStatus;

  const submit = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('text', text);
      if (removeIds.length) fd.append('removeFileIds', removeIds.join(','));
      files.forEach((f) => fd.append('files', f));
      return (await api.post(`/assignments/${a.id}/submission`, fd)).data;
    },
    onSuccess: () => {
      setFiles([]);
      setRemoveIds([]);
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['assignment', a.id] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <Card>
      <CardHeader title="Мой ответ" action={<Badge tone={STATUS_TONE[status]}>{STATUS[status]}</Badge>} />
      <div className="space-y-5 p-5">
        {sub && (sub.status === 'GRADED' || sub.status === 'RETURNED') && (
          <div
            className={clsx(
              'flex gap-3 rounded-lg border p-4',
              sub.status === 'GRADED' ? 'border-ok/30 bg-ok/5' : 'border-warn/30 bg-warn/5',
            )}
          >
            <MessageSquareText className={clsx('mt-0.5 h-5 w-5 shrink-0', sub.status === 'GRADED' ? 'text-ok' : 'text-warn')} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{sub.status === 'GRADED' ? 'Работа проверена' : 'Нужно доработать'}</span>
                {sub.status === 'GRADED' && <ScorePill score={sub.score} max={a.maxScore} />}
              </div>
              {sub.teacherComment && <p className="mt-1.5 whitespace-pre-wrap text-sm">{sub.teacherComment}</p>}
              {sub.gradedAt && <p className="mt-1.5 text-xs text-muted">{fmtDateTime(sub.gradedAt)}</p>}
            </div>
          </div>
        )}

        {sub && !editing && (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Сдано {fmtDateTime(sub.submittedAt)} · попытка {sub.attempt}
            </p>
            {sub.text && <p className="whitespace-pre-wrap break-words rounded-lg bg-surface-2/60 p-4 text-sm">{sub.text}</p>}
            <FileList files={sub.files} />
            {a.canSubmit && (
              <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setEditing(true)}>
                {sub.status === 'RETURNED' ? 'Доработать и сдать' : 'Пересдать'}
              </Button>
            )}
          </div>
        )}

        {editing && a.canSubmit && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <Field label="Текст ответа" hint="Можно вставить ссылку на репозиторий или облако">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Опишите решение…" />
            </Field>
            {sub && (
              <FileList
                files={sub.files.filter((f) => !removeIds.includes(f.id))}
                onRemove={(fid) => setRemoveIds((ids) => [...ids, fid])}
              />
            )}
            <FilePicker files={files} onChange={setFiles} />
            {submit.error && <ErrorBox message={errorMessage(submit.error)} />}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" loading={submit.isPending} icon={<Send className="h-4 w-4" />}>
                {sub ? 'Отправить снова' : 'Сдать работу'}
              </Button>
              {sub && (
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Отмена
                </Button>
              )}
              <span className="text-xs text-muted">Сдать можно до {fmtDeadline(a.deadline)}</span>
            </div>
          </form>
        )}

        {!sub && !a.canSubmit && (
          <EmptyState title="Срок сдачи истёк" text="Если работа ещё нужна, напишите преподавателю в чат." />
        )}
      </div>
    </Card>
  );
}

// ───────────── Преподаватель ─────────────

type ReviewFilter = 'all' | 'toCheck' | 'missing';

function ReviewPanel({ assignmentId, maxScore }: { assignmentId: number; maxScore: number }) {
  const [filter, setFilter] = useState<ReviewFilter>('toCheck');
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['submissions', assignmentId],
    queryFn: async () => (await api.get<{ rows: SubmissionRow[] }>(`/assignments/${assignmentId}/submissions`)).data,
  });

  const rows = data?.rows ?? [];
  const toCheck = rows.filter((r) => r.status === 'submitted');
  const missing = rows.filter((r) => !r.submission);
  const shown = filter === 'toCheck' ? toCheck : filter === 'missing' ? missing : rows;

  return (
    <Card>
      <CardHeader
        title="Сдачи"
        icon={<Users className="h-4 w-4" />}
        action={
          <span className="text-xs text-muted tabular">
            сдали {rows.length - missing.length} из {rows.length}
          </span>
        }
      />
      <div className="border-b border-line p-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'toCheck', label: `Ждут проверки · ${toCheck.length}` },
            { value: 'all', label: `Все · ${rows.length}` },
            { value: 'missing', label: `Не сдали · ${missing.length}` },
          ]}
        />
      </div>
      {isLoading ? (
        <Loading />
      ) : !shown.length ? (
        <EmptyState icon={<Check />} title={filter === 'toCheck' ? 'Всё проверено' : 'Пусто'} />
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => {
            const open = openId === r.student.id && !!r.submission;
            return (
              <li key={r.student.id}>
                <button
                  disabled={!r.submission}
                  onClick={() => setOpenId(open ? null : r.student.id)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2/50 disabled:cursor-default disabled:hover:bg-transparent"
                  aria-expanded={open}
                >
                  <Avatar name={r.student.fullName} url={r.student.avatarUrl} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.student.fullName}</span>
                    <span className="block text-xs text-muted">
                      {r.student.group?.name}
                      {r.submission && ` · ${fmtDateTime(r.submission.submittedAt)}`}
                      {r.submission && r.submission.attempt > 1 && ` · попытка ${r.submission.attempt}`}
                    </span>
                  </span>
                  {r.submission?.status === 'GRADED' && <ScorePill score={r.submission.score} max={maxScore} />}
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS[r.status]}</Badge>
                  {r.submission && <ChevronDown className={clsx('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />}
                </button>
                {open && r.submission && (
                  <ReviewForm submission={r.submission} maxScore={maxScore} assignmentId={assignmentId} onDone={() => setOpenId(null)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ReviewForm({
  submission,
  maxScore,
  assignmentId,
  onDone,
}: {
  submission: Submission;
  maxScore: number;
  assignmentId: number;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [score, setScore] = useState(submission.score?.toString() ?? '');
  const [comment, setComment] = useState(submission.teacherComment ?? '');

  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
    qc.invalidateQueries({ queryKey: ['assignments'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['gradebook'] });
    onDone();
  };
  const grade = useMutation({
    mutationFn: () => api.patch(`/submissions/${submission.id}/grade`, { score: Number(score), comment: comment || undefined }),
    onSuccess,
  });
  const ret = useMutation({
    mutationFn: () => api.patch(`/submissions/${submission.id}/return`, { comment }),
    onSuccess,
  });
  const err = grade.error ?? ret.error;
  const scoreNum = Number(score);
  const scoreValid = score !== '' && Number.isInteger(scoreNum) && scoreNum >= 0 && scoreNum <= maxScore;

  return (
    <div className="space-y-4 bg-surface-2/40 px-5 pb-5 pt-2">
      {submission.text ? (
        <p className="whitespace-pre-wrap break-words rounded-lg border border-line bg-surface p-4 text-sm">{submission.text}</p>
      ) : (
        <p className="text-sm text-muted">Без текста</p>
      )}
      <FileList files={submission.files} />
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <Field label={`Балл (0–${maxScore})`}>
          <Input type="number" min={0} max={maxScore} value={score} onChange={(e) => setScore(e.target.value)} className="tabular" />
        </Field>
        <Field label="Комментарий">
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что хорошо, что исправить" className="min-h-[42px]" />
        </Field>
      </div>
      {err && <ErrorBox message={errorMessage(err)} />}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => grade.mutate()} disabled={!scoreValid} loading={grade.isPending} icon={<Check className="h-4 w-4" />}>
          Выставить оценку
        </Button>
        <Button
          variant="secondary"
          onClick={() => ret.mutate()}
          disabled={!comment.trim()}
          loading={ret.isPending}
          icon={<RotateCcw className="h-4 w-4" />}
          title={!comment.trim() ? 'Напишите комментарий, что нужно доработать' : undefined}
        >
          Вернуть на доработку
        </Button>
      </div>
    </div>
  );
}
