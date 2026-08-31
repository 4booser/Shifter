import { createFileRoute } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Field } from '@/components/ui/kit';
import { cn } from '@/lib/utils';

/**
 * Спросить про свои месяцы.
 *
 * У каждого ответа подписано, кем он получен: цифры всегда считает Shifter,
 * модель только складывает из них фразу. Подпись стоит не для порядка —
 * человек должен знать, где кончается арифметика и начинается пересказ.
 */
const BY = {
  app: { label: 'посчитал и написал Shifter', tone: 'text-money border-money/35' },
  model: { label: 'слова модели', tone: 'text-brass border-brass/35' },
} as const;

function Mark({ by }: { by: keyof typeof BY }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs',
        BY[by].tone,
      )}
    >
      {BY[by].label}
    </span>
  );
}

const TALK = [
  { mine: true, text: 'Почему в июле вышло меньше, чем в июне?' },
  {
    mine: false,
    by: 'app' as const,
    text: 'В июле 19 смен против 23 в июне — минус 32 часа. Ставка та же, ₴200.',
  },
  {
    mine: false,
    by: 'model' as const,
    text: 'Две недели отпуска в середине месяца объясняют всю разницу; выходили вы так же плотно, как в июне.',
  },
  { mine: true, text: 'А чаевые?' },
  {
    mine: false,
    by: 'app' as const,
    text: 'Чаевых ₴4 100 в июле и ₴3 900 в июне — за меньшее число смен. На смену: ₴216 против ₴170.',
  },
];

function Assistant() {
  return (
    <>
      <Head
        said="Помощник"
        title="Спросить про свои месяцы"
        hint="Отвечает только о ваших сменах. Считает — приложение, пересказывает — модель."
        right={
          <span className="flex items-center gap-1">
            <Button tone="quiet" size="icon">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="font-mono text-sm">Август 2026</span>
            <Button tone="quiet" size="icon">
              <ChevronRight className="size-4" />
            </Button>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card bodyClass="flex flex-col gap-4">
          <div className="flex flex-col gap-3.5">
            {TALK.map((one, index) => (
              <div
                key={index}
                className={cn('flex flex-col gap-1.5', one.mine ? 'items-end' : 'items-start')}
              >
                <span
                  className={cn(
                    'max-w-[46ch] rounded-[var(--radius-field)] px-3.5 py-2.5 text-sm',
                    one.mine
                      ? 'bg-raised'
                      : 'border border-paper/9 bg-deep text-dim',
                  )}
                >
                  {one.text}
                </span>
                {!one.mine && one.by !== undefined && <Mark by={one.by} />}
              </div>
            ))}
          </div>

          <div className="flex gap-2 border-t border-paper/9 pt-4">
            <Field placeholder="Про месяц, день, час…" className="flex-1" />
            <Button tone="go" className="self-end">
              <Sparkles className="size-4" />
              Спросить
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Месяц словами" hint="То же, но без вопросов.">
            <p className="text-sm text-dim">
              23 смены, 184 часа, ₴38 200. Самый дорогой день — суббота: ₴2 470 в среднем. Дважды
              выходили в чужую смену, оба раза в «Полночь».
            </p>
            <div className="mt-3">
              <Mark by="app" />
            </div>
          </Card>

          <Card title="О чём спрашивают">
            <div className="flex flex-col gap-2">
              {[
                'Когда я работал больше всего?',
                'Сколько стоила дорога за год?',
                'В каком месте платят ровнее?',
                'Сколько выйдет, если брать по две субботы?',
              ].map((one) => (
                <span
                  key={one}
                  className="rounded-[var(--radius-field)] border border-paper/9 px-3 py-2 text-xs text-dim"
                >
                  {one}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/assistant')({ component: Assistant });
