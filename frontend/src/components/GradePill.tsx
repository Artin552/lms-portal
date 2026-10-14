import clsx from 'clsx';
import { formatGrade, gradeTone, type GradeTone } from '../utils/grades';

const TONE: Record<GradeTone, string> = {
  ok: 'bg-ok/15 text-ok',
  info: 'bg-info/10 text-info',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/10 text-danger',
};

/** Оценка по шкале 2–5: «4,5» на цветной подложке */
export function GradePill({ score, className }: { score: number | null | undefined; className?: string }) {
  if (score === null || score === undefined) return <span className="text-sm text-muted">—</span>;
  return (
    <span
      className={clsx(
        'inline-flex min-w-[2.25rem] shrink-0 justify-center rounded-md px-2 py-1 font-display text-sm font-semibold tabular',
        TONE[gradeTone(score)],
        className,
      )}
    >
      {formatGrade(score)}
    </span>
  );
}
