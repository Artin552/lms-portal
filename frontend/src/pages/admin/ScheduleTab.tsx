import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { LessonType, ScheduleEntry, WeekParity } from '../../api/types';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Input, Loading, Modal, Select } from '../../components/ui';
import { DAYS, LESSON_TYPE, PARITY } from '../../utils/format';
import { useGroups, useSubjects, useTeachers } from './adminApi';

const CSV_TEMPLATE = [
  'group;day;pair;start;end;subject;type;room;teacher;week',
  'ПГС-31;пн;1;08:30;10:00;Строительная механика;лекция;201;teacher2;все',
  'ПГС-31;вт;2;;;Высшая математика;практика;306;teacher2;чет',
  'ИСТ-31;ср;3;;;Информатика и программирование;лаба;412;teacher;нечет',
].join('\n');

function downloadTemplate() {
  const blob = new Blob(['﻿' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'schedule-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ScheduleTab() {
  const qc = useQueryClient();
  const groups = useGroups();
  const [groupId, setGroupId] = useState('');
  const [editing, setEditing] = useState<ScheduleEntry | 'new' | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'schedule', groupId],
    queryFn: async () => (await api.get<ScheduleEntry[]>('/admin/schedule', { params: { groupId: groupId || undefined } })).data,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/schedule/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'schedule'] });
      qc.invalidateQueries({ queryKey: ['schedule'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="sm:w-48" aria-label="Группа">
          <option value="">Все группы</option>
          {groups.data?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <div className="flex-1" />
        <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
          Импорт CSV
        </Button>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Пара
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <EmptyState title="Расписание пусто" text="Добавьте пары вручную или импортируйте CSV" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2/60 text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-2.5 font-semibold">Группа</th>
                  <th className="px-4 py-2.5 font-semibold">День</th>
                  <th className="px-4 py-2.5 font-semibold">Время</th>
                  <th className="px-4 py-2.5 font-semibold">Предмет</th>
                  <th className="px-4 py-2.5 font-semibold">Преподаватель</th>
                  <th className="px-4 py-2.5 font-semibold">Ауд.</th>
                  <th className="px-4 py-2.5 font-semibold">Неделя</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id} className="border-b border-line/70 last:border-0 hover:bg-surface-2/40">
                    <td className="px-4 py-2 font-semibold">{e.group.name}</td>
                    <td className="px-4 py-2">{DAYS[e.dayOfWeek - 1]}</td>
                    <td className="px-4 py-2 tabular whitespace-nowrap">
                      {e.pairNumber}. {e.startTime}–{e.endTime}
                    </td>
                    <td className="px-4 py-2">
                      {e.subject.name}
                      <span className="ml-1.5 text-xs text-muted">{LESSON_TYPE[e.type]}</span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{e.teacher.shortName}</td>
                    <td className="px-4 py-2">{e.room}</td>
                    <td className="px-4 py-2">{e.weekParity === 'ALL' ? <span className="text-muted">все</span> : <Badge tone="warn">{PARITY[e.weekParity]}</Badge>}</td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <IconButton label="Изменить" onClick={() => setEditing(e)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Удалить" className="hover:text-danger" onClick={() => confirm('Удалить пару?') && remove.mutate(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <EntryModal entry={editing === 'new' ? null : editing} defaultGroupId={groupId} onClose={() => setEditing(null)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function EntryModal({ entry, defaultGroupId, onClose }: { entry: ScheduleEntry | null; defaultGroupId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const groups = useGroups();
  const subjects = useSubjects();
  const teachers = useTeachers();
  const pairTimes = useQuery({
    queryKey: ['admin', 'pair-times'],
    queryFn: async () => (await api.get<Record<string, [string, string]>>('/admin/schedule/pair-times')).data,
  });
  const [form, setForm] = useState({
    groupId: entry ? String(entry.group.id) : defaultGroupId,
    subjectId: entry ? String(entry.subject.id) : '',
    teacherId: entry ? String(entry.teacher.id) : '',
    dayOfWeek: String(entry?.dayOfWeek ?? 1),
    pairNumber: String(entry?.pairNumber ?? 1),
    startTime: entry?.startTime ?? '',
    endTime: entry?.endTime ?? '',
    type: (entry?.type ?? 'LECTURE') as LessonType,
    room: entry?.room ?? '',
    weekParity: (entry?.weekParity ?? 'ALL') as WeekParity,
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, startTime: form.startTime || undefined, endTime: form.endTime || undefined };
      return entry ? api.put(`/admin/schedule/${entry.id}`, body) : api.post('/admin/schedule', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'schedule'] });
      qc.invalidateQueries({ queryKey: ['schedule'] });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const std = pairTimes.data?.[form.pairNumber];

  return (
    <Modal open title={entry ? 'Редактирование пары' : 'Новая пара'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Группа">
            <Select value={form.groupId} onChange={(e) => set('groupId', e.target.value)} required>
              <option value="">—</option>
              {groups.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Предмет">
            <Select value={form.subjectId} onChange={(e) => set('subjectId', e.target.value)} required>
              <option value="">—</option>
              {subjects.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Преподаватель">
            <Select value={form.teacherId} onChange={(e) => set('teacherId', e.target.value)} required>
              <option value="">—</option>
              {teachers.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Тип занятия">
            <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
              {Object.entries(LESSON_TYPE).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="День">
            <Select value={form.dayOfWeek} onChange={(e) => set('dayOfWeek', e.target.value)}>
              {DAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Пара №">
            <Select value={form.pairNumber} onChange={(e) => setForm((f) => ({ ...f, pairNumber: e.target.value, startTime: '', endTime: '' }))}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Начало">
            <Input type="time" value={form.startTime} placeholder={std?.[0]} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
          <Field label="Конец">
            <Input type="time" value={form.endTime} placeholder={std?.[1]} onChange={(e) => set('endTime', e.target.value)} />
          </Field>
        </div>
        {std && !form.startTime && <p className="-mt-2 text-xs text-muted">Пустое время — по сетке звонков: {std[0]}–{std[1]}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Аудитория">
            <Input value={form.room} onChange={(e) => set('room', e.target.value)} required />
          </Field>
          <Field label="Неделя">
            <Select value={form.weekParity} onChange={(e) => set('weekParity', e.target.value)}>
              {Object.entries(PARITY).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
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

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(true);
  const imp = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('file', file!);
      fd.append('replace', String(replace));
      return (await api.post<{ imported: number }>('/admin/schedule/import', fd)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'schedule'] });
      qc.invalidateQueries({ queryKey: ['schedule'] });
    },
  });

  return (
    <Modal open title="Импорт расписания из CSV" onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Колонки: <code className="rounded bg-surface-2 px-1">group;day;pair;start;end;subject;type;room;teacher;week</code>. Разделитель «;» или «,».
          Группа и предмет — по названию, преподаватель — по логину. День: пн–сб или 1–6; тип: лекция/практика/лаба; неделя: все/чет/нечет.
          Если время пустое, берётся стандартная сетка звонков.
        </p>
        <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={downloadTemplate}>
          Скачать шаблон
        </Button>
        <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-line px-4 py-6 text-muted hover:border-accent hover:text-accent"
        >
          <Upload className="h-6 w-6" />
          {file ? <span className="font-semibold text-ink">{file.name}</span> : 'Выберите CSV-файл'}
        </button>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Заменить текущее расписание групп из файла
        </label>
        {imp.error && <ErrorBox message={errorMessage(imp.error)} />}
        {imp.data && <div className="rounded border border-ok/30 bg-ok/5 px-4 py-3 text-ok">Импортировано пар: {imp.data.imported}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          <Button disabled={!file} loading={imp.isPending} onClick={() => imp.mutate()}>
            Импортировать
          </Button>
        </div>
      </div>
    </Modal>
  );
}
