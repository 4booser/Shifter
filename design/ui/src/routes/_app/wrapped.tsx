import { createFileRoute } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Head } from '@/components/screen';
import { Bars, Button, Card, Split } from '@/components/ui/kit';
import { YEAR_MONTHS } from '@/mock/data';

function Wrapped() {
  return (
    <>
      <Head
        said="Итоги"
        title="2026"
        right={
          <>
            <Button size="icon" tone="line"><ChevronLeft className="size-4" /></Button>
            <Button size="icon" tone="line"><ChevronRight className="size-4" /></Button>
          </>
        }
      />

      <section className="card relative overflow-hidden p-10 text-center">
        <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center text-[15rem] leading-none font-black text-paper/[0.03]">
          2026
        </span>
        <div className="relative">
          <p className="text-5xl font-extrabold text-money tabular">₴223 687</p>
          <p className="hint mt-2">119 смен · 940 часов · ₴238 за час</p>
          <div className="mx-auto mt-7 flex h-28 max-w-lg items-end justify-center gap-2">
            {YEAR_MONTHS.map((month, i) => (
              <span key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className="w-full rounded-t bg-brass"
                  style={{ height: `${Math.max(3, month.v)}%`, opacity: month.v === 70 ? 1 : 0.45 }}
                />
                <span className="font-mono text-2xs text-faint">{month.m}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <Card title="Ваш год словами">
        <p className="text-base leading-relaxed text-dim">
          В 2026 году вы отработали 119 смен — 940 часов, и они принесли ₴223 687. Час вашего
          года стоил ₴238 — на 12% больше, чем годом раньше. Чаевые принесли ₴65 490, это 29%
          от всего. 19% этих часов были ночными. ₴12 460 удержано штрафами и питанием.
        </p>
      </Card>

      <Card title="Год по дням" hint="Чем гуще квадрат, тем больше принёс день.">
        <div className="grid grid-flow-col grid-rows-7 gap-[3px] overflow-x-auto pb-1">
          {Array.from({ length: 245 }, (_, i) => {
            const worked = i % 7 !== 0 && i % 7 !== 1 && i < 168;

            return (
              <span
                key={i}
                className="size-2.5 rounded-[2px]"
                style={{ background: worked ? '#e0a45b' : '#232120', opacity: worked ? 0.35 + ((i * 37) % 60) / 100 : 1 }}
              />
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Из чего сложился год">
          <p className="mb-3 text-2xl font-bold tabular">₴223 687</p>
          <Split parts={[
            { name: 'смены', share: 64, colour: '#e0a45b' },
            { name: 'чаевые', share: 27, colour: '#7fbf7a' },
            { name: 'ночные', share: 9, colour: '#b5ada3' },
          ]} />
        </Card>

        <Card title="Рекорды года">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
            {[
              ['Лучший день', '₴2 580', '6 февраля'],
              ['Лучший месяц', '₴40 079', 'май'],
              ['Самая длинная смена', '8,5 ч', '3 января'],
              ['Без выходного', '5 дней', 'подряд'],
            ].map(([what, value, when]) => (
              <div key={what}>
                <dt className="lbl">{what}</dt>
                <dd className="text-lg font-bold tabular">{value}</dd>
                <dd className="hint">{when}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Где чаевые были гуще" hint="За час, действительно проведённый там.">
          <Bars rows={[
            { name: 'бар', under: '400 ч · 47 см.', share: 100, value: '₴105/ч', tone: 'brass' },
            { name: 'зал', under: '540 ч · 72 см.', share: 41, value: '₴43/ч' },
          ]} />
        </Card>

        <Card title="И ещё вот столько" hint="То, что обычно проходит мимо счёта.">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
            {[
              ['Ушло налогом', '₴33 917'], ['Отдано в котёл', '₴3 275'],
              ['Удержано', '₴12 460'], ['Гостей обслужено', '5 751'],
              ['Средний чек', '₴156'], ['Ночных часов', '178'],
            ].map(([what, value]) => (
              <div key={what}>
                <dt className="lbl">{what}</dt>
                <dd className="text-sm font-semibold tabular">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/wrapped')({ component: Wrapped });
