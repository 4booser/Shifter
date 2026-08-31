import { createFileRoute } from '@tanstack/react-router';

import { Plate, Sheet } from '@/components/frame';
import { Button, Field, Pills, Switch } from '@/components/ui/kit';
import { MONTH, YEAR_MONTHS } from '@/mock/data';
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

      <Plate
        title="День, год и команда"
        path="mobile"
        why="Панель дня на телефоне становится отдельным экраном: сбоку её ставить некуда. Год сжимается до сетки квадратов, потому что двенадцать столбцов в ладонь не влезают."
      >
        <div className="flex flex-wrap gap-6">
          <Phone tab="Месяц">
            <div className="flex items-center gap-2">
              <span className="text-2xs text-faint">←</span>
              <span className="text-base font-bold">Понедельник, 31</span>
            </div>

            <div>
              <span className="lbl">Заработано за день</span>
              <p className="text-3xl font-extrabold text-money tabular">₴1 640</p>
            </div>

            <div className="card p-3 font-mono">
              <div className="flex justify-between text-xs">
                <span className="text-dim">Вечер · бар</span>
                <span>17:00–01:00</span>
              </div>
              <div className="mt-1 flex justify-between text-[0.65rem] text-faint">
                <span>по факту</span>
                <span>17:12–01:40</span>
              </div>
              <div className="tear my-2.5" />
              <div className="flex justify-between text-xs">
                <span className="text-dim">8,0 ч × ₴200</span>
                <span>1 600</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-dim">Чаевые</span>
                <span>400</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-dim">Питание</span>
                <span className="text-taken">−90</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Чаевые" value="400" />
              <Field label="Гостей" value="64" />
            </div>

            <Pills options={['зал', 'бар', 'терраса']} value="бар" />
          </Phone>

          <Phone tab="Деньги">
            <div>
              <span className="lbl">2026</span>
              <p className="text-3xl font-extrabold text-money tabular">₴223 687</p>
              <p className="hint mt-1">119 смен · 940 часов</p>
            </div>

            <div className="flex h-16 items-end gap-1">
              {YEAR_MONTHS.map((month, i) => (
                <span key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className="w-full rounded-t-sm bg-brass"
                    style={{ height: `${Math.max(4, month.v)}%`, opacity: month.v === 70 ? 1 : 0.45 }}
                  />
                  <span className="font-mono text-[0.5rem] text-faint">{month.m}</span>
                </span>
              ))}
            </div>

            <div className="card p-3">
              <span className="lbl">Год по дням</span>
              <div className="mt-2 grid grid-flow-col grid-rows-7 gap-[2px] overflow-hidden">
                {Array.from({ length: 168 }, (_, i) => {
                  const worked = i % 7 !== 0 && i % 7 !== 1 && i < 120;
                  return (
                    <span
                      key={i}
                      className="size-[7px] rounded-[1px]"
                      style={{ background: worked ? '#e0a45b' : '#232120', opacity: worked ? 0.4 + ((i * 31) % 60) / 100 : 1 }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="card p-3">
              <span className="lbl">Рекорд</span>
              <p className="mt-1 text-lg font-bold tabular">5 дней подряд</p>
            </div>
          </Phone>

          <Phone tab="Доска">
            <div>
              <span className="lbl">Смена «Сова»</span>
              <p className="text-base font-bold">31 авг — 6 сент</p>
            </div>

            <div className="card p-3">
              {[
                ['Аня', 'вы', '#e0a45b', 'ср чт пт'],
                ['Ира', '', '#7fbf7a', 'пн ср чт сб'],
                ['Костя', 'просит подмену', '#d9705f', 'пн вт чт'],
              ].map(([name, role, colour, days]) => (
                <span key={name} className="flex items-center gap-2 border-b border-paper/9 py-2 last:border-0">
                  <span className="size-2 flex-none rounded-full" style={{ background: colour }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs">{name} {role !== '' && <span className="text-faint">· {role}</span>}</span>
                    <span className="font-mono text-[0.6rem] text-faint">{days}</span>
                  </span>
                </span>
              ))}
            </div>

            <div className="card border-taken/40 p-3">
              <span className="lbl">Просят подменить</span>
              <p className="mt-1 text-xs">Костя · чт 3 сент · 17:00–01:00</p>
              <Button tone="go" size="sm" className="mt-2 w-full">Подменю</Button>
            </div>
          </Phone>

          <Phone tab="Смена">
            <div>
              <span className="lbl">Настройки</span>
              <p className="text-base font-bold">Как это выглядит</p>
            </div>

            <div className="card p-3">
              <span className="lbl">Тема</span>
              <Pills className="mt-2" options={['система', 'ночь', 'бумага']} value="ночь" />
            </div>

            <div className="card flex flex-col gap-3 p-3">
              <Switch on label="Заработок в клетке" />
              <Switch label="Прятать суммы" />
              <Switch on label="Напомнить закрыть смену" />
            </div>

            <div className="card p-3">
              <span className="lbl">Аккаунт</span>
              <p className="mt-1 text-sm">Аня · anya</p>
              <Button tone="line" size="sm" className="mt-2 w-full">Выйти</Button>
            </div>
          </Phone>
        </div>
      </Plate>
    </Sheet>
  );
}

export const Route = createFileRoute('/kit/phone')({ component: PhoneScreens });
