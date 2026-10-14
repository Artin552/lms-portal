/** Шкала оценок: от 2 до 5 с шагом 0,1. Шаг меняется здесь (и в backend/src/utils/grades.ts). */
export const GRADE_MIN = 2;
export const GRADE_MAX = 5;
export const GRADE_STEP = 0.1;

/** Круглые оценки для быстрых кнопок */
export const QUICK_GRADES = [2, 3, 4, 5];

/** Разбор ввода «4,3» / «4.3». Возвращает число или текст ошибки. */
export function parseGrade(input: string): { value: number } | { error: string } {
  const s = input.trim().replace(',', '.');
  if (!s) return { error: 'Введите оценку' };
  const v = Number(s);
  if (!Number.isFinite(v)) return { error: 'Оценка должна быть числом' };
  if (v < GRADE_MIN || v > GRADE_MAX) return { error: `Оценка от ${GRADE_MIN} до ${GRADE_MAX}` };
  if (Math.abs(v / GRADE_STEP - Math.round(v / GRADE_STEP)) > 1e-9) {
    return { error: `Шаг оценки — ${formatGrade(GRADE_STEP)}` };
  }
  return { value: Number((Math.round(v / GRADE_STEP) * GRADE_STEP).toFixed(2)) };
}

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
