import type { Server } from 'socket.io';

/**
 * Глобальная ссылка на Socket.IO, чтобы сервисы могли отправлять события
 * без циклических импортов. В тестах сервер сокетов не поднимается — вызовы игнорируются.
 */
let io: Server | null = null;

export function setIo(server: Server | null) {
  io = server;
}

export const userRoom = (userId: number) => `user:${userId}`;
export const chatRoom = (chatId: number) => `chat:${chatId}`;

export function emitToUser(userId: number, event: string, payload: unknown) {
  io?.to(userRoom(userId)).emit(event, payload);
}

export function emitToChat(chatId: number, event: string, payload: unknown) {
  io?.to(chatRoom(chatId)).emit(event, payload);
}

/** Подписать все активные сокеты пользователей на комнату чата (новый чат или новый участник) */
export function joinUsersToChat(userIds: number[], chatId: number) {
  if (!io) return;
  for (const id of userIds) io.in(userRoom(id)).socketsJoin(chatRoom(chatId));
}

export function removeUsersFromChat(userIds: number[], chatId: number) {
  if (!io) return;
  for (const id of userIds) io.in(userRoom(id)).socketsLeave(chatRoom(chatId));
}
