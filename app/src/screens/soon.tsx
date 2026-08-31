import { ArrowUpRight } from 'lucide-react';

/**
 * A page that has not been ported yet, saying so plainly and pointing at the
 * one that works. Better than a blank route while the move is under way.
 */
export function Soon({ title }: { title: string }) {
  return (
    <section className="card mx-auto max-w-md p-6 text-center">
      <h1 className="mb-1 text-xl font-bold tracking-tight capitalize">{title}</h1>
      <p className="field-hint mb-4">Этот экран ещё переезжает на новый фронт.</p>
      <a
        href={`/${title}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-accent-foreground hover:underline"
      >
        Открыть рабочую версию
        <ArrowUpRight className="size-3.5" />
      </a>
    </section>
  );
}
