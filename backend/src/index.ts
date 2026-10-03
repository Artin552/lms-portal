import http from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { startDeadlineReminderJob } from './jobs/deadlineReminder';
import { prisma } from './prisma';
import { createSocketServer } from './realtime/socket';

const app = createApp();
const server = http.createServer(app);
createSocketServer(server);
const job = startDeadlineReminderJob();

server.listen(config.port, () => {
  console.log(`API запущен на http://localhost:${config.port}`);
});

async function shutdown() {
  clearInterval(job);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
