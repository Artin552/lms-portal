/** Шкала оценок: от 2 до 5 с шагом 0,5. Шаг меняется здесь (и в backend/src/utils/grades.ts). */
export const GRADE_MIN = 2;
export const GRADE_MAX = 5;
export const GRADE_STEP = 0.5;

/** Все допустимые оценки: 2, 2.5, 3 … 5 */
export const GRADE_OPTIONS = Array.from(
  { length: Math.round((GRADE_MAX - GRADE_MIN) / GRADE_STEP) + 1 },
  (_, i) => GRADE_MIN + i * GRADE_STEP,
);

/** «4,5», «5», «4,25» */
export function formatGrade(v: number | null | undefined) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

export type GradeTone = 'ok' | 'info' | 'warn' | 'danger';

/** Цвет оценки: 4,5–5 — отлично, 3,5–4 — хорошо, 2,5–3 — удовлетворительно, ниже — неудовлетворительно */
export function gradeTone(v: number): GradeTone {
  if (v >= 4.5) return 'ok';
  if (v >= 3.5) return 'info';
  if (v >= 2.5) return 'warn';
  return 'danger';
}

/** Доля шкалы для полосок прогресса: 2 → 0, 5 → 1 */
export function gradeFraction(v: number) {
  return Math.min(1, Math.max(0, (v - GRADE_MIN) / (GRADE_MAX - GRADE_MIN)));
}
