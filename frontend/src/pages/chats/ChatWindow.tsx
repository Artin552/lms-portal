import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Check, CheckCheck, Paperclip, Pin, PinOff, SendHorizontal, Trash2, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { ChatDetails, Message } from '../../api/types';
import { useMe } from '../../auth/AuthContext';
import { FileList } from '../../components/files';
import { Avatar, ErrorBox, IconButton, Spinner } from '../../components/ui';
import { appendMessage, useSocket, type MessagesPage } from '../../realtime/SocketContext';
import { fmtDayHeading, fmtSize, plural, ROLE } from '../../utils/format';
import { ChatIcon } from './ChatsPage';

export function ChatWindow({ chatId }: { chatId: number }) {
  const me = useMe();
  const qc = useQueryClient();
  const { typingIn } = useSocket();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);

  const details = useQuery({
    queryKey: ['chat', chatId],
    queryFn: async () => (await api.get<ChatDetails>(`/chats/${chatId}`)).data,
  });

  const history = useInfiniteQuery({
    queryKey: ['messages', chatId],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.get<MessagesPage>(`/chats/${chatId}/messages`, { params: { before: pageParam, limit: 30 } })).data,
    // pages[0] — самые свежие, следующие страницы — всё более старые
    getNextPageParam: (last) => (last.hasMore && last.messages.length ? last.messages[0].id : undefined),
    staleTime: Infinity,
  });

  const messages = useMemo(
    () => (history.data ? [...history.data.pages].reverse().flatMap((p) => p.messages) : []),
    [history.data],
  );
  const lastId = messages[messages.length - 1]?.id;

  // Отмечаем прочитанным при открытии и при каждом новом сообщении, пока вкладка видима
  const markRead = useMutation({
    mutationFn: () => api.post(`/chats/${chatId}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['unread'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const { mutate: markReadMutate } = markRead;
  useEffect(() => {
    if (lastId === undefined && !history.isSuccess) return;
    if (document.visibilityState === 'visible') markReadMutate();
    const onVisible = () => document.visibilityState === 'visible' && markReadMutate();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [lastId, history.isSuccess, markReadMutate]);

  // Скролл: вниз при открытии и новых сообщениях (если пользователь внизу); сохранение позиции при подгрузке старых
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, lastId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120 && history.hasNextPage && !history.isFetchingNextPage) {
      prevHeight.current = el.scrollHeight;
      history.fetchNextPage();
    }
  };

  const chat = details.data;
  const others = chat?.members.filter((m) => m.id !== me.id) ?? [];
  /** Своё сообщение прочитано, если хотя бы один другой участник прочитал чат позже его отправки */
  const isRead = (m: Message) => others.some((o) => o.lastReadAt && new Date(o.lastReadAt) >= new Date(m.createdAt));
  const typing = typingIn(chatId);

  const [showMembers, setShowMembers] = useState(false);

  if (details.error) return <div className="p-6"><ErrorBox message={errorMessage(details.error)} /></div>;

  return (
    <div className="flex h-full flex-col">
      {/* Шапка */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-4">
        <Link to="/chats" className="rounded p-1.5 text-muted hover:bg-surface-2 md:hidden" aria-label="К списку чатов">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {chat ? (
          <>
            <ChatIcon chat={chat} size={40} />
            <button className="min-w-0 flex-1 text-left" onClick={() => chat.type !== 'DIRECT' && setShowMembers((s) => !s)}>
              <div className="truncate font-semibold">{chat.title}</div>
              <div className="truncate text-xs text-muted">
                {typing.length ? (
                  <span className="text-accent">{typing.join(', ')} {typing.length > 1 ? 'печатают' : 'печатает'}…</span>
                ) : chat.type === 'DIRECT' ? (
                  chat.peer && `${ROLE[chat.peer.role]}${chat.peer.group ? ` · ${chat.peer.group.name}` : ''}`
                ) : (
                  `${chat.membersCount} ${plural(chat.membersCount, ['участник', 'участника', 'участников'])}`
                )}
              </div>
            </button>
          </>
        ) : (
          <Spinner />
        )}
      </div>

      {chat && chat.pinned.length > 0 && <PinnedBar chat={chat} />}

      <div className="flex min-h-0 flex-1">
        {/* Лента */}
        <div ref={scrollRef} onScroll={onScroll} className="paper-grid min-w-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          {history.isFetchingNextPage && (
            <div className="flex justify-center pb-3">
              <Spinner className="h-4 w-4" />
            </div>
          )}
          {!history.hasNextPage && history.isSuccess && (
            <p className="pb-4 text-center text-xs text-muted">{messages.length ? 'Начало переписки' : 'Сообщений пока нет — напишите первым'}</p>
          )}
          {history.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const grouped = !newDay && prev?.sender.id === m.sender.id && +new Date(m.createdAt) - +new Date(prev.createdAt) < 5 * 60_000;
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="my-4 flex justify-center">
                      <span className="rounded-full border border-line bg-surface px-3 py-0.5 text-[11px] font-semibold text-muted">{fmtDayHeading(m.createdAt)}</span>
                    </div>
                  )}
                  <MessageBubble
                    m={m}
                    mine={m.sender.id === me.id}
                    grouped={grouped}
                    showAuthor={chat?.type !== 'DIRECT'}
                    read={m.sender.id === me.id && isRead(m)}
                    canModerate={!!chat?.canModerate}
                    chatId={chatId}
                  />
                </Fragment>
              );
            })
          )}
        </div>

        {showMembers && chat && (
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-line bg-surface lg:block">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm font-semibold">Участники</span>
              <IconButton label="Скрыть" onClick={() => setShowMembers(false)}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <ul className="py-1">
              {chat.members.map((u) => (
                <li key={u.id} className="flex items-center gap-2.5 px-4 py-2">
                  <Avatar name={u.fullName} url={u.avatarUrl} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{u.shortName}</span>
                    {u.role !== 'STUDENT' && <span className="block text-[11px] text-accent">{ROLE[u.role]}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <Composer
        chatId={chatId}
        onSent={(msg) => {
          stickToBottom.current = true;
          appendMessage(qc, msg);
          qc.invalidateQueries({ queryKey: ['chats'] });
        }}
      />
    </div>
  );
}

function PinnedBar({ chat }: { chat: ChatDetails }) {
  const [index, setIndex] = useState(0);
  const qc = useQueryClient();
  const pinned = chat.pinned[index % chat.pinned.length];
  const unpin = useMutation({
    mutationFn: () => api.delete(`/chats/${chat.id}/messages/${pinned.id}/pin`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', chat.id] }),
  });
  return (
    <div className="flex items-center gap-3 border-b border-line bg-accent-soft/40 px-4 py-2">
      <Pin className="h-4 w-4 shrink-0 text-accent" />
      <button className="min-w-0 flex-1 text-left" onClick={() => setIndex((i) => i + 1)} title={chat.pinned.length > 1 ? 'Следующее закреплённое' : undefined}>
        <div className="text-[11px] font-semibold text-accent">
          Закреплено{chat.pinned.length > 1 && ` · ${(index % chat.pinned.length) + 1}/${chat.pinned.length}`} · {pinned.sender.shortName}
        </div>
        <div className="truncate text-sm">{pinned.text || '📎 Вложение'}</div>
      </button>
      {chat.canModerate && (
        <IconButton label="Открепить" onClick={() => unpin.mutate()}>
          <PinOff className="h-4 w-4" />
        </IconButton>
      )}
    </div>
  );
}

function MessageBubble({
  m,
  mine,
  grouped,
  showAuthor,
  read,
  canModerate,
  chatId,
}: {
  m: Message;
  mine: boolean;
  grouped: boolean;
  showAuthor: boolean;
  read: boolean;
  canModerate: boolean;
  chatId: number;
}) {
  const qc = useQueryClient();
  const pin = useMutation({
    mutationFn: () => (m.pinnedAt ? api.delete(`/chats/${chatId}/messages/${m.id}/pin`) : api.post(`/chats/${chatId}/messages/${m.id}/pin`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', chatId] }),
  });
  const remove = useMutation({ mutationFn: () => api.delete(`/chats/${chatId}/messages/${m.id}`) });
  const time = new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (m.deletedAt) {
    return (
      <div className={clsx('flex', mine ? 'justify-end' : 'justify-start pl-10', grouped ? 'mt-0.5' : 'mt-3')}>
        <span className="rounded-lg border border-dashed border-line px-3 py-1.5 text-xs italic text-muted">Сообщение удалено</span>
      </div>
    );
  }

  const images = m.attachments.filter((a) => a.isImage);
  const docs = m.attachments.filter((a) => !a.isImage);
  const canDelete = mine || canModerate;

  return (
    <div className={clsx('group flex items-end gap-2', mine ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-3')}>
      {!mine && <div className="w-8 shrink-0">{!grouped && <Avatar name={m.sender.fullName} url={m.sender.avatarUrl} size={32} />}</div>}

      {/* Действия появляются при наведении (на тач-устройствах — всегда видны слабо) */}
      {mine && (canModerate || canDelete) && <Actions />}

      <div
        className={clsx(
          'max-w-[min(78%,560px)] rounded-2xl px-3.5 py-2 shadow-[0_1px_0_rgb(0_0_0/0.04)]',
          mine ? 'rounded-br-md bg-accent text-on-accent' : 'rounded-bl-md border border-line bg-surface',
          m.pinnedAt && 'ring-2 ring-accent/40',
        )}
      >
        {showAuthor && !mine && !grouped && (
          <div className="mb-0.5 text-xs font-semibold text-accent">
            {m.sender.shortName}
            {m.sender.role === 'TEACHER' && <span className="ml-1.5 font-normal text-muted">преподаватель</span>}
          </div>
        )}
        {images.length > 0 && (
          <div className={clsx('mb-1 grid gap-1', images.length > 1 && 'grid-cols-2')}>
            {images.map((img) => (
              <a key={img.id} href={img.url} target="_blank" rel="noreferrer">
                <img src={img.url} alt={img.fileName} loading="lazy" className="max-h-72 w-full rounded-lg object-cover" />
              </a>
            ))}
          </div>
        )}
        {docs.length > 0 && (
          <div className={clsx('mb-1', mine && '[&_a]:text-on-accent [&_li]:border-white/25 [&_li]:bg-white/10 [&_span]:!text-on-accent/80 [&_svg]:!text-on-accent/80')}>
            <FileList files={docs} compact />
          </div>
        )}
        {m.text && <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug">{m.text}</p>}
        <div className={clsx('mt-0.5 flex items-center justify-end gap-1 text-[10.5px]', mine ? 'text-on-accent/75' : 'text-muted')}>
          {m.pinnedAt && <Pin className="h-3 w-3" />}
          {time}
          {mine && (read ? <CheckCheck className="h-3.5 w-3.5" aria-label="Прочитано" /> : <Check className="h-3.5 w-3.5" aria-label="Отправлено" />)}
        </div>
      </div>

      {!mine && (canModerate || canDelete) && <Actions />}
    </div>
  );

  function Actions() {
    return (
      <div className="flex shrink-0 gap-0.5 self-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60">
        {canModerate && (
          <IconButton label={m.pinnedAt ? 'Открепить' : 'Закрепить'} className="h-7 w-7" onClick={() => pin.mutate()}>
            {m.pinnedAt ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </IconButton>
        )}
        {canDelete && (
          <IconButton label="Удалить" className="h-7 w-7 hover:text-danger" onClick={() => confirm('Удалить сообщение?') && remove.mutate()}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </div>
    );
  }
}

function Composer({ chatId, onSent }: { chatId: number; onSent: (m: Message) => void }) {
  const { sendTyping } = useSocket();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const typingSent = useRef(0);

  const send = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('text', text);
      files.forEach((f) => fd.append('files', f));
      return (await api.post<Message>(`/chats/${chatId}/messages`, fd)).data;
    },
    onSuccess: (msg) => {
      setText('');
      setFiles([]);
      sendTyping(chatId, false);
      typingSent.current = 0;
      onSent(msg);
      taRef.current?.focus();
    },
  });

  // Сигнал «печатает» не чаще раза в 2.5 секунды
  const onType = useCallback(
    (v: string) => {
      setText(v);
      const now = Date.now();
      if (v && now - typingSent.current > 2500) {
        sendTyping(chatId, true);
        typingSent.current = now;
      }
    },
    [chatId, sendTyping],
  );

  // Автовысота поля ввода
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  const canSend = (text.trim() || files.length) && !send.isPending;
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) send.mutate();
    }
  };

  return (
    <div className="shrink-0 border-t border-line bg-surface px-3 py-2.5 sm:px-4">
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded border border-line bg-surface-2 py-1 pl-2 pr-1 text-xs">
              {f.type.startsWith('image/') ? (
                <img src={URL.createObjectURL(f)} alt="" className="h-8 w-8 rounded object-cover" onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)} />
              ) : (
                <Paperclip className="h-3.5 w-3.5 text-muted" />
              )}
              <span className="max-w-[160px] truncate">{f.name}</span>
              <span className="text-muted">{fmtSize(f.size)}</span>
              <button aria-label={`Убрать ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded p-0.5 text-muted hover:text-danger">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {send.error && (
        <div className="mb-2">
          <ErrorBox message={errorMessage(send.error)} />
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            setFiles([...files, ...Array.from(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <IconButton label="Прикрепить файл" onClick={() => fileRef.current?.click()} className="h-10 w-10">
          <Paperclip className="h-5 w-5" />
        </IconButton>
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData.files);
            if (pasted.length) {
              e.preventDefault();
              setFiles((fs) => [...fs, ...pasted]);
            }
          }}
          placeholder="Сообщение…"
          aria-label="Текст сообщения"
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-2xl border border-line bg-bg px-4 py-2 text-sm leading-6 placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <button
          onClick={() => send.mutate()}
          disabled={!canSend}
          aria-label="Отправить"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-opacity hover:bg-accent/90 disabled:opacity-40"
        >
          {send.isPending ? <Spinner className="h-4 w-4 text-on-accent" /> : <SendHorizontal className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
