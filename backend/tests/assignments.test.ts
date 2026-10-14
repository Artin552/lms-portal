import request from 'supertest';
import { sendDeadlineReminders } from '../src/jobs/deadlineReminder';
import { prisma } from '../src/prisma';
import { app, auth, createFixture, login, resetDb } from './helpers';

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const inDays = (d: number) => new Date(Date.now() + d * 24 * 3600 * 1000).toISOString();

describe('Задания', () => {
  let fx: Fixture;
  let teacher: string;
  let otherTeacher: string;
  let studentA: string;
  let studentB: string;

  beforeEach(async () => {
    await resetDb();
    fx = await createFixture();
    [teacher, otherTeacher, studentA, studentB] = await Promise.all([
      login('teacher'),
      login('teacher2'),
      login('studentA'),
      login('studentB'),
    ]);
  });
  afterAll(() => prisma.$disconnect());

  async function createAssignment(overrides: Record<string, string> = {}) {
    const fields = {
      subjectId: String(fx.subject.id),
      groupIds: String(fx.groupA.id),
      title: 'Лабораторная №1',
      description: 'Сделать всё',
      deadline: inDays(3),
      ...overrides,
    };
    const res = await request(app).post('/api/assignments').set(auth(teacher)).field(fields);
    expect(res.status).toBe(201);
    return res.body as { id: number };
  }

  describe('создание', () => {
    it('преподаватель создаёт задание своей группе, студенты получают уведомление', async () => {
      const a = await createAssignment();
      const notes = await prisma.notification.findMany({ where: { userId: fx.studentA.id } });
      expect(notes).toEqual([expect.objectContaining({ type: 'NEW_ASSIGNMENT', link: `/assignments/${a.id}` })]);
      expect(await prisma.notification.count({ where: { userId: fx.studentB.id } })).toBe(0);
    });

    it('нельзя дать задание группе, у которой преподаватель не ведёт предмет', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set(auth(teacher))
        .field('subjectId', String(fx.subject.id))
        .field('groupIds', `${fx.groupA.id},${fx.groupB.id}`)
        .field('title', 'X')
        .field('deadline', inDays(1));
      expect(res.status).toBe(403);
    });

    it('студент не может создавать задания', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set(auth(studentA))
        .send({ subjectId: fx.subject.id, groupIds: [fx.groupA.id], title: 'X', deadline: inDays(1) });
      expect(res.status).toBe(403);
    });

    it('валидирует поля', async () => {
      const res = await request(app)
        .post('/api/assignments')
        .set(auth(teacher))
        .send({ subjectId: fx.subject.id, groupIds: [fx.groupA.id], title: '', deadline: 'завтра' });
      expect(res.status).toBe(400);
      expect(res.body.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['title', 'deadline']));
    });
  });

  describe('доступ студентов', () => {
    it('студент видит задания только своей группы', async () => {
      const a = await createAssignment();
      const listA = await request(app).get('/api/assignments').set(auth(studentA));
      expect(listA.body).toEqual([expect.objectContaining({ id: a.id, status: 'pending', canSubmit: true })]);

      const listB = await request(app).get('/api/assignments').set(auth(studentB));
      expect(listB.body).toEqual([]);
      expect((await request(app).get(`/api/assignments/${a.id}`).set(auth(studentB))).status).toBe(403);
    });

    it('фильтр по статусу', async () => {
      await createAssignment();
      const res = await request(app).get('/api/assignments?status=submitted').set(auth(studentA));
      expect(res.body).toEqual([]);
    });
  });

  describe('сдача и проверка', () => {
    it('полный цикл: сдача → пересдача → оценка → уведомление', async () => {
      const a = await createAssignment();

      const first = await request(app).post(`/api/assignments/${a.id}/submission`).set(auth(studentA)).field('text', 'Ответ v1');
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ status: 'SUBMITTED', attempt: 1 });

      const second = await request(app).post(`/api/assignments/${a.id}/submission`).set(auth(studentA)).field('text', 'Ответ v2');
      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({ text: 'Ответ v2', attempt: 2 });

      const subs = await request(app).get(`/api/assignments/${a.id}/submissions`).set(auth(teacher));
      expect(subs.status).toBe(200);
      expect(subs.body.rows).toHaveLength(1);
      const submissionId = subs.body.rows[0].submission.id;

      // Шкала 2–5 с шагом 0,1: всё остальное отклоняется
      for (const bad of [1.9, 5.1, 4.35, 'отлично', '']) {
        const res = await request(app).patch(`/api/submissions/${submissionId}/grade`).set(auth(teacher)).send({ score: bad });
        expect(res.status, `score=${bad}`).toBe(400);
      }

      // Запятая тоже принимается, значение сохраняется без хвостов плавающей точки
      const graded = await request(app)
        .patch(`/api/submissions/${submissionId}/grade`)
        .set(auth(teacher))
        .send({ score: '4,3', comment: 'Хорошо' });
      expect(graded.status).toBe(200);
      expect(graded.body).toMatchObject({ status: 'GRADED', score: 4.3, teacherComment: 'Хорошо' });

      const note = await prisma.notification.findFirst({ where: { userId: fx.studentA.id, type: 'GRADED' } });
      expect(note?.title).toBe('Оценка: 4,3');

      // Проверенную работу пересдать нельзя
      const again = await request(app).post(`/api/assignments/${a.id}/submission`).set(auth(studentA)).field('text', 'v3');
      expect(again.status).toBe(403);

      const my = await request(app).get('/api/grades/my').set(auth(studentA));
      expect(my.body.subjects).toEqual([expect.objectContaining({ count: 1, average: 4.3 })]);
    });

    it('ведомость считает среднюю оценку студента', async () => {
      const a1 = await createAssignment({ title: 'ЛР1' });
      const a2 = await createAssignment({ title: 'ЛР2' });
      for (const [a, score] of [
        [a1, 4.7],
        [a2, 3.8],
      ] as const) {
        await request(app).post(`/api/assignments/${a.id}/submission`).set(auth(studentA)).field('text', 'ok');
        const sub = await prisma.submission.findFirstOrThrow({ where: { assignmentId: a.id } });
        await request(app).patch(`/api/submissions/${sub.id}/grade`).set(auth(teacher)).send({ score }).expect(200);
      }
      const res = await request(app)
        .get('/api/grades/gradebook')
        .query({ groupId: fx.groupA.id, subjectId: fx.subject.id })
        .set(auth(teacher));
      expect(res.status).toBe(200);
      expect(res.body.rows[0]).toMatchObject({ average: 4.25, gradedCount: 2 });
    });

    it('пустую сдачу не принимает', async () => {
      const a = await createAssignment();
      const res = await request(app).post(`/api/assignments/${a.id}/submission`).set(auth(studentA)).field('text', '   ');
      expect(res.status).toBe(400);
    });

    it('после дедлайна сдать нельзя (статус «просрочено»), но возвращённую работу — можно', async () => {
      const a = await createAssignment();
      await request(app).post(`/api/assignments/${a.id}/submission`).set(auth(studentA)).field('text', 'v1');
      await prisma.assignment.update({ where: { id: a.id }, data: { deadline: new Date(Date.now() - 1000) } });

      const late = await request(app).post(`/api/assignments/${a.id}/submission`).set(auth(studentA)).field('text', 'v2');
      expect(late.status).toBe(403);

      const sub = await prisma.submission.findFirstOrThrow({ where: { assignmentId: a.id } });
      const ret = await request(app)
        .patch(`/api/submissions/${sub.id}/return`)
        .set(auth(teacher))
        .send({ comment: 'Доработайте вывод' });
      expect(ret.status).toBe(200);
      expect(ret.body.status).toBe('RETURNED');

      const fixed = await request(app).post(`/api/assignments/${a.id}/submission`).set(auth(studentA)).field('text', 'v2');
      expect(fixed.status).toBe(200);
      expect(fixed.body.status).toBe('SUBMITTED');
    });

    it('без сдачи после дедлайна статус — overdue', async () => {
      const a = await createAssignment();
      await prisma.assignment.update({ where: { id: a.id }, data: { deadline: new Date(Date.now() - 1000) } });
      const res = await request(app).get(`/api/assignments/${a.id}`).set(auth(studentA));
      expect(res.body).toMatchObject({ status: 'overdue', canSubmit: false });
    });

    it('чужой преподаватель не видит сдачи и не может оценить', async () => {
      const a = await createAssignment();
      await request(app).post(`/api/assignments/${a.id}/submission`).set(auth(studentA)).field('text', 'v1');
      const sub = await prisma.submission.findFirstOrThrow({ where: { assignmentId: a.id } });
      expect((await request(app).get(`/api/assignments/${a.id}/submissions`).set(auth(otherTeacher))).status).toBe(403);
      expect(
        (await request(app).patch(`/api/submissions/${sub.id}/grade`).set(auth(otherTeacher)).send({ score: 3 })).status,
      ).toBe(403);
      expect((await request(app).patch(`/api/submissions/${sub.id}/grade`).set(auth(studentA)).send({ score: 5 })).status).toBe(403);
    });
  });

  describe('файлы', () => {
    it('файл сдачи скачивается по подписанной ссылке, подделанная подпись отклоняется', async () => {
      const a = await createAssignment();
      const res = await request(app)
        .post(`/api/assignments/${a.id}/submission`)
        .set(auth(studentA))
        .attach('files', Buffer.from('print("hi")'), 'отчёт.py');
      expect(res.status).toBe(201);
      const file = res.body.files[0];
      expect(file.fileName).toBe('отчёт.py');

      const dl = await request(app).get(file.url);
      expect(dl.status).toBe(200);
      expect(dl.headers['content-type']).toBe('application/octet-stream');
      expect(dl.headers['content-disposition']).toMatch(/^attachment/);

      const forged = await request(app).get(file.url.replace(/sig=[^&]+/, 'sig=AAAA'));
      expect(forged.status).toBe(403);
    });

    it('запрещённые типы файлов отклоняются', async () => {
      const a = await createAssignment();
      const res = await request(app)
        .post(`/api/assignments/${a.id}/submission`)
        .set(auth(studentA))
        .attach('files', Buffer.from('<script>alert(1)</script>'), 'evil.html');
      expect(res.status).toBe(400);
    });
  });

  describe('напоминания о дедлайне', () => {
    it('за сутки до дедлайна напоминает несдавшим ровно один раз', async () => {
      const a = await createAssignment({ deadline: new Date(Date.now() + 5 * 3600 * 1000).toISOString() });
      expect(await sendDeadlineReminders()).toBe(1);
      await sendDeadlineReminders();
      const reminders = await prisma.notification.findMany({ where: { type: 'DEADLINE_SOON' } });
      expect(reminders).toEqual([expect.objectContaining({ userId: fx.studentA.id, link: `/assignments/${a.id}` })]);
    });
  });
});
