import { Link, createFileRoute } from '@tanstack/react-router';

import { Button, Field } from '@/components/ui/kit';

/** Сброс пароля: ссылка одноразовая и живёт час — об этом сказано сразу. */
function Reset() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(90% 60% at 50% -10%, rgba(224,164,91,0.13), transparent 60%)' }}
      />

      <section className="relative flex w-full max-w-sm flex-col gap-4">
        <div>
          <span className="text-lg font-extrabold tracking-[-0.04em]">
            Shifter<span className="text-brass">.</span>
          </span>
          <h1 className="mt-4 text-2xl font-bold">Новый пароль</h1>
          <p className="hint mt-1">Ссылка одноразовая и живёт час.</p>
        </div>

        <Field label="Новый пароль" value="••••••••" />
        <Field label="Ещё раз" value="••••••••" />

        <Link to="/login"><Button tone="go" className="w-full">Сменить</Button></Link>

        <p className="hint mt-2 border-t border-paper/9 pt-4">
          Не запрашивали? Ничего делать не нужно — пароль останется прежним.
        </p>
      </section>
    </main>
  );
}

export const Route = createFileRoute('/reset')({ component: Reset });
