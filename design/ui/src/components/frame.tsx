import { ReactNode } from 'react';

/**
 * Подпись над образцом в дизайн-системе: что это и зачем оно такое.
 *
 * Живёт только в `/kit` — на самом сайте подписывать нечего, там всё уже
 * называет себя само.
 */
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
