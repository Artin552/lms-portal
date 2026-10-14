import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Save } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Assignment, Profile } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { FileList, FilePicker } from '../components/files';
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea } from '../components/ui';

interface FormState {
  subjectId: string;
  groupIds: number[];
  title: string;
  description: string;
  deadline: string; // значение datetime-local
}

const defaultDeadline = () => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  d.setHours(23, 59, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
};

export function AssignmentFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await api.get<Profile>('/users/me/profile')).data,
  });
  const existing = useQuery({
    queryKey: ['assignment', Number(id)],
    queryFn: async () => (await api.get<Assignment>(`/assignments/${id}`)).data,
    enabled: isEdit,
  });

  const [form, setForm] = useState<FormState>({
    subjectId: '',
    groupIds: [],
    title: '',
    description: '',
    deadline: defaultDeadline(),
  });
  const [files, setFiles] = useState<File[]>([]);
  const [removeIds, setRemoveIds] = useState<number[]>([]);

  useEffect(() => {
    const a = existing.data;
    if (!a) return;
    setForm({
      subjectId: String(a.subject.id),
      groupIds: a.groups.map((g) => g.id),
      title: a.title,
      description: a.description,
      deadline: format(new Date(a.deadline), "yyyy-MM-dd'T'HH:mm"),
    });
  }, [existing.data]);

  // Предметы и группы, которые ведёт преподаватель
  const subjects = useMemo(() => {
    const map = new Map<number, { name: string; groups: { id: number; name: string }[] }>();
    profile.data?.teachings.forEach((t) => {
      const s = map.get(t.subject.id) ?? { name: t.subject.name, groups: [] };
      s.groups.push(t.group);
      map.set(t.subject.id, s);
    });
    return map;
  }, [profile.data]);

  const groupOptions = isEdit && me.role === 'ADMIN'
    ? existing.data?.groups ?? []
    : subjects.get(Number(form.subjectId))?.groups ?? [];

  const save = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (!isEdit) fd.append('subjectId', form.subjectId);
      fd.append('groupIds', form.groupIds.join(','));
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('deadline', new Date(form.deadline).toISOString());
      if (removeIds.length) fd.append('removeFileIds', removeIds.join(','));
      files.forEach((f) => fd.append('files', f));
      const res = isEdit ? await api.put<Assignment>(`/assignments/${id}`, fd) : await api.post<Assignment>('/assignments', fd);
      return res.data;
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['assignment', a.id] });
      navigate(`/assignments/${a.id}`);
    },
  });

  if (profile.isLoading || (isEdit && existing.isLoading)) return <Loading />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={isEdit ? `/assignments/${id}` : '/assignments'} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Назад
      </Link>
      <PageHeader title={isEdit ? 'Редактирование задания' : 'Новое задание'} />

      {!isEdit && subjects.size === 0 ? (
        <ErrorBox message="За вами не закреплено ни одного предмета. Обратитесь к администратору." />
      ) : (
        <Card className="p-5 sm:p-6">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Предмет">
                {isEdit ? (
                  <Input value={existing.data?.subject.name ?? ''} disabled />
                ) : (
                  <Select value={form.subjectId} onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value, groupIds: [] }))} required>
                    <option value="">Выберите предмет</option>
                    {[...subjects].map(([sid, s]) => (
                      <option key={sid} value={sid}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div>
                <span className="label">Группы</span>
                <div className="flex min-h-[42px] flex-wrap gap-2">
                  {groupOptions.length ? (
                    groupOptions.map((g) => {
                      const checked = form.groupIds.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm transition-colors ${
                            checked ? 'border-accent bg-accent-soft/60 font-semibold' : 'border-line bg-surface hover:bg-surface-2'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="accent-[rgb(var(--accent))]"
                            checked={checked}
                            disabled={me.role === 'ADMIN'}
                            onChange={() => set('groupIds', checked ? form.groupIds.filter((x) => x !== g.id) : [...form.groupIds, g.id])}
                          />
                          {g.name}
                        </label>
                      );
                    })
                  ) : (
                    <span className="py-2 text-sm text-muted">Сначала выберите предмет</span>
                  )}
                </div>
              </div>
            </div>

            <Field label="Название">
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} required placeholder="Например: Лабораторная №3. Рекурсия" />
            </Field>
            <Field label="Описание">
              <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={8} placeholder="Условие, требования к оформлению, критерии оценки…" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Дедлайн">
                <Input type="datetime-local" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} required />
              </Field>
            </div>

            <div>
              <span className="label">Файлы</span>
              {existing.data && (
                <div className="mb-2">
                  <FileList files={existing.data.files.filter((f) => !removeIds.includes(f.id))} onRemove={(fid) => setRemoveIds((ids) => [...ids, fid])} />
                </div>
              )}
              <FilePicker files={files} onChange={setFiles} />
            </div>

            {save.error && <ErrorBox message={errorMessage(save.error)} />}
            <div className="flex gap-2 border-t border-line pt-5">
              <Button type="submit" loading={save.isPending} disabled={!form.groupIds.length} icon={<Save className="h-4 w-4" />}>
                {isEdit ? 'Сохранить' : 'Опубликовать задание'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
                Отмена
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
