import { createFileRoute } from '@tanstack/react-router';

import { Plate, Sheet } from '@/components/frame';
import { Button, Field, Pills } from '@/components/ui/kit';
import { MONTH } from '@/mock/data';
import { cn } from '@/lib/utils';

/** Корпус телефона: рамка, чтобы ширина читалась как ладонь, а не как окно. */
function Phone({ tab, children }: { tab: string; children: React.ReactNode }) {
  const tabs = ['Месяц', 'Смена', 'Доска', 'Деньги'];

  return (
    <div className="w-[330px] flex-none overflow-hidden rounded-[32px] border border-paper/17 bg-night p-3">
      <span className="mx-auto mb-3 block h-1 w-24 rounded-full bg-edge-firm" />
      <div className="flex flex-col gap-3.5 px-1.5">{children}</div>
      <div className="mt-3 flex justify-between border-t border-paper/9 px-2 pt-2.5">
        {tabs.map((one) => (
          <span key={one} className={cn('lbl', one === tab && 'text-brass')}>{one}</span>
        ))}
      </div>
    </div>
  );
}

function PhoneScreens() {
  return (
    <Sheet
      kicker="04 · Телефон"
      title="Шириной в ладонь"
      blurb="Те же экраны там, где ими на самом деле пользуются. Из клетки убрано название смены — на ширине пальца остаётся только точка и сумма."
    >
      <Plate
        title="Месяц, живая смена и день"
        path="mobile"
        why="Плитки едут в один ряд вбок, а не стопкой: двенадцать штук в два столбца — это шесть экранов прокрутки до календаря."
      >
        <div className="flex flex-wrap gap-6">
          <Phone tab="Месяц">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">Август</span>
              <span className="grid size-7 place-items-center rounded-full border border-paper/17 text-2xs text-dim">А</span>
            </div>

            <div>
              <span className="lbl">Заработано</span>
              <p className="text-3xl font-extrabold tabular">₴24 700</p>
            </div>

            <div className="flex gap-2 overflow-hidden">
              {[['Твой час', '₴180'], ['Чаевые', '₴7 700']].map(([said, num]) => (
                <span key={said} className="card flex-none basis-[62%] p-3">
                  <span className="lbl">{said}</span>
                  <span className="mt-1 block text-lg font-bold tabular">{num}</span>
                </span>
              ))}
            </div>

            <div>
              <div className="grid grid-cols-7 gap-1 pb-1.5">
                {['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map((d, i) => (
                  <span key={i} className={cn('text-center font-mono text-[0.55rem] text-faint', i >= 5 && 'text-brass')}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {MONTH.slice(0, 35).map((day, i) => (
                  <span
                    key={i}
                    className={cn(
                      'flex min-h-11 flex-col items-center gap-0.5 rounded-md py-1',
                      day.blank ? '' : 'bg-deep',
                      day.today && 'ring-1 ring-brass',
                    )}
                  >
                    <span className={cn('font-mono text-[0.6rem]', day.blank ? 'text-edge-firm' : 'text-dim')}>{day.n}</span>
                    {day.what !== undefined && <span className="size-1 rounded-full bg-brass" />}
                    {day.amount !== undefined && (
                      <span className="font-mono text-[0.55rem] text-money">{day.amount.replace(' ', '')}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </Phone>

          <Phone tab="Смена">
            <div>
              <span className="lbl">Идёт смена</span>
              <p className="text-lg font-bold">🍸 Вечер · бар</p>
            </div>

            <div className="card p-4 text-center">
              <p className="font-mono text-4xl font-bold tabular">3:07:42</p>
              <p className="mt-1 text-2xl font-bold text-money tabular">₴1 640</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
                <span className="block h-full rounded-full bg-brass" style={{ width: '38%' }} />
              </div>
              <p className="hint mt-2">до конца 5:22:18</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button tone="line">Перерыв 15</Button>
              <Button tone="go">Закончить</Button>
            </div>

            <div className="card p-3">
              <span className="lbl">Сегодня уже</span>
              <div className="mt-2 flex flex-col gap-1.5 font-mono text-xs">
                <span className="flex justify-between"><span className="text-dim">начали</span><span>17:12</span></span>
                <span className="flex justify-between"><span className="text-dim">перерыв</span><span>30 мин</span></span>
                <span className="flex justify-between"><span className="text-dim">гостей</span><span>64</span></span>
              </div>
            </div>
          </Phone>

          <Phone tab="Деньги">
            <div>
              <span className="lbl">Ближайшие деньги</span>
              <p className="text-3xl font-extrabold text-money tabular">₴16 590</p>
              <p className="hint mt-1">через 5 дней · Бар «Сова»</p>
            </div>

            <div className="card p-3">
              <span className="lbl">Ждём</span>
              <div className="mt-2 flex flex-col">
                {[
                  ['16–30 июня', '₴9 260', '+57 дн.'],
                  ['1–15 июля', '₴17 274', '+42 дн.'],
                  ['16–31 августа', '₴16 590', ''],
                ].map(([span, sum, late]) => (
                  <span key={span} className="flex items-center justify-between gap-2 border-b border-paper/9 py-2 last:border-0">
                    <span className="min-w-0">
                      <span className="block font-mono text-2xs text-faint">{span}</span>
                      {late !== '' && <span className="font-mono text-2xs text-taken">{late}</span>}
                    </span>
                    <span className="font-mono text-xs tabular">{sum}</span>
                  </span>
                ))}
              </div>
            </div>

            <Field label="Чаевые за смену" value="400" />
          </Phone>

          <Phone tab="Доска">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">Подработки</span>
            </div>
            <Pills options={['разовые', 'постоянные']} value="разовые" />

            {[
              ['Бармен на вечер', 'Бар «Хмель» · сегодня', '₴250/ч', '+6%'],
              ['Хостес на открытие', 'Terrace 42 · 7 сент.', '₴1 900', '+2%'],
            ].map(([title, where, pay, worth]) => (
              <div key={title} className="card flex flex-col gap-1 p-3">
                <span className="text-sm font-semibold">{title}</span>
                <span className="hint">{where}</span>
                <span className="flex items-baseline justify-between">
                  <span className="text-lg font-bold tabular">{pay}</span>
                  <span className="text-xs font-semibold text-money">{worth}</span>
                </span>
              </div>
            ))}
          </Phone>
        </div>
      </Plate>
    </Sheet>
  );
}

export const Route = createFileRoute('/phone')({ component: PhoneScreens });
