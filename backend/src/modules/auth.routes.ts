import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { currentUser, requireAuth, signAccessToken } from '../middleware/auth';
import { prisma } from '../prisma';
import { selfUser } from '../services/users';
import { badRequest, unauthorized } from '../utils/errors';

export const authRouter = Router();

const REFRESH_COOKIE = 'refresh_token';
const BCRYPT_ROUNDS = 10;
const REUSE_GRACE_MS = Number(process.env.REFRESH_REUSE_GRACE_MS ?? 10_000);

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', BCRYPT_ROUNDS);
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.env === 'test' ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Слишком много попыток входа, попробуйте позже' },
});

async function issueTokens(res: Response, user: { id: number; role: 'STUDENT' | 'TEACHER' | 'ADMIN' }) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 3600 * 1000);
  await prisma.refreshToken.create({ data: { tokenHash: hashToken(refreshToken), userId: user.id, expiresAt } });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/api/auth',
    expires: expiresAt,
  });
  return signAccessToken(user);
}

const loginSchema = z.object({
  login: z.string().trim().min(1, 'Введите логин или email'),
  password: z.string().min(1, 'Введите пароль'),
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { login, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findFirst({
    where: { OR: [{ login }, { email: { equals: login, mode: 'insensitive' } }] },
    include: { group: true },
  });
  // Сравниваем хеш даже для несуществующего пользователя, чтобы не выдавать его наличие по времени ответа
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive) throw unauthorized('Неверный логин или пароль');
  const accessToken = await issueTokens(res, user);
  res.json({ accessToken, user: selfUser(user) });
});

/** Ротация refresh-токена: старый отзывается, выдаётся новая пара */
authRouter.post('/refresh', async (req, res) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized('Нет refresh-токена');
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { group: true } } },
  });
  if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    throw unauthorized('Сессия истекла, войдите снова');
  }
  if (stored.revokedAt) {
    // Только что отозванный токен — скорее всего, параллельное обновление из соседней вкладки
    if (Date.now() - stored.revokedAt.getTime() < REUSE_GRACE_MS) throw unauthorized('Токен уже обновлён');
    // Повторное использование давно отозванного токена — вероятная кража: отзываем все сессии пользователя
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    throw unauthorized('Сессия недействительна, войдите снова');
  }
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const accessToken = await issueTokens(res, stored.user);
  res.json({ accessToken, user: selfUser(stored.user) });
});

authRouter.post('/logout', async (req, res) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: currentUser(req).id }, include: { group: true } });
  if (!user || !user.isActive) throw unauthorized();
  res.json(selfUser(user));
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Пароль должен быть не короче 8 символов').max(128),
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const me = currentUser(req);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest('Текущий пароль указан неверно');
  if (currentPassword === newPassword) throw badRequest('Новый пароль совпадает с текущим');
  await prisma.$transaction([
    prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(newPassword) } }),
    // Выходим со всех остальных устройств
    prisma.refreshToken.updateMany({ where: { userId: me.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  const accessToken = await issueTokens(res, user);
  res.json({ accessToken });
});
