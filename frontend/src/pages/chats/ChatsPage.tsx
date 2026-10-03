import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookOpen, MessagesSquare, PenSquare, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { ChatListItem, PublicUser } from '../../api/types';
import { useMe } from '../../auth/AuthContext';
import { Avatar, EmptyState, IconButton, Input, Modal, Spinner } from '../../components/ui';
import { fmtMessageTime, ROLE } from '../../utils/format';
import { ChatWindow } from './ChatWindow';

export function ChatsPage() {
  const { chatId } = useParams();
  const activeId = chatId ? Number(chatId) : null;
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['chats'],
    queryFn: async () => (await api.get<ChatListItem[]>('/chats')).data,
  });
  const list = (data ?? []).filter((c) => c.title.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] bg-surface">
      {/* Список чатов: на телефоне скрыт, если открыт диалог */}
      <aside className={clsx('flex w-full shrink-0 flex-col border-r border-line md:w-80 lg:w-[340px]', activeId && 'hidden md:flex')}>
        <div className="flex items-center gap-2 border-b border-line p-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Поиск чатов" className="h-9 pl-9" />
          </div>
          <IconButton label="Новое сообщение" onClick={() => setNewOpen(true)} className="border border-line">
            <PenSquare className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !list.length ? (
            <EmptyState icon={<MessagesSquare />} title="Чатов нет" text="Начните диалог с преподавателем или одногруппником" />
          ) : (
            <ul>
              {list.map((c) => (
                <ChatRow key={c.id} chat={c} active={c.id === activeId} />
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className={clsx('min-w-0 flex-1', !activeId && 'hidden md:flex')}>
        {activeId ? (
          <ChatWindow key={activeId} chatId={activeId} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={<MessagesSquare />} title="Выберите чат" text="Сообщения приходят в реальном времени" />
          </div>
        )}
      </section>

      <NewChatModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function ChatIcon({ chat, size = 44 }: { chat: Pick<ChatListItem, 'type' | 'title' | 'peer'>; size?: number }) {
  if (chat.type === 'DIRECT') return <Avatar name={chat.title} url={chat.peer?.avatarUrl} size={size} />;
  return (
    <span
      className={clsx('flex shrink-0 items-center justify-center rounded-full', chat.type === 'GROUP' ? 'bg-accent text-on-accent' : 'bg-ink text-bg')}
      style={{ width: size, height: size }}
    >
      {chat.type === 'GROUP' ? <Users className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
    </span>
  );
}
export { ChatIcon };

function ChatRow({ chat, active }: { chat: ChatListItem; active: boolean }) {
  const me = useMe();
  const navigate = useNavigate();
  const last = chat.lastMessage;
  const preview = last
    ? `${last.sender.id === me.id ? 'Вы: ' : chat.type !== 'DIRECT' ? `${last.sender.shortName}: ` : ''}${last.text || (last.attachments.length ? '📎 Вложение' : '')}`
    : 'Сообщений пока нет';
  return (
    <li>
      <button
        onClick={() => navigate(`/chats/${chat.id}`)}
        className={clsx(
          'flex w-full items-center gap-3 border-b border-line/50 px-3 py-3 text-left transition-colors',
          active ? 'bg-accent-soft/50' : 'hover:bg-surface-2/60',
        )}
      >
        <ChatIcon chat={chat} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={clsx('flex-1 truncate text-sm', chat.unread ? 'font-bold' : 'font-semibold')}>{chat.title}</span>
            {last && <span className="shrink-0 text-[11px] text-muted">{fmtMessageTime(last.createdAt)}</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={clsx('flex-1 truncate text-xs', chat.unread ? 'text-ink' : 'text-muted')}>{preview}</span>
            {chat.unread > 0 && (
              <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-on-accent tabular">{chat.unread}</span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function NewChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { data, isFetching } = useQuery({
    queryKey: ['user-search', q],
    queryFn: async () => (await api.get<PublicUser[]>('/users/search', { params: { q } })).data,
    enabled: open,
  });
  const start = useMutation({
    mutationFn: async (userId: number) => (await api.post<{ id: number }>('/chats/direct', { userId })).data,
    onSuccess: ({ id }) => {
      onClose();
      setQ('');
      navigate(`/chats/${id}`);
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Новое сообщение">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ФИО или группа" className="pl-9" />
      </div>
      <div className="-mx-5 max-h-[50vh] overflow-y-auto">
        {isFetching && !data ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : !data?.length ? (
          <p className="px-5 py-6 text-center text-sm text-muted">Никого не нашли</p>
        ) : (
          <ul>
            {data.map((u) => (
              <li key={u.id}>
                <button
                  disabled={start.isPending}
                  onClick={() => start.mutate(u.id)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-2"
                >
                  <Avatar name={u.fullName} url={u.avatarUrl} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{u.fullName}</span>
                    <span className="block truncate text-xs text-muted">
                      {ROLE[u.role]}
                      {u.group && ` · ${u.group.name}`}
                      {u.department && ` · ${u.department}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
