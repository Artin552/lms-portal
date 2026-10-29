import request from 'supertest';
import { config } from '../src/config';
import { prisma } from '../src/prisma';
import { app, auth, createFixture, login, PASSWORD, resetDb } from './helpers';

function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('refresh cookie not set');
  return cookie.split(';')[0];
}

describe('Авторизация', () => {
  beforeEach(async () => {
    await resetDb();
    await createFixture();
  });
  afterAll(() => prisma.$disconnect());

  it('входит по логину и выдаёт access-токен и httpOnly refresh-cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ login: 'studentA', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ role: 'STUDENT', group: { name: 'A-1' } });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='));
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('входит по email без учёта регистра', async () => {
    const res = await request(app).post('/api/auth/login').send({ login: 'StudentA@Test.Local', password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('отклоняет неверный пароль и несуществующего пользователя одинаково', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ login: 'studentA', password: 'nope' });
    const missing = await request(app).post('/api/auth/login').send({ login: 'ghost', password: 'nope' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.message).toBe(missing.body.message);
  });

  it('не пускает деактивированного пользователя', async () => {
    await prisma.user.update({ where: { login: 'studentA' }, data: { isActive: false } });
    const res = await request(app).post('/api/auth/login').send({ login: 'studentA', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('/me требует токен', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth('garbage'))).status).toBe(401);
    const token = await login('teacher');
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ login: 'teacher', role: 'TEACHER' });
  });

  it('refresh ротирует токен, а повторное использование старого отзывает все сессии', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ login: 'studentA', password: PASSWORD });
    const first = refreshCookie(loginRes);

    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toEqual(expect.any(String));
    const second = refreshCookie(r1);
    expect(second).not.toBe(first);

    // Старый токен повторно — признак кражи
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(reuse.status).toBe(401);
    // ...и новый тоже перестаёт работать
    const afterReuse = await request(app).post('/api/auth/refresh').set('Cookie', second);
    expect(afterReuse.status).toBe(401);
  });

  it('logout отзывает refresh-export interface CaptchaConfig {
токен', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ login: 'studentA', password: PASSWORD });
    const cookie = refreshCookie(loginRes);
    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('смена пароля проверяет текущий пароль и длину нового', async () => {
    const token = await login('studentA');
    const bad = await request(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'wrong', newPassword: 'newpassword1' });
    expect(bad.status).toBe(400);
    const short = await request(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: PASSWORD, newPassword: '123' });
    expect(short.status).toBe(400);
    const ok = await request(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: PASSWORD, newPassword: 'newpassword1' });
    expect(ok.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ login: 'studentA', password: PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ login: 'studentA', password: 'newpassword1' })).status).toBe(200);
  });

  it('админ-API доступно только администратору', async () => {
    const student = await login('studentA');
    const teacher = await login('teacher');
    const admin = await login('admin');
    expect((await request(app).get('/api/admin/users').set(auth(student))).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(auth(teacher))).status).toBe(403);
    const res = await request(app).get('/api/admin/users').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
  });
});

function stubCaptchaResponse(status: 'ok' | 'failed' | 'network-error') {
  const fetchMock = vi.fn();
  if (status === 'network-error') fetchMock.mockRejectedValue(new Error('network down'));
  else fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status }) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SmartCaptcha', () => {
  beforeEach(async () => {
    await resetDb();
    await createFixture();
    config.captcha.enabled = true;
    config.captcha.sitekey = 'test-sitekey';
    config.captcha.serverKey = 'test-server-key';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    config.captcha.enabled = false;
    config.captcha.sitekey = '';
    config.captcha.serverKey = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('отдает настройки капчи странице входа', async () => {
    expect((await request(app).get('/api/auth/captcha')).body).toEqual({ enabled: true, sitekey: 'test-sitekey' });
    config.captcha.enabled = false;
    expect((await request(app).get('/api/auth/captcha')).body).toEqual({ enabled: false, sitekey: '' });
  });

  it('не пускает без токена капчи и не дергает сервис Яндекса', async () => {
    const fetchMock = stubCaptchaResponse('ok');
    const res = await request(app).post('/api/auth/login').send({ login: 'studentA', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual({ captcha: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('отклоняет вход, если Яндекс не подтвердил токен', async () => {
    stubCaptchaResponse('failed');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ login: 'studentA', password: PASSWORD, captchaToken: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual({ captcha: true });
  });

  it('пускает с валидным токеном и передает IP пользователя', async () => {
    const fetchMock = stubCaptchaResponse('ok');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ login: 'studentA', password: PASSWORD, captchaToken: 'good' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));

    const [url, init] = fetchMock.mock.calls[0];
    const body = init.body as URLSearchParams;
    expect(url).toBe('https://smartcaptcha.cloud.yandex.ru/validate');
    expect(body.get('token')).toBe('good');
    expect(body.get('secret')).toBe('test-server-key');
    expect(body.get('ip')).toBeTruthy();
  });

  it('пускает при недоступности сервиса Яндекса', async () => {
    stubCaptchaResponse('network-error');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ login: 'studentA', password: PASSWORD, captchaToken: 'good' });
    expect(res.status).toBe(200);
  });
});
