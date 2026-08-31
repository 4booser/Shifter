import { createFileRoute, Link } from '@tanstack/react-router';
import { Printer, Share2 } from 'lucide-react';

import { Head } from '@/components/screen';
import { Bars, Button, Card, Pills } from '@/components/ui/kit';

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
          <p className="text-3xl font-extrabold tabular">₴38 770</p>
        </div>

        <table className="mt-5 w-full border-collapse font-mono text-sm">
          <tbody>
            {[
              ['Смены · 163 ч', '29 975'],
              ['Чаевые', '7 700'],
              ['Надбавки за ночь', '1 095'],
              ['Отдано в котёл', '−385'],
              ['Питание · 20 смен', '−1 800'],
            ].map(([what, sum]) => (
              <tr key={what} className="border-b border-night/10">
                <td className="py-2 text-night/70">{what}</td>
                <td className="py-2 text-right tabular">{sum}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-3 font-semibold">Итого до налога</td>
              <td className="pt-3 text-right font-semibold tabular">36 585</td>
            </tr>
            <tr>
              <td className="py-1 text-night/70">Налог 19,5%</td>
              <td className="py-1 text-right tabular">−5 845</td>
            </tr>
            <tr className="border-t-2 border-night/70">
              <td className="pt-2 text-base font-bold">На руки</td>
              <td className="pt-2 text-right text-base font-bold tabular">₴30 740</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-5 font-mono text-2xs text-night/45">
          Собрано приложением из отмеченных смен. Не является платёжным документом.
        </p>
      </div>

      {/* Разбор ниже листа: то, что в печатный отчёт не влезает, но из-за
          чего его и открывают. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="По местам" hint="Одно место — одна строка. Итог по всем сразу смешал бы ставки.">
          <div className="flex flex-col">
            {[
              { name: 'Бар «Полночь»', days: 16, hours: 133, earned: '₴32 100', per: '₴241/ч' },
              { name: 'Ресторан «Веранда»', days: 3, hours: 23, earned: '₴5 030', per: '₴219/ч' },
              { name: 'Подработка', days: 1, hours: 7, earned: '₴1 640', per: '₴234/ч' },
            ].map((one) => (
              <div key={one.name} className="border-b border-paper/9 py-2.5 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm">{one.name}</span>
                  <span className="font-mono text-sm font-semibold tabular">{one.earned}</span>
                </div>
                <p className="lbl">
                  {one.days} смен · {one.hours} ч · {one.per}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Чаевые по залам" hint="За час, действительно проведённый там.">
          <Bars
            rows={[
              { name: 'Бар', under: '77 ч', share: 100, value: '₴68/ч', tone: 'brass' },
              { name: 'Терраса', under: '24 ч', share: 62, value: '₴42/ч' },
              { name: 'Зал', under: '62 ч', share: 39, value: '₴26/ч' },
            ]}
          />
          <p className="hint mt-3 border-t border-paper/9 pt-3">
            За стойкой чаевые вдвое гуще, чем в зале, — при той же ставке.
          </p>
        </Card>
      </div>

      {/* Сверка с расчёткой стояла здесь второй копией той же таблицы — и
          расходилась с оригиналом, потому что правили одну. Она живёт на
          своей странице. */}
      <Card title="Сверить с расчёткой" hint="Что насчитало приложение против того, что написано в бумаге.">
        <p className="text-sm text-dim">
          За август расходится надбавка за ночь: ₴1 095 против ₴700, и ночных часов в бумаге
          насчитали 46 вместо 62.
        </p>
        <div className="mt-3">
          <Link to="/payslip">
            <Button tone="line" size="sm">Открыть сверку</Button>
          </Link>
        </div>
      </Card>
    </>
  );
}

export const Route = createFileRoute('/_app/report')({ component: Report });
