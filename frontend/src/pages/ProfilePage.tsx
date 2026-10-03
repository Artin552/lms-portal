import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, KeyRound, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { api, errorMessage, setAccessToken } from '../api/client';
import type { Profile, SelfUser } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Avatar, Badge, Button, Card, CardHeader, ErrorBox, Field, Input, Loading, PageHeader } from '../components/ui';
import { ROLE } from '../utils/format';

export function ProfilePage() {
  const { setUser } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await api.get<Profile>('/users/me/profile')).data,
  });

  const onUserChange = (u: SelfUser) => {
    setUser(u);
    qc.invalidateQueries({ queryKey: ['profile'] });
  };

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('avatar', file);
      return (await api.post<SelfUser>('/users/me/avatar', fd)).data;
    },
    onSuccess: onUserChange,
  });
  const removeAvatar = useMutation({
    mutationFn: async () => (await api.delete<SelfUser>('/users/me/avatar')).data,
    onSuccess: onUserChange,
  });

  if (isLoading || !data) return <Loading />;

  const rows: [string, React.ReactNode][] = [
    ['Логин', <span className="font-mono text-sm">{data.login}</span>],
    ['Email', data.email],
    ['Роль', ROLE[data.role]],
    ...(data.group ? ([['Группа', data.group.name]] as [string, React.ReactNode][]) : []),
    ...(data.department ? ([['Кафедра', data.department]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Профиль" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center border-b border-line bg-surface-2/40 px-6 py-8 text-center">
            <div className="relative">
              <Avatar name={data.fullName} url={data.avatarUrl} size={96} className="ring-4 ring-surface" />
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="Загрузить фото"
                className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-accent text-on-accent hover:bg-accent/90"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatar.mutate(f);
                  e.target.value = '';
                }}
              />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{data.fullName}</h2>
            <p className="text-sm text-muted">{ROLE[data.role]}</p>
            {data.avatarUrl && (
              <button
                onClick={() => removeAvatar.mutate()}
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-danger"
              >
                <Trash2 className="h-3 w-3" /> Удалить фото
              </button>
            )}
            {(uploadAvatar.error || removeAvatar.error) && (
              <div className="mt-3 w-full">
                <ErrorBox message={errorMessage(uploadAvatar.error ?? removeAvatar.error)} />
              </div>
            )}
          </div>
          <dl className="divide-y divide-line">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-4 px-6 py-3 text-sm">
                <dt className="w-24 shrink-0 text-muted">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          {data.teachings.length > 0 && (
            <div className="border-t border-line px-6 py-4">
              <p className="label">Предметы</p>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(
                  data.teachings.reduce<Record<string, string[]>>((acc, t) => {
                    (acc[t.subject.name] ??= []).push(t.group.name);
                    return acc;
                  }, {}),
                ).map(([subject, groups]) => (
                  <li key={subject} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="mr-1">{subject}</span>
                    {groups.map((g) => (
                      <Badge key={g}>{g}</Badge>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <ChangePassword />
      </div>
    </div>
  );
}

function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', repeat: '' });
  const [done, setDone] = useState(false);
  const mismatch = form.repeat.length > 0 && form.newPassword !== form.repeat;

  const change = useMutation({
    mutationFn: async () =>
      (await api.post<{ accessToken: string }>('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      })).data,
    onSuccess: (res) => {
      setAccessToken(res.accessToken);
      setForm({ currentPassword: '', newPassword: '', repeat: '' });
      setDone(true);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone(false);
    if (!mismatch) change.mutate();
  };

  return (
    <Card className="self-start">
      <CardHeader title="Смена пароля" icon={<KeyRound className="h-4 w-4" />} />
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Текущий пароль">
          <Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
        </Field>
        <Field label="Новый пароль" hint="Не короче 8 символов">
          <Input type="password" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
        </Field>
        <Field label="Повторите новый пароль" error={mismatch ? 'Пароли не совпадают' : undefined}>
          <Input type="password" autoComplete="new-password" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} required />
        </Field>
        {change.error && <ErrorBox message={errorMessage(change.error)} />}
        {done && (
          <div className="rounded border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
            Пароль изменён. На других устройствах потребуется войти заново.
          </div>
        )}
        <Button type="submit" loading={change.isPending} disabled={mismatch}>
          Сменить пароль
        </Button>
      </form>
    </Card>
  );
}
