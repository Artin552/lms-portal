import type http from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config';
import { verifyAccessToken, type AuthUser } from '../middleware/auth';
import { prisma } from '../prisma';
import { shortName } from '../services/users';
import { chatRoom, setIo, userRoom } from './io';

/**
 * События сервер → клиент:
 *   message:new, message:updated, message:deleted, chat:read, typing,
 *   notification:new, unread:changed
 * События клиент → сервер:
 *   typing { chatId, isTyping }
 * Отправка сообщений идёт через REST (поддержка файлов), рассылка — через сокеты.
 */
export function createSocketServer(httpServer: http.Server) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    maxHttpBufferSize: 1e5,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') return next(new Error('unauthorized'));
    try {
      socket.data.user = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user as AuthUser;
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.isActive) return socket.disconnect(true);
    const name = shortName(dbUser);

    await socket.join(userRoom(user.id));
    const memberships = await prisma.chatMember.findMany({ where: { userId: user.id }, select: { chatId: true } });
    await socket.join(memberships.map((m) => chatRoom(m.chatId)));

    socket.on('typing', (payload: { chatId?: unknown; isTyping?: unknown }) => {
      const chatId = Number(payload?.chatId);
      // Рассылаем только в комнаты, в которых сокет уже состоит (т.е. пользователь — участник чата)
      if (!Number.isInteger(chatId) || !socket.rooms.has(chatRoom(chatId))) return;
      socket.to(chatRoom(chatId)).emit('typing', { chatId, userId: user.id, name, isTyping: payload?.isTyping !== false });
    });
  });

  setIo(io);
  return io;
}
