import { config } from '../config';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Понедельник недели, в которую попадает дата */
export function mondayOf(d: Date): Date {
  const day = startOfDayLocal(d);
  const dow = (day.getDay() + 6) % 7; // 0 = понедельник
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - dow);
}

/** Номер учебной недели (1 — неделя начала семестра). Чётность считается от него. */
export function weekNumber(date: Date, semesterStart = config.semesterStart): number {
  const [y, m, d] = semesterStart.split('-').map(Number);
  const start = mondayOf(new Date(y, m - 1, d));
  const diff = Math.round((mondayOf(date).getTime() - start.getTime()) / DAY_MS);
  return Math.floor(diff / 7) + 1;
}

export function parityOf(date: Date): 'ODD' | 'EVEN' {
  // Работает и для недель до начала семестра (отрицательные номера)
  return Math.abs(weekNumber(date)) % 2 === 1 ? 'ODD' : 'EVEN';
}

/** 1 = понедельник … 7 = воскресенье */
export function isoDayOfWeek(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}
