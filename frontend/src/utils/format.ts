import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { LessonType, Role, StudentStatus, WeekParity } from '../api/types';

export const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
export const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export const LESSON_TYPE: Record<LessonType, string> = {
  LECTURE: 'Лекция',
  PRACTICE: 'Практика',
  LAB: 'Лаб. работа',
};

export const PARITY: Record<WeekParity, string> = {
  ALL: 'Каждую неделю',
  ODD: 'Нечётная',
  EVEN: 'Чётная',
};

export const ROLE: Record<Role, string> = {
  STUDENT: 'Студент',
  TEACHER: 'Преподаватель',
  ADMIN: 'Администратор',
};

export const STATUS: Record<StudentStatus, string> = {
  pending: 'Не сдано',
  submitted: 'Сдано',
  returned: 'На доработке',
  graded: 'Проверено',
  overdue: 'Просрочено',
};

export const STATUS_TONE: Record<StudentStatus, 'neutral' | 'info' | 'warn' | 'ok' | 'danger'> = {
  pending: 'neutral',
  submitted: 'info',
  returned: 'warn',
  graded: 'ok',
  overdue: 'danger',
};

export function fmtDateTime(d: string | Date) {
  return format(new Date(d), 'd MMM yyyy, HH:mm', { locale: ru });
}

export function fmtDate(d: string | Date) {
  return format(new Date(d), 'd MMMM', { locale: ru });
}

/** «сегодня в 18:00», «завтра в 09:00», «12 окт, 18:00» */
export function fmtDeadline(d: string | Date) {
  const date = new Date(d);
  const time = format(date, 'HH:mm');
  if (isToday(date)) return `сегодня в ${time}`;
  if (isTomorrow(date)) return `завтра в ${time}`;
  if (isYesterday(date)) return `вчера в ${time}`;
  return format(date, 'd MMM, HH:mm', { locale: ru });
}

export function fmtRelative(d: string | Date) {
  return formatDistanceToNowStrict(new Date(d), { locale: ru, addSuffix: true });
}

/** Время сообщения: только часы для сегодняшних, иначе дата */
export function fmtMessageTime(d: string | Date) {
  const date = new Date(d);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'вчера';
  return format(date, 'd MMM', { locale: ru });
}

export function fmtDayHeading(d: string | Date) {
  const date = new Date(d);
  if (isToday(date)) return 'Сегодня';
  if (isYesterday(date)) return 'Вчера';
  return format(date, 'd MMMM yyyy', { locale: ru });
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function hoursLeft(d: string | Date) {
  return (new Date(d).getTime() - Date.now()) / 3600_000;
}

/** «2 студента», «5 студентов» */
export function plural(n: number, forms: [string, string, string]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}
