import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/error';
import { adminRouter } from './modules/admin.routes';
import { assignmentsRouter } from './modules/assignments.routes';
import { authRouter } from './modules/auth.routes';
import { chatsRouter } from './modules/chats.routes';
import { dashboardRouter } from './modules/dashboard.routes';
import { filesRouter } from './modules/files.routes';
import { gradesRouter } from './modules/grades.routes';
import { notificationsRouter } from './modules/notifications.routes';
import { scheduleRouter } from './modules/schedule.routes';
import { submissionsRouter } from './modules/submissions.routes';
import { usersRouter } from './modules/users.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/schedule', scheduleRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/grades', gradesRouter);
  app.use('/api/chats', chatsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
