import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { syncGroupChats } from '../src/services/chatSync';

export const app = createApp();
export const PASSWORD = 'password123';

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

/**
 * Минимальный набор: две группы, предмет, два преподавателя (второй у групп ничего не ведёт),
 * по студенту в каждой группе и администратор.
 */
export async function createFixture() {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const groupA = await prisma.group.create({ data: { name: 'A-1' } });
  const groupB = await prisma.group.create({ data: { name: 'B-1' } });
  const subject = await prisma.subject.create({ data: { name: 'Тестология' } });
  const mk = (login: string, role: 'STUDENT' | 'TEACHER' | 'ADMIN', groupId?: number) =>
    prisma.user.create({
      data: { login, email: `${login}@test.local`, passwordHash, role, lastName: login, firstName: 'Тест', groupId },
    });
  const admin = await mk('admin', 'ADMIN');
  const teacher = await mk('teacher', 'TEACHER');
  const otherTeacher = await mk('teacher2', 'TEACHER');
  const studentA = await mk('studentA', 'STUDENT', groupA.id);
  const studentB = await mk('studentB', 'STUDENT', groupB.id);
  await prisma.teaching.create({ data: { teacherId: teacher.id, subjectId: subject.id, groupId: groupA.id } });
  await syncGroupChats(groupA.id);
  await syncGroupChats(groupB.id);
  return { groupA, groupB, subject, admin, teacher, otherTeacher, studentA, studentB };
}

export async function login(loginName: string, password = PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ login: loginName, password });
  if (res.status !== 200) throw new Error(`login ${loginName} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
