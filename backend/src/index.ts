import http from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { startDeadlineReminderJob } from './jobs/deadlineReminder';
import { prisma } from './prisma';
import { createSocketServer } from './realtime/socket';

const app = createApp();
const server = http.createServer(app);
const io = createSocketServer(server);
const job = startDeadlineReminderJob();

server.listen(config.port, () => {
  console.log(`API запущен на http://localhost:${config.port}`);
});

let stopping = false;

async function shutdown() {
  // Повторный сигнал (Ctrl+C поверх docker stop) не должен запускать остановку заново
  if (stopping) return;
  stopping = true;
  clearInterval(job);
  // Освобождаем сокеты
  io.disconnectSockets(true);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
