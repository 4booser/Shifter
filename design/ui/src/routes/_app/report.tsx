import { createFileRoute } from '@tanstack/react-router';
import { Printer, Share2 } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Pills } from '@/components/ui/kit';

/**
 * Отчёт. Единственный экран, который печатают, — поэтому лист светлый:
 * чёрная страница на принтере это перевод краски и ничего больше.
 */
function Report() {
  return (
    <>
      <Head
        said="Отчёт"
        title="Август 2026"
        right={
          <>
            <Button tone="line" size="sm"><Printer className="size-3.5" />Печать</Button>
            <Button tone="line" size="sm"><Share2 className="size-3.5" />XLSX</Button>
            <Pills options={['Месяц', 'Год']} value="Месяц" />
          </>
        }
      />

      <div className="rounded-[var(--radius-card)] bg-paper p-8 text-night">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-night/15 pb-4">
          <div>
            <p className="font-mono text-2xs tracking-[0.14em] text-night/50 uppercase">
              Shifter · отчёт за период
            </p>
            <p className="mt-1 text-xl font-bold">1 — 31 августа 2026</p>
            <p className="text-sm text-night/60">Аня · Бар «Полночь», Ресторан «Веранда»</p>
          </div>
          <p className="text-3xl font-extrabold tabular">₴24 700</p>
        </div>

        <table className="mt-5 w-full border-collapse font-mono text-sm">
          <tbody>
            {[
              ['Смены · 137 ч', '19 480'],
              ['Чаевые', '7 700'],
              ['Надбавки за ночь', '2 142'],
              ['Отдано в котёл', '−634'],
              ['Питание', '−1 530'],
              ['Штраф · разбили', '−700'],
            ].map(([what, sum]) => (
              <tr key={what} className="border-b border-night/10">
                <td className="py-2 text-night/70">{what}</td>
                <td className="py-2 text-right tabular">{sum}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-3 font-semibold">Итого до налога</td>
              <td className="pt-3 text-right font-semibold tabular">26 458</td>
            </tr>
            <tr>
              <td className="py-1 text-night/70">Налог 19,5%</td>
              <td className="py-1 text-right tabular">−5 159</td>
            </tr>
            <tr className="border-t-2 border-night/70">
              <td className="pt-2 text-base font-bold">На руки</td>
              <td className="pt-2 text-right text-base font-bold tabular">₴21 299</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-5 font-mono text-2xs text-night/45">
          Собрано приложением из отмеченных смен. Не является платёжным документом.
        </p>
      </div>

      <Card title="Сверка с расчёткой" hint="Сходится всё, кроме надбавки за ночь — недосчитали ₴642.">
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr>
              <th className="pb-2 text-left lbl">Строка</th>
              <th className="pb-2 text-right lbl">Приложение</th>
              <th className="pb-2 text-right lbl">Расчётка</th>
              <th className="pb-2 text-right lbl">Разница</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Часы', '137', '137', ''],
              ['Ставка', '19 480', '19 480', ''],
              ['Ночные', '2 142', '1 500', '−642'],
              ['Чаевые', '7 700', '7 700', ''],
              ['Питание', '−1 530', '−1 530', ''],
            ].map(([what, mine, theirs, diff]) => (
              <tr key={what} className="border-t border-paper/9">
                <td className="py-2.5 text-dim">{what}</td>
                <td className="py-2.5 text-right tabular">{mine}</td>
                <td className="py-2.5 text-right tabular">{theirs}</td>
                <td className={`py-2.5 text-right tabular ${diff === '' ? 'text-faint' : 'font-bold text-taken'}`}>
                  {diff === '' ? '—' : diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

export const Route = createFileRoute('/_app/report')({ component: Report });
