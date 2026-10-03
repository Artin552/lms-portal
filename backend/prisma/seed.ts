/**
 * Тестовые данные. Запуск: `npm run seed` (пропускается, если в БД уже есть пользователи)
 * или `npm run seed -- --force` (полностью очищает БД и заполняет заново).
 *
 * Тестовые логины:
 *   admin   / admin123    — администратор
 *   teacher / teacher123  — преподаватель
 *   student / student123  — студент
 */
import type { LessonType, WeekParity } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma';
import { syncGroupChats, getOrCreateDirectChat } from '../src/services/chatSync';
import { PAIR_TIMES } from '../src/services/scheduleImport';
import { storage } from '../src/storage/storage';

const force = process.argv.includes('--force') || process.env.SEED_FORCE === 'true';

const hours = (h: number) => new Date(Date.now() + h * 3600 * 1000);
const days = (d: number) => hours(d * 24);

async function reset() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}

const STUDENT_NAMES: [string, string, string][] = [
  ['Алексеев', 'Никита', 'Андреевич'], ['Белова', 'Анастасия', 'Игоревна'], ['Волков', 'Даниил', 'Сергеевич'],
  ['Григорьева', 'Полина', 'Алексеевна'], ['Дмитриев', 'Артём', 'Олегович'], ['Егорова', 'Виктория', 'Павловна'],
  ['Жуков', 'Максим', 'Романович'], ['Зайцева', 'Софья', 'Дмитриевна'], ['Ильин', 'Кирилл', 'Евгеньевич'],
  ['Козлова', 'Дарья', 'Николаевна'], ['Лебедев', 'Иван', 'Михайлович'], ['Морозова', 'Алиса', 'Владимировна'],
  ['Новиков', 'Егор', 'Александрович'], ['Осипова', 'Мария', 'Константиновна'], ['Павлов', 'Матвей', 'Ильич'],
  ['Романова', 'Ксения', 'Юрьевна'], ['Соколов', 'Тимофей', 'Викторович'], ['Тихонова', 'Ева', 'Артёмовна'],
  ['Фёдоров', 'Лев', 'Андреевич'], ['Чернова', 'Ульяна', 'Сергеевна'],
];

