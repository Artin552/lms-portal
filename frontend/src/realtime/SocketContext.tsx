import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, onTokenChange, refreshAccessToken } from '../api/client';
import type { ChatDetails, Message, Notification } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export type MessagesPage = { messages: Message[]; hasMore: boolean };
type Typing = Record<number, Record<number, { name: string; until: number }>>;

interface SocketState {
  connected: boolean;
  typingIn: (chatId: number) => string[];
  sendTyping: (chatId: number, isTyping: boolean) => void;
}

const SocketContext = createContext<SocketState | null>(null);

/** Обновить сообщение во всех загруженных страницах истории чата */
export function patchMessages(qc: QueryClient, chatId: number, fn: (m: Message[], pageIndex: number) => Message[]) {
  qc.setQueryData<InfiniteData<MessagesPage>>(['messages', chatId], (old) =>
    old ? { ...old, pages: old.pages.map((p, i) => ({ ...p, messages: fn(p.messages, i) })) } : old,
  );
}

/** Добавить новое сообщение в конец самой свежей страницы (без дублей) */
export function appendMessage(qc: QueryClient, msg: Message) {
  patchMessages(qc, msg.chatId, (list, i) =>
    i === 0 && !list.some((m) => m.id === msg.id) ? [...list, msg] : list,
  );
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState<Typing>({});

  useEffect(() => {
    if (!user) return;
    const socket = io({ auth: { token: getAccessToken() }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const offToken = onTokenChange((token) => {
      socket.auth = { token };
    });

    let wasConnected = false;
    socket.on('connect', () => {
      setConnected(true);
      // После переподключения догружаем то, что пришло, пока связи не было
      if (wasConnected) {
        qc.invalidateQueries({ queryKey: ['messages'] });
        qc.invalidateQueries({ queryKey: ['chats'] });
        qc.invalidateQueries({ queryKey: ['notifications'] });
      }
      wasConnected = true;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', async (err) => {
      if (err.message === 'unauthorized') {
        const token = await refreshAccessToken();
        if (token) {
          socket.auth = { token };
          socket.connect();
        }
      }
    });

    socket.on('notification:new', (n: Notification) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (n.type !== 'NEW_MESSAGE') {
        qc.invalidateQueries({ queryKey: ['assignments'] });
        qc.invalidateQueries({ queryKey: ['assignment'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        qc.invalidateQueries({ queryKey: ['grades'] });
      }
    });

    socket.on('message:new', (msg: Message) => {
      appendMessage(qc, msg);
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['unread'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      // Автор перестаёт «печатать», как только сообщение пришло
      setTyping((t) => {
        if (!t[msg.chatId]?.[msg.sender.id]) return t;
        const chat = { ...t[msg.chatId] };
        delete chat[msg.sender.id];
        return { ...t, [msg.chatId]: chat };
      });
    });

    socket.on('message:updated', (msg: Message) => {
      patchMessages(qc, msg.chatId, (list) => list.map((m) => (m.id === msg.id ? msg : m)));
      qc.invalidateQueries({ queryKey: ['chat', msg.chatId] });
    });

    socket.on('message:deleted', ({ chatId, messageId }: { chatId: number; messageId: number }) => {
      patchMessages(qc, chatId, (list) =>
        list.map((m) =>
          m.id === messageId ? { ...m, text: '', attachments: [], pinnedAt: null, deletedAt: new Date().toISOString() } : m,
        ),
      );
      qc.invalidateQueries({ queryKey: ['chat', chatId] });
      qc.invalidateQueries({ queryKey: ['chats'] });
    });

    socket.on('chat:read', ({ chatId, userId, lastReadAt }: { chatId: number; userId: number; lastReadAt: string }) => {
      qc.setQueryData<ChatDetails>(['chat', chatId], (old) =>
        old ? { ...old, members: old.members.map((m) => (m.id === userId ? { ...m, lastReadAt } : m)) } : old,
      );
    });

    socket.on('unread:changed', ({ total }: { total: number }) => {
      qc.setQueryData(['unread'], { total });
      qc.invalidateQueries({ queryKey: ['chats'] });
    });

    socket.on('typing', ({ chatId, userId, name, isTyping }: { chatId: number; userId: number; name: string; isTyping: boolean }) => {
      setTyping((t) => {
        const chat = { ...(t[chatId] ?? {}) };
        if (isTyping) chat[userId] = { name, until: Date.now() + 4000 };
        else delete chat[userId];
        return { ...t, [chatId]: chat };
      });
    });

    return () => {
      offToken();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user, qc]);

  // Индикатор «печатает» гаснет сам, если не пришло продолжение
  useEffect(() => {
    const id = setInterval(() => {
      setTyping((t) => {
        const now = Date.now();
        let changed = false;
        const next: Typing = {};
        for (const [chatId, users] of Object.entries(t)) {
          const alive = Object.fromEntries(Object.entries(users).filter(([, v]) => v.until > now));
          if (Object.keys(alive).length !== Object.keys(users).length) changed = true;
          next[Number(chatId)] = alive;
        }
        return changed ? next : t;
      });
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const typingIn = useCallback((chatId: number) => Object.values(typing[chatId] ?? {}).map((v) => v.name), [typing]);

  const sendTyping = useCallback((chatId: number, isTyping: boolean) => {
    socketRef.current?.emit('typing', { chatId, isTyping });
  }, []);

  return <SocketContext.Provider value={{ connected, typingIn, sendTyping }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket вне SocketProvider');
  return ctx;
}
