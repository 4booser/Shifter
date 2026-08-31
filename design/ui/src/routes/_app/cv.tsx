import { createFileRoute } from '@tanstack/react-router';
import { Printer } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Switch } from '@/components/ui/kit';
import { shifts } from '@/lib/plural';

/**
 * Послужной список.
 *
 * Единственный экран, который печатают и отдают в руки, — поэтому он и
 * выглядит как лист бумаги, а не как ещё одна тёмная карточка. Светлое
 * пятно посреди приложения говорит без подписи: вот это уйдёт наружу.
 *
 * Ставок на листе нет, пока их не попросят показать: сколько человек
 * стоит — его дело, а не строка в справке.
 */
const WORK = [
  { place: 'Бар «Полночь»', role: 'Бармен', from: 'март 2024', to: 'сейчас', shifts: 214, hours: 1712, rate: '₴200' },
  { place: 'Кофейня «Зерно»', role: 'Бариста', from: 'июнь 2023', to: 'февраль 2024', shifts: 96, hours: 672, rate: '₴160' },
  { place: 'Ресторан «Веранда»', role: 'Официант', from: 'сентябрь 2022', to: 'май 2023', shifts: 71, hours: 568, rate: '₴140' },
];

function Cv() {
  return (
    <>
      <Head
        said="О себе"
        title="Послужной список"
        hint="Собран из ваших смен — не из того, что вы о себе написали. Печатается на одну страницу."
        right={
          <Button tone="go">
            <Printer className="size-4" />
            Распечатать
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Лист. Тёмная тема кончается на его краю: то, что печатают, должно
            выглядеть напечатанным. */}
        <article className="rounded-[var(--radius-card)] bg-paper p-8 text-night sm:p-10">
          <header className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-night pb-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-[-0.03em]">Анна Ковалевская</h2>
              <p className="mt-0.5 text-sm text-night/60">Бармен · Киев</p>
            </div>
            <p className="font-mono text-xs text-night/50">Составлено 1 сентября 2026</p>
          </header>

          <div className="grid grid-cols-2 gap-6 border-b border-night/15 py-5 sm:grid-cols-4">
            {[
              { n: '3 г. 6 мес.', what: 'в профессии' },
              { n: '381', what: 'смена' },
              { n: '2 952', what: 'часа' },
              { n: '3', what: 'места' },
            ].map((one) => (
              <div key={one.what}>
                <p className="font-mono text-xl font-bold tabular">{one.n}</p>
                <p className="mt-0.5 text-xs tracking-[0.08em] text-night/50 uppercase">{one.what}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col">
            {WORK.map((one) => (
              <div key={one.place} className="border-b border-night/10 py-4 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-bold">{one.place}</h3>
                  <span className="font-mono text-xs text-night/50">
                    {one.from} — {one.to}
                  </span>
                </div>
                <p className="mt-1 text-sm text-night/70">{one.role}</p>
                <p className="mt-2 font-mono text-xs text-night/50 tabular">
                  {one.shifts} {shifts(one.shifts)} · {one.hours} ч
                </p>
              </div>
            ))}
          </div>

          <p className="mt-6 border-t border-night/15 pt-4 text-xs text-night/45">
            Каждая строка отмечена в день смены, а не восстановлена по памяти при увольнении.
          </p>
        </article>

        <div className="flex flex-col gap-4">
          <Card title="Что попадёт на лист">
            <div className="flex flex-col gap-3">
              <Switch on label="Места и должности" />
              <Switch on label="Смены и часы" />
              <Switch label="Ставки" hint="По умолчанию скрыты: это ваше дело." />
              <Switch label="Телефон и почта" />
            </div>
          </Card>

          <Card title="Кому это нужно" hint="Три года за стойкой обычно нечем подтвердить.">
            <p className="text-sm text-dim">
              Новое место спрашивает опыт и верит на слово. Здесь опыт посчитан по дням, в которые
              вы действительно выходили.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/cv')({ component: Cv });