async function main() {
  const existing = await prisma.user.count();
  if (existing && !force) {
    console.log('В базе уже есть данные — seed пропущен (используйте --force для пересоздания).');
    return;
  }
  await reset();
  console.log('Заполняю базу тестовыми данными…');

  const hash = (p: string) => bcrypt.hash(p, 10);
  const [adminHash, teacherHash, studentHash] = await Promise.all([hash('admin123'), hash('teacher123'), hash('student123')]);

  // ── Группы и предметы
  const pgs = await prisma.group.create({ data: { name: 'ПГС-31', course: 3 } });
  const ist = await prisma.group.create({ data: { name: 'ИСТ-31', course: 3 } });

  const subj = {
    mech: await prisma.subject.create({ data: { name: 'Строительная механика', shortName: 'Строймех' } }),
    math: await prisma.subject.create({ data: { name: 'Высшая математика', shortName: 'Вышмат' } }),
    prog: await prisma.subject.create({ data: { name: 'Информатика и программирование', shortName: 'Информатика' } }),
    graph: await prisma.subject.create({ data: { name: 'Инженерная графика', shortName: 'Инж. графика' } }),
    eng: await prisma.subject.create({ data: { name: 'Иностранный язык (английский)', shortName: 'Английский' } }),
  };

  // ── Пользователи
  await prisma.user.create({
    data: { login: 'admin', email: 'admin@portal.local', passwordHash: adminHash, role: 'ADMIN', lastName: 'Администраторов', firstName: 'Сергей', middleName: 'Петрович' },
  });
  const t1 = await prisma.user.create({
    data: { login: 'teacher', email: 'smirnova@portal.local', passwordHash: teacherHash, role: 'TEACHER', lastName: 'Смирнова', firstName: 'Елена', middleName: 'Викторовна', department: 'Кафедра информационных систем и технологий' },
  });
  const t2 = await prisma.user.create({
    data: { login: 'teacher2', email: 'kuznetsov@portal.local', passwordHash: teacherHash, role: 'TEACHER', lastName: 'Кузнецов', firstName: 'Андрей', middleName: 'Павлович', department: 'Кафедра строительной механики' },
  });
  const t3 = await prisma.user.create({
    data: { login: 'teacher3', email: 'orlova@portal.local', passwordHash: teacherHash, role: 'TEACHER', lastName: 'Орлова', firstName: 'Мария', middleName: 'Сергеевна', department: 'Кафедра иностранных языков' },
  });

  const students = [];
  for (let i = 0; i < STUDENT_NAMES.length; i++) {
    const [lastName, firstName, middleName] = STUDENT_NAMES[i];
    const n = String(i + 1).padStart(2, '0');
    students.push(
      await prisma.user.create({
        data: {
          login: i === 0 ? 'student' : `student${n}`,
          email: `student${n}@portal.local`,
          passwordHash: studentHash,
          role: 'STUDENT',
          lastName,
          firstName,
          middleName,
          groupId: i < 10 ? ist.id : pgs.id,
        },
      }),
    );
  }
  const istStudents = students.slice(0, 10);
  const pgsStudents = students.slice(10);

  // ── Кто что ведёт
  const teachings: [number, number, number][] = [
    [t1.id, subj.prog.id, ist.id], [t1.id, subj.prog.id, pgs.id],
    [t1.id, subj.math.id, ist.id], [t2.id, subj.math.id, pgs.id],
    [t2.id, subj.mech.id, pgs.id],
    [t2.id, subj.graph.id, ist.id], [t2.id, subj.graph.id, pgs.id],
    [t3.id, subj.eng.id, ist.id], [t3.id, subj.eng.id, pgs.id],
  ];
  await prisma.teaching.createMany({ data: teachings.map(([teacherId, subjectId, groupId]) => ({ teacherId, subjectId, groupId })) });

  // ── Расписание: [день, пара, предмет, тип, аудитория, преподаватель, неделя]
  type Row = [number, number, number, LessonType, string, number, WeekParity];
  const istRows: Row[] = [
    [1, 1, subj.math.id, 'LECTURE', '301', t1.id, 'ALL'],
    [1, 2, subj.prog.id, 'LECTURE', '415', t1.id, 'ALL'],
    [1, 3, subj.eng.id, 'PRACTICE', '210', t3.id, 'ALL'],
    [2, 2, subj.graph.id, 'LECTURE', '118', t2.id, 'ODD'],
    [2, 2, subj.graph.id, 'PRACTICE', '120', t2.id, 'EVEN'],
    [2, 3, subj.prog.id, 'LAB', '412', t1.id, 'ALL'],
    [3, 1, subj.math.id, 'PRACTICE', '305', t1.id, 'ALL'],
    [3, 2, subj.eng.id, 'PRACTICE', '210', t3.id, 'ODD'],
    [4, 3, subj.prog.id, 'LAB', '412', t1.id, 'EVEN'],
    [4, 4, subj.graph.id, 'PRACTICE', '120', t2.id, 'ALL'],
    [5, 1, subj.math.id, 'PRACTICE', '305', t1.id, 'ODD'],
    [5, 2, subj.prog.id, 'PRACTICE', '414', t1.id, 'ALL'],
  ];
  const pgsRows: Row[] = [
    [1, 1, subj.mech.id, 'LECTURE', '201', t2.id, 'ALL'],
    [1, 2, subj.eng.id, 'PRACTICE', '212', t3.id, 'ALL'],
    [1, 3, subj.math.id, 'LECTURE', '302', t2.id, 'ODD'],
    [2, 1, subj.prog.id, 'LECTURE', '415', t1.id, 'ALL'],
    [2, 3, subj.graph.id, 'PRACTICE', '120', t2.id, 'ALL'],
    [3, 2, subj.mech.id, 'PRACTICE', '203', t2.id, 'ALL'],
    [3, 3, subj.prog.id, 'LAB', '412', t1.id, 'ODD'],
    [3, 3, subj.math.id, 'PRACTICE', '306', t2.id, 'EVEN'],
    [4, 1, subj.eng.id, 'PRACTICE', '212', t3.id, 'ALL'],
    [4, 2, subj.mech.id, 'LAB', 'Лаб-2', t2.id, 'EVEN'],
    [5, 2, subj.math.id, 'PRACTICE', '306', t2.id, 'ALL'],
    [5, 3, subj.graph.id, 'LECTURE', '118', t2.id, 'ODD'],
    [6, 1, subj.prog.id, 'LAB', '412', t1.id, 'ALL'],
  ];
  const toEntry = (groupId: number) => ([dayOfWeek, pairNumber, subjectId, type, room, teacherId, weekParity]: Row) => ({
    groupId, dayOfWeek, pairNumber, subjectId, type, room, teacherId, weekParity,
    startTime: PAIR_TIMES[pairNumber][0], endTime: PAIR_TIMES[pairNumber][1],
  });
  await prisma.scheduleEntry.createMany({ data: [...istRows.map(toEntry(ist.id)), ...pgsRows.map(toEntry(pgs.id))] });

  // ── Чаты групп и предметов создаются автоматически
  await syncGroupChats(ist.id);
  await syncGroupChats(pgs.id);

  // ── Задания
  const a1 = await prisma.assignment.create({
    data: {
      subjectId: subj.prog.id, teacherId: t1.id, title: 'Лабораторная №1. Алгоритмы сортировки',
      description: 'Реализуйте сортировку вставками и быструю сортировку на Python.\nСравните время работы на массивах из 10³, 10⁴ и 10⁵ элементов, постройте график.\n\nОтчёт — PDF или ссылка на репозиторий.',
      deadline: days(-5), maxScore: 10,
      groups: { create: [{ groupId: ist.id }, { groupId: pgs.id }] },
    },
  });
  const a2 = await prisma.assignment.create({
    data: {
      subjectId: subj.prog.id, teacherId: t1.id, title: 'Лабораторная №2. Работа с файлами',
      description: 'Напишите программу, которая читает CSV с оценками студентов и выводит средний балл по каждому предмету.',
      deadline: hours(20), maxScore: 10,
      groups: { create: [{ groupId: ist.id }, { groupId: pgs.id }] },
    },
  });
  const a3 = await prisma.assignment.create({
    data: {
      subjectId: subj.math.id, teacherId: t1.id, title: 'ИДЗ: пределы и производные',
      description: 'Вариант = номер в списке группы. Решения оформить от руки, отсканировать в один PDF.',
      deadline: days(6), maxScore: 20,
      groups: { create: [{ groupId: ist.id }] },
    },
  });
  const a4 = await prisma.assignment.create({
    data: {
      subjectId: subj.eng.id, teacherId: t3.id, title: 'Essay: My future profession',
      description: 'Write an essay (200–250 words) about your future profession. Use at least 10 words from Unit 3.',
      deadline: days(3), maxScore: 5,
      groups: { create: [{ groupId: ist.id }, { groupId: pgs.id }] },
    },
  });
  const a5 = await prisma.assignment.create({
    data: {
      subjectId: subj.mech.id, teacherId: t2.id, title: 'РГР №1. Расчёт статически определимой балки',
      description: 'Построить эпюры Q и M для балки по своему варианту. Шаблон оформления — во вложении.',
      deadline: days(10), maxScore: 30,
      groups: { create: [{ groupId: pgs.id }] },
    },
  });
  const template = Buffer.from('Шаблон оформления РГР\n\n1. Исходные данные\n2. Расчётная схема\n3. Эпюры Q и M\n4. Выводы\n', 'utf8');
  await prisma.attachment.create({
    data: {
      storageKey: await storage.put(template, 'template.txt'),
      fileName: 'Шаблон РГР.txt', mimeType: 'text/plain', size: template.length,
      uploadedById: t2.id, assignmentId: a5.id,
    },
  });

  // ── Сдачи: по ЛР №1 почти все сдали и проверены
  for (const [i, st] of [...istStudents, ...pgsStudents].entries()) {
    if (i % 7 === 6) continue; // кто-то не сдал
    const graded = i % 5 !== 4;
    await prisma.submission.create({
      data: {
        assignmentId: a1.id, studentId: st.id,
        text: 'Отчёт и код: https://git.example.edu/' + st.login + '/lab1',
        status: graded ? 'GRADED' : 'SUBMITTED',
        score: graded ? 6 + (i % 5) : null,
        teacherComment: graded ? (i % 5 === 3 ? 'Отличная работа, хороший анализ.' : 'Принято.') : null,
        submittedAt: days(-6), gradedAt: graded ? days(-3) : null,
      },
    });
  }
  // Главный тестовый студент: эссе возвращено на доработку, ЛР2 ещё не сдана
  await prisma.submission.create({
    data: {
      assignmentId: a4.id, studentId: istStudents[0].id, text: 'My future profession is a software engineer…',
      status: 'RETURNED', teacherComment: 'Too short — please add 50+ words and use vocabulary from Unit 3.',
      submittedAt: days(-1), gradedAt: hours(-5),
    },
  });
  for (const st of istStudents.slice(1, 5)) {
    await prisma.submission.create({ data: { assignmentId: a2.id, studentId: st.id, text: 'Решение в приложенном архиве (см. репозиторий).' } });
  }
  void a3;

  // ── Сообщения
  const istChat = await prisma.chat.findUniqueOrThrow({ where: { key: `group:${ist.id}` } });
  const progChat = await prisma.chat.findUniqueOrThrow({ where: { key: `subject:${subj.prog.id}:${ist.id}` } });
  const msgs: [number, number, string, number][] = [
    [istChat.id, istStudents[1].id, 'Всем привет! Кто знает, во вторник пара по графике в 118 или в 120?', -26],
    [istChat.id, istStudents[2].id, 'На этой неделе нечётная, значит лекция в 118', -25.5],
    [istChat.id, istStudents[0].id, 'Спасибо! И не забудьте, ЛР №2 по информатике до завтра', -3],
    [progChat.id, t1.id, 'Коллеги, напоминаю: ЛР №2 нужно сдать до завтрашнего вечера. Вопросы — сюда.', -24],
    [progChat.id, istStudents[3].id, 'Елена Викторовна, можно использовать pandas?', -23],
    [progChat.id, t1.id, 'Можно, но обязательно напишите и версию на чистом Python через модуль csv.', -22.5],
  ];
  for (const [chatId, senderId, text, h] of msgs) {
    await prisma.message.create({ data: { chatId, senderId, text, createdAt: hours(h) } });
  }
  const pinned = await prisma.message.findFirstOrThrow({ where: { chatId: progChat.id, senderId: t1.id }, orderBy: { id: 'asc' } });
  await prisma.message.update({ where: { id: pinned.id }, data: { pinnedAt: hours(-24), pinnedById: t1.id } });

  const dm = await getOrCreateDirectChat(istStudents[0].id, t1.id);
  await prisma.message.create({ data: { chatId: dm.id, senderId: istStudents[0].id, text: 'Здравствуйте! Можно ли сдать ЛР №1 повторно, чтобы улучшить оценку?', createdAt: hours(-30) } });
  await prisma.message.create({ data: { chatId: dm.id, senderId: t1.id, text: 'Здравствуйте, Никита. ЛР №1 уже закрыта, но за ЛР №2 можно получить дополнительный балл за графики.', createdAt: hours(-2) } });
  // Студент прочитал всё, кроме последнего ответа преподавателя
  await prisma.chatMember.updateMany({ where: { chatId: dm.id, userId: istStudents[0].id }, data: { lastReadAt: hours(-29) } });
  await prisma.chatMember.updateMany({ where: { chatId: dm.id, userId: t1.id }, data: { lastReadAt: hours(-2) } });

  // ── Уведомления для тестового студента
  await prisma.notification.createMany({
    data: [
      { userId: istStudents[0].id, type: 'NEW_ASSIGNMENT', title: `Новое задание: ${a3.title}`, body: subj.math.name, link: `/assignments/${a3.id}`, createdAt: hours(-48) },
      { userId: istStudents[0].id, type: 'GRADED', title: 'Оценка: 6/10', body: `${subj.prog.name} — ${a1.title}`, link: `/assignments/${a1.id}`, createdAt: days(-3), readAt: days(-3) },
      { userId: istStudents[0].id, type: 'RETURNED', title: 'Работа возвращена на доработку', body: `${subj.eng.name} — ${a4.title}`, link: `/assignments/${a4.id}`, createdAt: hours(-5) },
    ],
  });

  console.log('Готово. Тестовые логины: admin/admin123, teacher/teacher123, student/student123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
