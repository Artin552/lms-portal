import { useId } from 'react';

/** Геометрия знака ННГАСУ (viewBox 0 0 48 48): верхняя грань с вырезом и основание-«уголок» с прорезью */
export const PYRAMID_TOP = 'M20.1 7.4 11.5 16l8.6 9.5 12.8-7.3Z M20.9 10.04v13.27l9.38-5.35Z';
export const PYRAMID_BASE = 'M4.8 26.8 9.2 21.6l11.4 8 14.6-8 7.7 5.7-23.2 13.6Z M22 30.55l13.08-7.17 5.1 3.78L22 37.82Z';

/**
 * Знак ННГАСУ, перерисованный в стиле портала:
 * плитка с мягким градиентом, верхняя грань сплошная, основание — полупрозрачное.
 * Цвета берутся из токенов темы, поэтому знак сам подстраивается под светлую/тёмную тему.
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  const ink = 'rgb(var(--on-accent))';
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--accent))" stopOpacity="0.88" />
          <stop offset="1" stopColor="rgb(var(--accent))" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${id}-bg)`} />
      <g fill={ink} stroke={ink} strokeWidth="0.8" strokeLinejoin="round" fillRule="evenodd">
        <path d={PYRAMID_TOP} />
        <path d={PYRAMID_BASE} opacity="0.78" />
      </g>
    </svg>
  );
}

/** Контурная «чертёжная» версия знака для крупных декоративных размещений */
export function PyramidOutline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="0.35" strokeLinejoin="round">
        <path d={PYRAMID_TOP} />
        <path d={PYRAMID_BASE} />
        {/* вспомогательные построения, как на чертеже */}
        <path d="M20.1 2v44M1 26.8h46" strokeDasharray="0.8 1.2" opacity="0.45" />
        <circle cx="20.1" cy="7.4" r="0.9" />
      </g>
    </svg>
  );
}
