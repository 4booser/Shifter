import { ReactNode } from 'react';

/**
 * Шапка экрана: над чем мы находимся и что здесь можно сделать.
 *
 * Служебная строка сверху, название крупно, действия справа — один порядок
 * на всех экранах, чтобы взгляд не искал их заново на каждой вкладке.
 */
export function Head({
  said,
  title,
  hint,
  right,
}: {
  said: string;
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="lbl">{said}</span>
        <h1 className="mt-1 text-2xl font-bold">{title}</h1>
        {hint !== undefined && <p className="hint mt-1 max-w-2xl">{hint}</p>}
      </div>
      {right !== undefined && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}
