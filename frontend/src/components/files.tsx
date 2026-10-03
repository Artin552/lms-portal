import clsx from 'clsx';
import { FileText, Paperclip, X } from 'lucide-react';
import { useRef } from 'react';
import type { FileRef } from '../api/types';
import { fmtSize } from '../utils/format';

export function FileList({
  files,
  onRemove,
  compact,
}: {
  files: FileRef[];
  onRemove?: (id: number) => void;
  compact?: boolean;
}) {
  if (!files.length) return null;
  return (
    <ul className={clsx('flex flex-wrap gap-2', compact && 'gap-1.5')}>
      {files.map((f) => (
        <li key={f.id} className="flex max-w-full items-center rounded border border-line bg-surface-2/60">
          <a
            href={f.url}
            target="_blank"
            rel="noreferrer"
            download={f.isImage ? undefined : f.fileName}
            className="flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-sm hover:text-accent"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted" />
            <span className="truncate">{f.fileName}</span>
            <span className="shrink-0 text-xs text-muted">{fmtSize(f.size)}</span>
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(f.id)}
              aria-label={`Удалить ${f.fileName}`}
              className="mr-1 rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Выбор новых файлов для загрузки (ещё не отправленных) */
export function FilePicker({
  files,
  onChange,
  label = 'Прикрепить файлы',
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onChange([...files, ...Array.from(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-2 rounded border border-dashed border-line px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
      >
        <Paperclip className="h-4 w-4" />
        {label}
      </button>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded border border-accent/30 bg-accent-soft/50 py-1 pl-2.5 pr-1 text-sm">
              <span className="max-w-[220px] truncate">{f.name}</span>
              <span className="text-xs text-muted">{fmtSize(f.size)}</span>
              <button
                type="button"
                aria-label={`Убрать ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="rounded p-1 text-muted hover:text-danger"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
