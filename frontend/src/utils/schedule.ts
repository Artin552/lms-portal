import type { ScheduleEntry } from '../api/types';

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** 1 = понедельник … 7 = воскресенье */
export function isoDay(d = new Date()) {
  return ((d.getDay() + 6) % 7) + 1;
}

/**
 * Текущая и следующая пара среди пар одного дня (сегодняшнего).
 * Следующая — ближайшая, которая ещё не началась.
 */
export function currentAndNext(lessons: ScheduleEntry[], now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const sorted = [...lessons].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const current = sorted.find((l) => toMinutes(l.startTime) <= minutes && minutes < toMinutes(l.endTime));
  const next = sorted.find((l) => toMinutes(l.startTime) > minutes);
  return { currentId: current?.id ?? null, nextId: next?.id ?? null };
}

export function minutesUntil(time: string, now = new Date()) {
  return toMinutes(time) - (now.getHours() * 60 + now.getMinutes());
}

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
