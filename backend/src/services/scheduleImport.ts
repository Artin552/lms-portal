import type { LessonType, WeekParity } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { prisma } from '../prisma';

/** Стандартная сетка пар — используется, если время в строке не указано */
export const PAIR_TIMES: Record<number, [string, string]> = {
  1: ['08:30', '10:00'],
  2: ['10:10', '11:40'],
  3: ['12:10', '13:40'],
  4: ['13:50', '15:20'],
  5: ['15:30', '17:00'],
  6: ['17:10', '18:40'],
  7: ['18:50', '20:20'],
};

const DAYS: Record<string, number> = {
  пн: 1, понедельник: 1, mon: 1,
  вт: 2, вторник: 2, tue: 2,
  ср: 3, среда: 3, wed: 3,
  чт: 4, четверг: 4, thu: 4,
  пт: 5, пятница: 5, fri: 5,
  сб: 6, суббота: 6, sat: 6,
};

const TYPES: Record<string, LessonType> = {
  лекция: 'LECTURE', лек: 'LECTURE', lecture: 'LECTURE',
  практика: 'PRACTICE', пр: 'PRACTICE', практ: 'PRACTICE', practice: 'PRACTICE', семинар: 'PRACTICE',
  лаба: 'LAB', лаб: 'LAB', лабораторная: 'LAB', lab: 'LAB',
};

const WEEKS: Record<string, WeekParity> = {
  '': 'ALL', все: 'ALL', всегда: 'ALL', all: 'ALL',
  нечет: 'ODD', нечетная: 'ODD', нечётная: 'ODD', odd: 'ODD', '1': 'ODD',
  чет: 'EVEN', четная: 'EVEN', чётная: 'EVEN', even: 'EVEN', '2': 'EVEN',
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ParsedRow {
  groupId: number;
  subjectId: number;
  teacherId: number;
  dayOfWeek: number;
  pairNumber: number;
  startTime: string;
  endTime: string;
  type: LessonType;
  room: string;
  weekParity: WeekParity;
}

/**
 * Разбор CSV с расписанием. Заголовок обязателен:
 *   group;day;pair;start;end;subject;type;room;teacher;week
 * Разделитель — «;» или «,». teacher — логин преподавателя.
 * Возвращает либо все строки, либо список ошибок (импорт атомарный).
 */
export async function parseScheduleCsv(content: string): Promise<{ rows: ParsedRow[]; errors: string[] }> {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes(';') ? ';' : ',';
  let records: Record<string, string>[];
  try {
    records = parse(content.replace(/^﻿/, ''), {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      delimiter,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (e) {
    return { rows: [], errors: [`Не удалось разобрать CSV: ${(e as Error).message}`] };
  }

  const required = ['group', 'day', 'pair', 'subject', 'type', 'room', 'teacher'];
  const missing = required.filter((c) => !(records[0] && c in records[0]));
  if (records.length && missing.length) return { rows: [], errors: [`Нет колонок: ${missing.join(', ')}`] };

  const [groups, subjects, teachers] = await Promise.all([
    prisma.group.findMany(),
    prisma.subject.findMany(),
    prisma.user.findMany({ where: { role: 'TEACHER' } }),
  ]);
  const groupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]));
  const subjectByName = new Map(subjects.map((s) => [s.name.toLowerCase(), s.id]));
  const teacherByLogin = new Map(teachers.map((t) => [t.login.toLowerCase(), t.id]));

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  records.forEach((r, i) => {
    const line = i + 2; // +1 за заголовок, +1 — нумерация с единицы
    const err = (msg: string) => errors.push(`Строка ${line}: ${msg}`);
    const groupId = groupByName.get(r.group?.toLowerCase());
    const subjectId = subjectByName.get(r.subject?.toLowerCase());
    const teacherId = teacherByLogin.get(r.teacher?.toLowerCase());
    const day = /^\d$/.test(r.day) ? Number(r.day) : DAYS[r.day?.toLowerCase()];
    const pair = Number(r.pair);
    const type = TYPES[r.type?.toLowerCase()];
    const week = WEEKS[(r.week ?? '').toLowerCase()];
    const start = r.start || PAIR_TIMES[pair]?.[0];
    const end = r.end || PAIR_TIMES[pair]?.[1];

    if (!groupId) return err(`группа «${r.group}» не найдена`);
    if (!subjectId) return err(`предмет «${r.subject}» не найден`);
    if (!teacherId) return err(`преподаватель с логином «${r.teacher}» не найден`);
    if (!day || day < 1 || day > 6) return err(`некорректный день «${r.day}»`);
    if (!Number.isInteger(pair) || pair < 1 || pair > 8) return err(`некорректный номер пары «${r.pair}»`);
    if (!type) return err(`некорректный тип занятия «${r.type}»`);
    if (!week) return err(`некорректная неделя «${r.week}»`);
    if (!start || !end || !TIME_RE.test(start) || !TIME_RE.test(end) || start >= end) return err('некорректное время');
    if (!r.room) return err('не указана аудитория');
    rows.push({ groupId, subjectId, teacherId, dayOfWeek: day, pairNumber: pair, startTime: start, endTime: end, type, room: r.room, weekParity: week });
  });
  return { rows, errors };
}
