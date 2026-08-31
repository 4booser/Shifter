import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Сводка дня и месяц её глазами.
 *
 * Сводку пишет модель, и это подписано. Цифры в ней — не её: их считает
 * приложение, модель только складывает из них фразу. Без этой пометки
 * человек не знает, чему верить, и правильно делает.
 */
export function Brief({ children }: { children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paper/9 px-4 py-2.5">
        <span className="lbl">Сегодня · 1 сентября</span>
        <span className="rounded-full border border-brass/35 px-2 py-0.5 text-2xs text-brass">
          слова модели, числа наши
        </span>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * Месяц одной линией: столбик на день, метка на день выплаты, точка на
 * лучшем дне и пунктир туда, куда месяц приедет.
 */
export function BriefChart({
  days,
  payday,
  best,
}: {
  days: number[];
  payday: number;
  best: number;
}) {
  const peak = Math.max(...days, 1);

  return (
    <div>
      <div className="mb-1.5 flex h-20 items-end gap-[3px]">
        {days.map((value, index) => (
          <span key={index} className="relative flex h-full flex-1 flex-col justify-end">
            {/* Метка выплаты стоит под столбиком, у оси: поднятая наверх, она
                читается как «в этот день было много», а не «в этот день дали». */}
            {index === payday && (
              <span className="absolute -bottom-1.5 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-brass" />
            )}
            {index === best && (
              <span
                className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-money"
                style={{ bottom: `calc(${(value / peak) * 100}% + 4px)` }}
              />
            )}
            <span
              className={cn('w-full rounded-sm', value === 0 ? 'bg-edge' : 'bg-brass/70')}
              style={{ height: `${Math.max(3, (value / peak) * 100)}%` }}
            />
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 text-2xs text-dim">
          <span className="h-2.5 w-0.5 bg-brass" />
          день выплаты
        </span>
        <span className="flex items-center gap-1.5 text-2xs text-dim">
          <span className="size-1.5 rounded-full bg-money" />
          лучший день
        </span>
        <span className="ml-auto text-2xs text-faint">к концу месяца — ₴26 100</span>
      </div>
    </div>
  );
}
