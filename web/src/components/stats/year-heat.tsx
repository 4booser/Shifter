'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { todayKey } from '@/lib/calendar/calendar-date';
import { HeatCell, heatGrid } from '@/lib/stats/year-heat';
import { useRouter } from 'next/navigation';

import { calendarActions, useCalendar } from '@/lib/store/calendar';
import { useMoney } from '@/lib/settings/money';
import { useI18n } from '@/lib/i18n';
import { Panel } from './panel';

/**
 * The year as a strip of week columns — where the season fed the wallet and
 * where it starved it. An empty cell is a day nobody recorded; a cold one is
 * a recorded zero. Those are different facts and get different paint.
 */
export function YearHeat() {
  const { t, lang } = useI18n();
  const { format } = useMoney();

  const router = useRouter();
  const [days, setDays] = useState<{ date: string; earned: number }[] | null>(null);
  const [picked, setPicked] = useState<HeatCell | null>(null);

  useEffect(() => {
    const today = todayKey();
    const start = new Date(`${today}T12:00:00`);

    start.setDate(start.getDate() - 53 * 7);

    const from = start.toISOString().slice(0, 10);

    void calendarApi
      .days(from, today)
      .then((summary) => setDays(summary.days.map((day) => ({ date: day.date, earned: day.earned }))))
      .catch(() => setDays([]));
  }, []);

  /*
   * Сетка начинается с первой недели, где вообще есть запись.
   *
   * Полный год назад — это у большинства полкарточки пустых клеток: аккаунт
   * заведён весной, а сетка тянется с прошлой осени, и сначала идут пять
   * месяцев серого, потом данные. Пустая половина не сообщает ничего, кроме
   * того, что человек тогда не пользовался приложением.
   */
  const grid = useMemo(() => {
    if (days === null) return null;

    const full = heatGrid(days, todayKey());
    // Первая неделя, в которой вообще есть запись.
    const from = full.weeks.findIndex((week) => week.some((cell) => cell.earned !== null));

    if (from <= 0) return full;

    /*
     * Ведущие пустые недели срезаются.
     *
     * heatGrid всегда строит пятьдесят три колонки до сегодня — он зеркалится
     * в мобильном, и менять его форму нельзя. Но у аккаунта, заведённого
     * весной, первые пять месяцев — это полкарточки серых клеток, которые
     * сообщают ровно одно: тогда человек приложением не пользовался. Подписи
     * месяцев сдвигаются вместе с колонками, иначе «авг.» встанет над
     * неделями марта.
     */
    return {
      weeks: full.weeks.slice(from),
      months: full.months
        .filter((month) => month.index >= from)
        .map((month) => ({ ...month, index: month.index - from })),
    };
  }, [days]);

  // The strip opens on the freshest weeks; the far left is a year ago.
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (grid !== null && strip.current !== null)
      strip.current.scrollLeft = strip.current.scrollWidth;
  }, [grid]);

  if (grid === null || days === null || days.length < 30) return null;

  const monthName = (month: number) =>
    new Date(2026, month - 1, 15).toLocaleDateString(lang, { month: 'short' });

  const say = (cell: HeatCell) => {
    const label = new Date(`${cell.date}T12:00:00`).toLocaleDateString(lang, {
      day: 'numeric',
      month: 'long',
    });

    if (cell.earned === null) return `${label} — ${t('not recorded')}`;

    return `${label} · ${format(cell.earned)}`;
  };

  return (
    <Panel
      title={t('The year in squares')}
      hint={t('Colour is the earnings quartile among the paid days. An empty cell is a day without a record — that is not a zero.')}
      /* Легенда «меньше — больше» переехала в шапку карточки: снизу она стояла
         в одной строке с наведённой подсказкой и они толкали друг друга. */
      action={
        <span className="flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-widest text-faint">
          {t('less')}
          {[14, 32, 55, 78, 100].map((share) => (
            <i
              key={share}
              className="inline-block h-3.5 w-3.5 rounded-[3px]"
              style={{ background: `color-mix(in oklab, var(--accent) ${share}%, var(--surface))` }}
            />
          ))}
          {t('more')}
        </span>
      }
    >
      {/* Клетка была ровно одиннадцать пикселей, и полсотни недель занимали
          семьсот из тысячи девятисот — половина карточки уходила в пустоту.
          Теперь неделя — доля ширины, с потолком, чтобы квадрат оставался
          квадратом на коротком годе. Подписи месяцев тоже в долях: пиксельный
          отступ разъехался бы с первой же растяжкой. */}
      {/* Клетка тянется под ширину карточки, но не больше 26 px: год из
          двадцати девяти недель занимал половину карточки, а остальное было
          пустым полем. Потолок держит клетку клеткой, а не плиткой. */}
      <div ref={strip} className="overflow-x-auto pb-1">
        <div className="mx-auto" style={{ maxWidth: `${grid.weeks.length * 26 + (grid.weeks.length - 1) * 4 + 32}px` }}>
          {/*
            Подписи стоят в той же сетке, что и клетки.

            Раньше клетка была фиксированные 18 px, а подпись месяца — доля
            ширины карточки. Пятьдесят три недели — это 954 px, подписи же
            растягивались на всю тысячу с лишним: «авг.» и «сент.» оказывались
            правее последней клетки, над пустотой. Одна сетка на обе строки —
            и разъехаться им больше негде.
          */}
          <div
            className="ml-8 grid h-4 gap-[4px] text-[0.62rem] text-faint"
            style={{ gridTemplateColumns: `repeat(${grid.weeks.length}, minmax(0, 1fr))` }}
          >
            {grid.months.map((month) => (
              <span
                key={`${month.index}-${month.label}`}
                className="whitespace-nowrap"
                style={{ gridColumnStart: month.index + 1 }}
              >
                {monthName(month.label)}
              </span>
            ))}
          </div>

          <div className="mt-1 flex items-start gap-[3px]">
            {/* Семь строк той же сетки, а не семь блоков по 18 px: клетка
                теперь тянется под ширину карточки, и жёсткая высота подписи
                разъезжалась с рядами — «Пт» оказывалась над субботой. */}
            <div
              className="grid w-8 flex-none gap-[4px] pr-1 text-right text-[0.62rem] text-faint"
              style={{ gridTemplateRows: 'repeat(7, 1fr)' }}
            >
              {[t('Mon'), '', t('Wed'), '', t('Fri'), '', t('Sun')].map((label, row) => (
                <div key={row} className="flex items-center justify-end">{label}</div>
              ))}
            </div>

            {/* Шестнадцать пикселей вместо одиннадцати: полсотни недель
                занимают тысячу с небольшим и заполняют карточку, а не жмутся
                в семьсот. Размер задан жёстко и обеим сторонам сразу —
                `aspect-square` брал высоту у растянутой строки и раздувал
                клетку до двадцати шести, так что соседние сливались в
                сплошные полосы. Узкий экран прокручивает, как и прежде. */}
            <div
              className="grid flex-1 gap-[4px]"
              style={{ gridTemplateColumns: `repeat(${grid.weeks.length}, minmax(0, 1fr))` }}
            >
            {grid.weeks.map((week, index) => (
              <div key={index} className="grid gap-[4px]">
                {week.map((cell) => (
                  <button
                    key={cell.date}
                    type="button"
                    aria-label={say(cell)}
                    /* Числа в клетках не печатаются — при пятидесяти трёх
                       колонках они нечитаемы. Величину несёт цвет, точную
                       сумму — подсказка браузера. */
                    title={say(cell)}
                    onMouseEnter={() => setPicked(cell)}
                    onFocus={() => setPicked(cell)}
                    onMouseLeave={() => setPicked(null)}
                    onClick={() => {
                      // The hover already names the date; a click owes the
                      // reader the day itself.
                      useCalendar.setState({
                        month: { year: Number(cell.date.slice(0, 4)), month: Number(cell.date.slice(5, 7)) },
                      });
                      calendarActions.select(cell.date);
                      router.push('/dashboard');
                    }}
                    className="aspect-square w-full rounded-[3px] border"
                    style={
                      cell.level === null
                        ? { borderColor: 'var(--border)', background: 'transparent' }
                        : {
                            borderColor: 'transparent',
                            background: `color-mix(in oklab, var(--accent) ${[14, 32, 55, 78, 100][cell.level]}%, var(--surface))`,
                          }
                    }
                  />
                ))}
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 min-h-[1rem] text-[0.72rem] text-muted">{picked !== null ? say(picked) : ''}</p>
    </Panel>
  );
}
