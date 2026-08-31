import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { CalendarDays, ChevronLeft, ChevronRight, Download, LayoutGrid } from 'lucide-react';

import { Head } from '@/components/screen';
import { Bars, Button, Card, Empty, Split } from '@/components/ui/kit';
import { YEAR_MONTHS } from '@/mock/data';
import { cn } from '@/lib/utils';

/**
 * Год.
 *
 * Единственный экран, который показывают другим: его снимают и кидают в
 * чат. Поэтому крупные цифры стоят наверху и читаются с расстояния вытянутой
 * руки, а разбор — ниже, для того, кто досмотрел.
 */
const RHYTHM = [
  { day: 'пн', share: 12 },
  { day: 'вт', share: 18 },
  { day: 'ср', share: 61 },
  { day: 'чт', share: 68 },
  { day: 'пт', share: 92 },
  { day: 'сб', share: 100 },
  { day: 'вс', share: 54 },
];

/** Год карточками 9:16 — тем же набором фактов, но в форме, которую шлют. */
const STORY = [
  { big: '₴223 687', small: 'заработано за год', foot: 'на 12% больше прошлого' },
  { big: '940', small: 'часов на ногах', foot: '119 смен' },
  { big: '₴238', small: 'стоил ваш час', foot: 'был ₴212' },
  { big: '₴65 490', small: 'чаевых', foot: '29% всего заработка' },
  { big: '178', small: 'ночных часов', foot: '19% времени' },
  { big: '9', small: 'дней подряд', foot: 'самая длинная череда' },
];

function Wrapped() {
  const [cards, setCards] = useState(false);
  const [nothing, setNothing] = useState(false);

  if (nothing) {
    return (
      <>
        <Head said="Итоги" title="2026" />
        <Empty
          glyph={<CalendarDays className="size-7" />}
          title="В этом году пока ничего"
          said="Отметьте первую смену — и здесь начнёт собираться год. Одной хватит, чтобы появилась первая цифра."
          action="Открыть календарь"
        />
        <button type="button" onClick={() => setNothing(false)} className="self-start">
          <Button tone="quiet" size="sm">Вернуть год</Button>
        </button>
      </>
    );
  }

  return (
    <>
      <Head
        said="Итоги"
        title="2026"
        right={
          <>
            <Button size="icon" tone="line"><ChevronLeft className="size-4" /></Button>
            <Button size="icon" tone="line"><ChevronRight className="size-4" /></Button>
            <button type="button" onClick={() => setCards((was) => !was)}>
              <Button tone="line" size="sm">
                <LayoutGrid className="size-3.5" />
                {cards ? 'Одной страницей' : 'Показать карточками'}
              </Button>
            </button>
            <Button tone="go" size="sm">
              <Download className="size-3.5" />
              Скачать постер
            </Button>
          </>
        }
      />

      {cards ? (
        /* Те же цифры, но по одной на карточку: так их и пересылают —
           поодиночке, а не страницей. */
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
          {STORY.map((one) => (
            <article
              key={one.small}
              className="card relative flex aspect-[9/16] w-[260px] flex-none snap-start flex-col justify-between overflow-hidden p-6"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(120% 70% at 50% 0%, rgba(224,164,91,0.14), transparent 60%)',
                }}
              />
              <span className="relative lbl">Shifter · 2026</span>
              <span className="relative">
                <span className="block text-4xl font-extrabold tracking-[-0.04em] tabular">
                  {one.big}
                </span>
                <span className="mt-1 block text-sm text-dim">{one.small}</span>
              </span>
              <span className="relative hint">{one.foot}</span>
            </article>
          ))}
        </div>
      ) : (
      <section className="card relative overflow-hidden p-10 text-center">
        <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center text-[15rem] leading-none font-black text-paper/[0.03]">
          2026
        </span>
        <div className="relative">
          <p className="text-5xl font-extrabold text-money tabular">₴223 687</p>
          <p className="hint mt-2">119 смен · 940 часов · ₴238 за час</p>
          <div className="mx-auto mt-7 flex h-28 max-w-lg items-end justify-center gap-2">
            {YEAR_MONTHS.map((month, i) => (
              // h-full обязателен: без него процентная высота столбика
              // считается от нулевой высоты колонки, и график исчезает.
              <span key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
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
      )}

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
          {/* «Смены» и «ночные» — не два разных источника: ночная надбавка
              начисляется внутри смены. Части названы так же, как на
              статистике, иначе год и месяц считают разное. */}
          <Split parts={[
            { name: 'ставка', share: 64, colour: '#e0a45b' },
            { name: 'чаевые', share: 27, colour: '#7fbf7a' },
            { name: 'надбавки', share: 9, colour: '#b5ada3' },
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

        <Card title="Куда идёт год" hint="Если дальше тем же ходом.">
          <p className="text-2xl font-bold tabular">₴298 200</p>
          <p className="hint mt-1">
            к 31 декабря. Осталось четыре месяца и, по нынешнему ходу, ещё 38 смен.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-paper/9 pt-4">
            {[
              ['Целей закрыто', '7 из 12'],
              ['Самый дорогой час', '₴412'],
              ['Дней без работы', '119'],
              ['Дольше всего подряд', '9 дней'],
            ].map(([what, value]) => (
              <div key={what}>
                <dt className="lbl">{what}</dt>
                <dd className="text-sm font-semibold tabular">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="hint mt-3">
            «Самый дорогой час» — за всё время, а не за этот год: 31 декабря 2025-го, ₴412.
          </p>
        </Card>

        <Card title="Ритм недели" hint="Какая доля года пришлась на каждый день.">
          <div className="flex h-28 items-end gap-2">
            {RHYTHM.map((one) => (
              <span key={one.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span
                  className={cn(
                    'w-full rounded-t',
                    one.share === 100 ? 'bg-brass' : 'bg-brass/45',
                  )}
                  style={{ height: `${one.share}%` }}
                />
                <span className="lbl">{one.day}</span>
              </span>
            ))}
          </div>
          <p className="hint mt-3 border-t border-paper/9 pt-3">
            Суббота — каждая. Понедельник — четыре раза за год, и все четыре в декабре.
          </p>
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

      <button type="button" onClick={() => setNothing(true)} className="self-start">
        <Button tone="quiet" size="sm">Показать пустой год</Button>
      </button>
    </>
  );
}

export const Route = createFileRoute('/_app/wrapped')({ component: Wrapped });
