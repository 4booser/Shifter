import { Link, createFileRoute } from '@tanstack/react-router';
import { Eye } from 'lucide-react';

import { Button, Field } from '@/components/ui/kit';

/** Приглашение по ссылке от коллеги: сначала объясняем, чем делятся. */
function Join() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(90% 60% at 50% -10%, rgba(224,164,91,0.13), transparent 60%)' }}
      />

      <section className="relative flex w-full max-w-sm flex-col gap-4 text-center">
        <div>
          <span className="lbl">Вас зовут в команду</span>
          <h1 className="mt-2 text-2xl font-bold">Смена «Полночь»</h1>
          <p className="hint mt-1">Днепр · 4 человека</p>
        </div>

        <p className="text-sm text-dim">
          Команда видит, кто и когда выходит. Заработок остаётся вашим — на общем графике его
          нет ни у кого.
        </p>

        <Field label="Как вас звать в графике" value="Аня" />

        <Link to="/schedule"><Button tone="go" className="w-full">Присоединиться</Button></Link>
        <Link to="/"><Button tone="quiet" className="w-full"><Eye className="size-4" />Сначала посмотреть</Button></Link>
      </section>
    </main>
  );
}

export const Route = createFileRoute('/join')({ component: Join });
