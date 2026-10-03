import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Role } from '../../api/types';
import { useMe } from '../../auth/AuthContext';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Input, Loading, Modal, Select } from '../../components/ui';
import { ROLE } from '../../utils/format';
import { useGroups, type AdminUser } from './adminApi';

export function UsersTab() {
  const me = useMe();
  const qc = useQueryClient();
  const [role, setRole] = useState<Role | ''>('');
  const [groupId, setGroupId] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const groups = useGroups();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', role, groupId, q],
    queryFn: async () =>
      (await api.get<AdminUser[]>('/admin/users', { params: { role: role || undefined, groupId: groupId || undefined, q: q || undefined } })).data,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
    onError: (e) => alert(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Поиск по ФИО, логину, email" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={role} onChange={(e) => setRole(e.target.value as Role | '')} className="sm:w-44" aria-label="Роль">
          <option value="">Все роли</option>
          <option value="STUDENT">Студенты</option>
          <option value="TEACHER">Преподаватели</option>
          <option value="ADMIN">Администраторы</option>
        </Select>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="sm:w-36" aria-label="Группа">
          <option value="">Все группы</option>
          {groups.data?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Добавить
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <EmptyState title="Пользователи не найдены" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2/60 text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-2.5 font-semibold">ФИО</th>
                  <th className="px-4 py-2.5 font-semibold">Логин</th>
                  <th className="px-4 py-2.5 font-semibold">Роль</th>
                  <th className="px-4 py-2.5 font-semibold">Группа / кафедра</th>
                  <th className="w-24 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className="border-b border-line/70 last:border-0 hover:bg-surface-2/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.fullName} url={u.avatarUrl} size={28} />
                        <span className="font-medium">{u.fullName}</span>
                        {!u.isActive && <Badge tone="danger">заблокирован</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{u.login}</td>
                    <td className="px-4 py-2.5">{ROLE[u.role]}</td>
                    <td className="max-w-[240px] truncate px-4 py-2.5 text-muted">{u.group?.name ?? u.department ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right">
                      <IconButton label="Изменить" onClick={() => setEditing(u)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      {u.id !== me.id && (
                        <IconButton
                          label="Удалить"
                          className="hover:text-danger"
                          onClick={() => confirm(`Удалить пользователя ${u.fullName}? Его сдачи и сообщения тоже будут удалены.`) && remove.mutate(u.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserModal({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const qc = useQueryClient();
  const groups = useGroups();
  const [form, setForm] = useState({
    login: user?.login ?? '',
    email: user?.email ?? '',
    lastName: user?.lastName ?? '',
    firstName: user?.firstName ?? '',
    middleName: user?.middleName ?? '',
    role: (user?.role ?? 'STUDENT') as Role,
    groupId: user?.group?.id ? String(user.group.id) : '',
    department: user?.department ?? '',
    password: '',
    isActive: user?.isActive ?? true,
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        middleName: form.middleName || null,
        groupId: form.groupId ? Number(form.groupId) : null,
        department: form.department || null,
        password: form.password || undefined,
      };
      return user ? api.put(`/admin/users/${user.id}`, body) : api.post('/admin/users', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
  });

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Modal open title={user ? 'Редактирование пользователя' : 'Новый пользователь'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Фамилия">
            <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
          </Field>
          <Field label="Имя">
            <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
          </Field>
          <Field label="Отчество">
            <Input value={form.middleName} onChange={(e) => set('middleName', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Логин">
            <Input value={form.login} onChange={(e) => set('login', e.target.value)} required pattern="[a-zA-Z0-9._\-]{3,50}" title="Латиница, цифры, . _ -" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Роль">
            <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
              <option value="STUDENT">Студент</option>
              <option value="TEACHER">Преподаватель</option>
              <option value="ADMIN">Администратор</option>
            </Select>
          </Field>
          {form.role === 'STUDENT' && (
            <Field label="Группа">
              <Select value={form.groupId} onChange={(e) => set('groupId', e.target.value)} required>
                <option value="">Выберите группу</option>
                {groups.data?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {form.role === 'TEACHER' && (
            <Field label="Кафедра">
              <Input value={form.department} onChange={(e) => set('department', e.target.value)} />
            </Field>
          )}
        </div>
        <Field label={user ? 'Новый пароль' : 'Пароль'} hint={user ? 'Оставьте пустым, чтобы не менять' : 'Не короче 8 символов'}>
          <Input type="text" autoComplete="off" value={form.password} onChange={(e) => set('password', e.target.value)} required={!user} minLength={8} />
        </Field>
        {user && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Учётная запись активна
          </label>
        )}
        {save.error && <ErrorBox message={errorMessage(save.error)} />}
        <div className="flex justify-end gap-2 pt-2">
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
