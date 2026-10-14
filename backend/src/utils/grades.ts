import { z } from 'zod';

/** Шкала оценок: от 2 до 5 с шагом 0,1. Шаг меняется здесь (и в frontend/src/utils/grades.ts). */
export const GRADE_MIN = 2;
export const GRADE_MAX = 5;
export const GRADE_STEP = 0.1;

const onStep = (v: number) => Math.abs(v / GRADE_STEP - Math.round(v / GRADE_STEP)) < 1e-9;

export const gradeSchema = z
  // принимаем и «4,3», и «4.3»
  .preprocess((v) => (typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v), z.number({ invalid_type_error: 'Оценка должна быть числом' }))
  .refine((v) => Number.isFinite(v), 'Оценка должна быть числом')
  .refine((v) => v >= GRADE_MIN, `Оценка не может быть ниже ${GRADE_MIN}`)
  .refine((v) => v <= GRADE_MAX, `Оценка не может быть выше ${GRADE_MAX}`)
  .refine(onStep, `Оценка выставляется с шагом ${String(GRADE_STEP).replace('.', ',')}`)
  // убираем хвосты плавающей точки: 4.300000000001 → 4.3
  .transform((v) => Number((Math.round(v / GRADE_STEP) * GRADE_STEP).toFixed(2)));

/** «4,5», «5» */
export function formatGrade(v: number) {
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

/** Средняя оценка с округлением до сотых (null, если оценок нет) */
export function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}
