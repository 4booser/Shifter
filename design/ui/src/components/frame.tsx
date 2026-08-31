import { ReactNode } from 'react';

import { ME } from '@/mock/data';
import { cn } from '@/lib/utils';

/**
 * Окно приложения, в котором показывают экран.
 *
 * Навигация нарисованная: ссылки никуда не ведут, потому что это макет. Одна
 * вкладка подсвечена, чтобы было видно, где мы находимся.
 */
const TABS = ['Календарь', 'Смены', 'Места', 'График', 'Подработки', 'Выплаты', 'Банк', 'Год'];

export function Frame({
  tab,
  live,
  children,
}: {
  tab: string;
  /** Идущая смена в шапке: она есть не всегда, и это видно. */
  live?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-paper/17 bg-night">
      <header className="flex h-15 items-center gap-5 border-b border-paper/9 px-6 py-3.5">
        <span className="text-base font-extrabold tracking-[-0.04em] whitespace-nowrap">
          Shifter<span className="text-brass">.</span>
        </span>

        <nav className="flex min-w-0 gap-0.5 overflow-hidden">
          {TABS.map((one) => (
            <span
              key={one}
              className={cn(
                'flex-none rounded-lg px-3 py-1.5 text-sm whitespace-nowrap',
                one === tab ? 'bg-brass font-semibold text-night' : 'text-faint',
              )}
            >
              {one}
            </span>
          ))}
        </nav>

        <span className="ml-auto flex items-center gap-4">
          {live !== undefined && (
            <span className="flex items-center gap-2 font-mono text-xs whitespace-nowrap text-brass-lit">
              <span className="size-1.5 flex-none rounded-full bg-brass" />
              {live}
            </span>
          )}
          <span className="grid size-8 flex-none place-items-center rounded-full border border-paper/17 text-xs text-dim">
            {ME.initials}
          </span>
        </span>
      </header>

      <div className="flex flex-col gap-6 px-6 py-6">{children}</div>
    </div>
  );
}

/** Подпись над макетом: что это за поверхность и зачем она такая. */
export function Plate({
  title,
  path,
  why,
  children,
}: {
  title: string;
  path: string;
  why?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3.5">
      <header>
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <span className="font-mono text-2xs tracking-[0.1em] text-faint uppercase">{path}</span>
        </div>
        {why !== undefined && <p className="hint mt-1 max-w-3xl">{why}</p>}
      </header>
      {children}
    </section>
  );
}

/** Страница макета: заголовок раздела и вертикальный поток поверхностей. */
export function Sheet({
  kicker,
  title,
  blurb,
  children,
}: {
  kicker: string;
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[1320px] px-6 pt-12 pb-32">
      <p className="font-mono text-xs tracking-[0.16em] text-brass uppercase">{kicker}</p>
      <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.035em]">{title}</h1>
      <p className="mt-3 max-w-3xl text-dim">{blurb}</p>
      <div className="mt-12 flex flex-col gap-20">{children}</div>
    </main>
  );
}
