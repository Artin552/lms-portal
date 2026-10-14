import clsx from 'clsx';
import { format } from 'date-fns';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LessonType, ScheduleEntry } from '../api/types';
import { LESSON_TYPE, plural } from '../utils/format';

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** «через 25 мин», «через 1 ч 40 мин» */
function inTime(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

const BLOCK: Record<LessonType, string> = {
  LECTURE: 'border-info/50 bg-info/10',
  PRACTICE: 'border-ok/50 bg-ok/10',
  LAB: 'border-warn/50 bg-warn/10',
};

export interface TodayFact {
  label: string;
  value: ReactNode;
  to: string;
  hot?: boolean;
}

/**
 * Полоса «Сегодня»: что происходит прямо сейчас, линейка дня с парами и короткие факты.
 * Заменяет набор одинаковых KPI-плиток — информация подаётся предложением, а не цифрой.
 */
export function TodayStrip({ lessons, now, facts }: { lessons: ScheduleEntry[]; now: Date; facts: TodayFact[] }) {
  const sorted = [...lessons].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const current = sorted.find((l) => toMin(l.startTime) <= nowMin && nowMin < toMin(l.endTime));
  const next = sorted.find((l) => toMin(l.startTime) > nowMin);
  const last = sorted[sorted.length - 1];

  let headline: ReactNode;
  let detail: ReactNode;
  if (current) {
    headline = (
      <>
        Сейчас — <span className="text-accent">{current.subject.name}</span>
      </>
    );
    detail = `${LESSON_TYPE[current.type]}, ауд. ${current.room} · до ${current.endTime}, осталось ${inTime(toMin(current.endTime) - nowMin)}`;
  } else if (next) {
    headline = (
      <>
        Следующая пара в <span className="tabular text-accent">{next.startTime}</span>
      </>
    );
    detail = `${next.subject.name}, ауд. ${next.room} · через ${inTime(toMin(next.startTime) - nowMin)}`;
  } else if (last) {
    headline = 'На сегодня всё';
    detail = `Последняя пара закончилась в ${last.endTime}`;
  } else {
    headline = 'Сегодня без пар';
    detail = 'Свободный день — хорошее время для заданий';
  }

  // Шкала: от 8:00 (или раньше первой пары) до 18:00 (или позже последней), по целым часам
  const startH = Math.min(8, sorted.length ? Math.floor(toMin(sorted[0].startTime) / 60) : 8);
  const endH = Math.max(18, last ? Math.ceil(toMin(last.endTime) / 60) : 18);
  const span = (endH - startH) * 60;
  const pos = (min: number) => `${((min - startH * 60) / span) * 100}%`;
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
  const nowVisible = nowMin >= startH * 60 && nowMin <= endH * 60;

  return (
    <section className="card overflow-hidden" aria-label="Сегодня">
      <div className="px-5 pb-4 pt-5 sm:px-6">
        <p className="text-xl font-semibold leading-snug sm:text-2xl">{headline}</p>
        <p className="mt-1 text-sm text-muted">{detail}</p>
      </div>

      {sorted.length > 0 && (
        <div className="px-5 pb-5 sm:px-6">
          <div className="relative h-14">
            {/* часовые засечки */}
            {hours.map((h, i) => (
              <div key={h} className="absolute bottom-0 top-0" style={{ left: pos(h * 60) }}>
                <div className="absolute bottom-4 top-0 w-px bg-line" />
                <span
                  className={clsx(
                    'absolute bottom-0 -translate-x-1/2 text-[10px] text-muted tabular',
                    i % 2 === 1 && 'hidden sm:inline',
                    i === 0 && 'translate-x-0',
                    i === hours.length - 1 && '-translate-x-full',
                  )}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}

            {/* пары */}
            {sorted.map((l) => {
              const isPast = toMin(l.endTime) <= nowMin;
              const isCurrent = l.id === current?.id;
              return (
                <Link
                  key={l.id}
                  to="/schedule"
                  title={`${l.startTime}–${l.endTime} · ${l.subject.name} · ауд. ${l.room}`}
                  className={clsx(
                    'absolute top-1 flex h-7 items-center overflow-hidden rounded-md border px-2 text-[11px] font-semibold transition-opacity hover:opacity-100',
                    isCurrent ? 'border-accent bg-accent text-on-accent' : BLOCK[l.type],
                    isPast && 'opacity-40',
                  )}
                  style={{ left: pos(toMin(l.startTime)), width: `calc(${pos(toMin(l.endTime))} - ${pos(toMin(l.startTime))})` }}
                >
                  <span className="truncate">{l.subject.name}</span>
                </Link>
              );
            })}

            {/* отметка «сейчас» */}
            {nowVisible && (
              <div className="pointer-events-none absolute -top-1 bottom-4 z-10" style={{ left: pos(nowMin) }}>
                <div className="absolute inset-y-0 -left-px w-0.5 rounded bg-accent" />
                <div className="absolute -left-[4px] -top-[3px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
              </div>
            )}
          </div>
          <p className="sr-only">Сейчас {format(now, 'HH:mm')}</p>
        </div>
      )}

      <div className="grid divide-y divide-line border-t border-line sm:grid-flow-col sm:auto-cols-fr sm:divide-x sm:divide-y-0">
        {facts.map((f) => (
          <Link key={f.label} to={f.to} className="group block px-5 py-3 transition-colors hover:bg-surface-2/60 sm:px-6">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">{f.label}</span>
            <span className={clsx('mt-0.5 block text-sm', f.hot ? 'font-semibold text-accent' : 'text-ink')}>
              {f.value}
              <span className="ml-1 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
                →
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function countLabel(n: number, forms: [string, string, string]) {
  return `${n} ${plural(n, forms)}`;
}
