import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import { Button, Card, EmptyState, ErrorBox, Field, IconButton, Input, Loading, Modal } from '../../components/ui';
import { plural } from '../../utils/format';
import { useGroups, useSubjects, type AdminGroup, type AdminSubject } from './adminApi';

function useRemove(path: string, confirmText: string) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/${path}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
    onError: (e) => alert(errorMessage(e)),
  });
  return (id: number, name: string) => confirm(confirmText.replace('%s', name)) && m.mutate(id);
}

// ───────────── Группы ─────────────

export function GroupsTab() {
  const { data, isLoading } = useGroups();
  const [editing, setEditing] = useState<AdminGroup | 'new' | null>(null);
  const remove = useRemove('groups', 'Удалить группу %s? Расписание, чаты и задания группы будут удалены, студенты останутся без группы.');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Для каждой новой группы автоматически создаётся общий чат.</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Группа
        </Button>
      </div>
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <Card>
          <EmptyState title="Групп пока нет" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((g) => (
            <Card key={g.id} className="flex items-center gap-3 p-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft font-display text-sm font-semibold text-accent">
                {g.course}к
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{g.name}</div>
                <div className="text-xs text-muted">
                  {g.studentsCount} {plural(g.studentsCount, ['студент', 'студента', 'студентов'])}
                </div>
              </div>
              <IconButton label="Изменить" onClick={() => setEditing(g)}>
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton label="Удалить" className="hover:text-danger" onClick={() => remove(g.id, g.name)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </Card>
          ))}
        </div>
      )}
      {editing && <GroupModal group={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GroupModal({ group, onClose }: { group: AdminGroup | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group?.name ?? '');
  const [course, setCourse] = useState(String(group?.course ?? 1));
  const save = useMutation({
    mutationFn: () => {
      const body = { name, course: Number(course) };
      return group ? api.put(`/admin/groups/${group.id}`, body) : api.post('/admin/groups', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open title={group ? 'Группа' : 'Новая группа'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="ПГС-31" autoFocus />
        </Field>
        <Field label="Курс">
          <Input type="number" min={1} max={6} value={course} onChange={(e) => setCourse(e.target.value)} required />
        </Field>
        {save.error && <ErrorBox message={errorMessage(save.error)} />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={save.isPending}>
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────── Предметы ─────────────

export function SubjectsTab() {
  const { data, isLoading } = useSubjects();
  const [editing, setEditing] = useState<AdminSubject | 'new' | null>(null);
  const remove = useRemove('subjects', 'Удалить предмет «%s»? Связанные пары, задания и чаты будут удалены.');

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Предмет
        </Button>
      </div>
      <Card className="overflow-hidden">
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <EmptyState title="Предметов пока нет" />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{s.name}</span>
                  {s.shortName && <span className="ml-2 text-xs text-muted">{s.shortName}</span>}
                </span>
                <IconButton label="Изменить" onClick={() => setEditing(s)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton label="Удалить" className="hover:text-danger" onClick={() => remove(s.id, s.name)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <SubjectModal subject={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SubjectModal({ subject, onClose }: { subject: AdminSubject | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(subject?.name ?? '');
  const [shortName, setShortName] = useState(subject?.shortName ?? '');
  const save = useMutation({
    mutationFn: () => {
      const body = { name, shortName: shortName || null };
      return subject ? api.put(`/admin/subjects/${subject.id}`, body) : api.post('/admin/subjects', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open title={subject ? 'Предмет' : 'Новый предмет'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Краткое название" hint="Необязательно">
          <Input value={shortName} onChange={(e) => setShortName(e.target.value)} />
        </Field>
        {save.error && <ErrorBox message={errorMessage(save.error)} />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={save.isPending}>
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
}
