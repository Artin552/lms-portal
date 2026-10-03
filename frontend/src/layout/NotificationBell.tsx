import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, CalendarClock, CheckCheck, FilePlus2, MessageSquare, RotateCcw, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Notification } from '../api/types';
import { EmptyState, IconButton, Spinner } from '../components/ui';
import { fmtRelative } from '../utils/format';

const ICONS: Record<Notification['type'], JSX.Element> = {
  NEW_ASSIGNMENT: <FilePlus2 className="h-4 w-4 text-info" />,
  DEADLINE_SOON: <CalendarClock className="h-4 w-4 text-warn" />,
  GRADED: <Star className="h-4 w-4 text-ok" />,
  RETURNED: <RotateCcw className="h-4 w-4 text-warn" />,
  NEW_MESSAGE: <MessageSquare className="h-4 w-4 text-accent" />,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<{ items: Notification[]; unread: number }>('/notifications')).data,
    refetchInterval: 120_000,
  });

  const readOne = useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = data?.unread ?? 0;

  return (
    <div className="relative" ref={ref}>
      <IconButton label={unread ? `Уведомления: ${unread} новых` : 'Уведомления'} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent tabular">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </IconButton>

      {open && (
        <div className="fixed inset-x-2 top-16 z-40 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Уведомления</span>
            {unread > 0 && (
              <button onClick={() => readAll.mutate()} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Прочитать все
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : !data?.items.length ? (
              <EmptyState icon={<Bell />} title="Пока тихо" text="Здесь появятся новые задания, оценки и сообщения" />
            ) : (
              <ul>
                {data.items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => {
                        if (!n.readAt) readOne.mutate(n.id);
                        setOpen(false);
                        if (n.link) navigate(n.link);
                      }}
                      className={clsx(
                        'flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors hover:bg-surface-2',
                        !n.readAt && 'bg-accent-soft/30',
                      )}
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2">{ICONS[n.type]}</span>
                      <span className="min-w-0 flex-1">
                        <span className={clsx('block text-sm', !n.readAt && 'font-semibold')}>{n.title}</span>
                        {n.body && <span className="mt-0.5 block truncate text-xs text-muted">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-muted">{fmtRelative(n.createdAt)}</span>
                      </span>
                      {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Не прочитано" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
