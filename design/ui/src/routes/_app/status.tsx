import { createFileRoute } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';

import { Head } from '@/components/screen';
import { Card } from '@/components/ui/kit';
import { cn } from '@/lib/utils';

/**
 * Состояние сервиса.
 *
 * Открывают ровно в одну минуту: когда что-то не работает и надо понять,
 * это у меня или у всех. Поэтому ответ стоит первой строкой и крупно, а
 * подробности — под ним.
 */
const PARTS = [
  { what: 'Приложение', ms: 12, up: true },
  { what: 'База данных', ms: 3, up: true },
  { what: 'Уведомления', ms: 41, up: true },
  { what: 'Подключение банка', ms: 88, up: true },
  { what: 'Разбор фото графика', ms: 0, up: false },
  { what: 'Телеграм-бот', ms: 26, up: true },
];

/**
 * Тридцать дней: столбик на день, высота — сколько он продержался.
 *
 * Нулевой столбик — 3 августа, последний — сегодня. Провалы стоят там же,
 * где названы в подписи: график, который спорит с текстом под собой, хуже
 * отсутствующего — ему верят и ошибаются.
 */
const DIPS: Record<number, number> = { 17: 91, 18: 68, 29: 82 };
const DAYS = Array.from({ length: 30 }, (_, index) => DIPS[index] ?? 100);

function Status() {
  const down = PARTS.filter((one) => !one.up);
  const first = down[0];

  return (
    <>
      <Head
        said="Служебное"
        title="Работает ли сервис"
        right={
          <span className="flex items-center gap-1.5 text-xs text-faint">
            <RefreshCw className="size-3.5" />
            спрашиваем заново каждые 30 секунд
          </span>
        }
      />

      <section
        className={cn(
          'card flex flex-wrap items-center justify-between gap-4 p-6',
          first ? 'border-taken/35' : 'border-money/25',
        )}
      >
        <div>
          <p className={cn('text-2xl font-bold', first ? 'text-taken' : 'text-money')}>
            {first ? 'Одна часть не отвечает' : 'Всё работает'}
          </p>
          <p className="hint mt-1">
            {first
              ? `${first.what} — остальное в порядке. Смены сохраняются как обычно.`
              : 'Проверено только что.'}
          </p>
        </div>
        <p className="font-mono text-xs text-faint">
          {first ? 'началось в 14:20' : 'без перерывов 27 дней'}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="По частям">
          <div className="flex flex-col">
            {PARTS.map((one) => (
              <span
                key={one.what}
                className="flex items-center gap-3 border-b border-paper/9 py-2.5 last:border-0"
              >
                <span
                  className={cn('size-2 flex-none rounded-full', one.up ? 'bg-money' : 'bg-taken')}
                />
                <span className="flex-1 text-sm">{one.what}</span>
                <span className={cn('text-xs', one.up ? 'text-faint' : 'text-taken')}>
                  {one.up ? 'работает' : 'не отвечает'}
                </span>
                <span className="w-14 text-right font-mono text-2xs text-faint tabular">
                  {one.up ? `${one.ms} мс` : '—'}
                </span>
              </span>
            ))}
          </div>
        </Card>

        <Card title="Последние 30 дней" hint="Столбик — день. Провал видно без подписи.">
          <div className="flex h-16 items-end gap-[3px]">
            {DAYS.map((height, index) => (
              <span
                key={index}
                className={cn('flex-1 rounded-sm', height === 100 ? 'bg-money/70' : 'bg-taken')}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between">
            <span className="lbl">30 дней назад</span>
            <span className="lbl">сегодня</span>
          </div>
          <p className="hint mt-3 border-t border-paper/9 pt-3">
            Провалы: 20 и 21 августа, суммарно 3 ч 40 мин, и сегодняшний — он ещё идёт. Смены за
            это время не теряются: они дописываются, когда сервис возвращается.
          </p>
        </Card>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/status')({ component: Status });
