import { createFileRoute } from '@tanstack/react-router';
import { CircleAlert } from 'lucide-react';

import { Head } from '@/components/screen';
import { Bars, Button, Card } from '@/components/ui/kit';
import { PAYOUTS } from '@/mock/data';
import { cn } from '@/lib/utils';

function Payouts() {
  return (
    <>
      <Head said="Что обещано" title="Выплаты" right={<Button tone="line">Пришли деньги</Button>} />

      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card p-6">
          <span className="lbl">Ближайшие деньги</span>
          <p className="mt-1.5 text-4xl font-extrabold text-money tabular">₴16 590</p>
          <p className="hint mt-1">через 5 дней · 5 сентября · Бар «Сова»</p>
        </div>
        <div className="card p-6">
          <span className="lbl">Всего ждём</span>
          <p className="mt-1.5 text-2xl font-bold tabular">₴79 369</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-taken">
            <CircleAlert className="size-4" />
            ₴62 779 задерживают
          </p>
        </div>
      </div>

      <Card title="Ждём">
        <div className="flex flex-col">
          {PAYOUTS.map((row) => (
            <div key={row.span + row.place} className="flex items-center gap-3 border-b border-paper/9 py-3 last:border-0">
              <span className="size-2 flex-none rounded-full bg-brass" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{row.place}</span>
                  <span className={cn(
                    'text-2xs font-bold',
                    row.state === 'Задержка' ? 'text-taken' : row.state === 'Пришло' ? 'text-money' : 'text-faint',
                  )}>
                    {row.state}
                  </span>
                  {row.late !== undefined && <span className="font-mono text-2xs text-taken">{row.late}</span>}
                </span>
                <span className="block font-mono text-2xs text-faint">{row.span} · {row.due}</span>
              </span>
              <span className="font-mono text-sm tabular">{row.amount}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Сколько выходит за период" hint="Слева старые, справа свежие. Красным — то, что ещё не пришло.">
          <Bars rows={[
            { name: '16–30 июня', share: 50, value: '₴9 260', tone: 'taken' },
            { name: '1–15 июля', share: 93, value: '₴17 274', tone: 'taken' },
            { name: '16–31 июля', share: 100, value: '₴18 437', tone: 'taken' },
            { name: '1–15 авг.', share: 96, value: '₴17 808', tone: 'money' },
            { name: '16–31 авг.', share: 90, value: '₴16 590', tone: 'brass' },
          ]} />
        </Card>

        <Card title="Как здесь платят" hint="По тому, что уже случилось. Банк это подтверждает, память — нет.">
          <div className="flex flex-col gap-3">
            {[['Бар «Сова»', '+42 дня', '4 задержки, худшая 57', true], ['Ресторан «Дым»', 'день в день', '3 выплаты без опозданий', false]].map(([place, avg, meta, late]) => (
              <span key={place as string} className="flex flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{place as string}</span>
                  <span className={cn('text-sm font-semibold tabular', (late as boolean) ? 'text-taken' : 'text-money')}>
                    {avg as string}
                  </span>
                </span>
                <span className="hint">{meta as string}</span>
              </span>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/payouts')({ component: Payouts });
