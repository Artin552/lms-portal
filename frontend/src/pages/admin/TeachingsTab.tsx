import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import { Avatar, Button, Card, CardHeader, EmptyState, ErrorBox, IconButton, Loading, Select } from '../../components/ui';
import { useGroups, useSubjects, useTeachers, type AdminTeaching } from './adminApi';

export function TeachingsTab() {
  const qc = useQueryClient();
  const groups = useGroups();
  const subjects = useSubjects();
  const teachers = useTeachers();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'teachings'],
    queryFn: async () => (await api.get<AdminTeaching[]>('/admin/teachings')).data,
  });
  const [form, setForm] = useState({ teacherId: '', subjectId: '', groupId: '' });

  const add = useMutation({
    mutationFn: () =>
      api.post('/admin/teachings', {
        teacherId: Number(form.teacherId),
        subjectId: Number(form.subjectId),
        groupId: Number(form.groupId),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      setForm((f) => ({ ...f, groupId: '' }));
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/teachings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  // Группировка по преподавателю
  const byTeacher = new Map<number, { teacher: AdminTeaching['teacher']; items: AdminTeaching[] }>();
  data?.forEach((t) => {
    const entry = byTeacher.get(t.teacher.id) ?? { teacher: t.teacher, items: [] };
    entry.items.push(t);
    byTeacher.set(t.teacher.id, entry);
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Назначить преподавателя" />
        <form onSubmit={submit} className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_160px_auto]">
          <Select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} required aria-label="Преподаватель">
            <option value="">Преподаватель</option>
            {teachers.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </Select>
          <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required aria-label="Предмет">
            <option value="">Предмет</option>
            {subjects.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} required aria-label="Группа">
            <option value="">Группа</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Button type="submit" loading={add.isPending} icon={<Plus className="h-4 w-4" />}>
            Назначить
          </Button>
        </form>
        {add.error && (
          <div className="px-4 pb-4">
            <ErrorBox message={errorMessage(add.error)} />
          </div>
        )}
        <p className="px-4 pb-4 text-xs text-muted">
          Назначение даёт преподавателю право выдавать задания группе и добавляет его в чат группы и чат по предмету.
        </p>
      </Card>

      {isLoading ? (
        <Loading />
      ) : !byTeacher.size ? (
        <Card>
          <EmptyState title="Назначений пока нет" />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {[...byTeacher.values()].map(({ teacher, items }) => (
            <Card key={teacher.id}>
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Avatar name={teacher.fullName} url={teacher.avatarUrl} size={32} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{teacher.fullName}</div>
                  {teacher.department && <div className="truncate text-xs text-muted">{teacher.department}</div>}
                </div>
              </div>
              <ul className="divide-y divide-line/70">
                {items.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-4 py-1.5 text-sm">
                    <span className="flex-1">{t.subject.name}</span>
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold">{t.group.name}</span>
                    <IconButton
                      label="Снять назначение"
                      className="hover:text-danger"
                      onClick={() => confirm(`Снять ${teacher.shortName} с предмета «${t.subject.name}» у ${t.group.name}?`) && remove.mutate(t.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
