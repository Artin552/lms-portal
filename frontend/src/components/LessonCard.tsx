import clsx from 'clsx';
import { MapPin, Users, UserRound } from 'lucide-react';
import type { LessonType, Role, ScheduleEntry } from '../api/types';
import { LESSON_TYPE, PARITY } from '../utils/format';
import { minutesUntil } from '../utils/schedule';
import { Badge } from './ui';

const TYPE_STRIPE: Record<LessonType, string> = {
  LECTURE: 'bg-info',
  PRACTICE: 'bg-ok',
  LAB: 'bg-warn',
};

export function LessonCard({
  lesson,
  role,
  state,
  showParity,
}: {
  lesson: ScheduleEntry;
  role: Role;
  state?: 'current' | 'next' | null;
  showParity?: boolean;
}) {
  const until = state === 'next' ? minutesUntil(lesson.startTime) : null;
  return (
    <div
      className={clsx(
        'relative flex gap-4 overflow-hidden rounded border bg-surface p-3.5 pl-5 transition-shadow',
        state === 'current' ? 'border-accent shadow-[0_0_0_3px_rgb(var(--accent)/0.15)]' : 'border-line',
      )}
    >
      <span className={clsx('absolute inset-y-0 left-0 w-1', TYPE_STRIPE[lesson.type])} aria-hidden />
      <div className="w-14 shrink-0 text-right tabular">
        <div className="text-sm font-semibold">{lesson.startTime}</div>
        <div className="text-xs text-muted">{lesson.endTime}</div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{lesson.pairNumber} пара</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{LESSON_TYPE[lesson.type]}</Badge>
          {state === 'current' && <Badge tone="accent">Идёт сейчас</Badge>}
          {state === 'next' && until !== null && (
            <Badge tone="info">{until <= 90 ? `Через ${until} мин` : 'Следующая'}</Badge>
          )}
          {showParity && lesson.weekParity !== 'ALL' && <Badge tone="warn">{PARITY[lesson.weekParity]}</Badge>}
        </div>
        <div className="mt-1.5 font-semibold leading-snug">{lesson.subject.name}</div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> ауд. {lesson.room}
          </span>
          {role !== 'TEACHER' && (
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5" /> {lesson.teacher.shortName}
            </span>
          )}
          {role !== 'STUDENT' && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {lesson.group.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
