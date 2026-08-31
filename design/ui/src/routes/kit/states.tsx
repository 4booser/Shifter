import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, Check, CloudOff, Loader2, Undo2, WifiOff } from 'lucide-react';

import { Plate, Sheet } from '@/components/frame';
import { Button, Card, Field } from '@/components/ui/kit';
import { cn } from '@/lib/utils';

/**
 * Состояния.
 *
 * То, чем платный продукт отличается от макета: что происходит, пока грузится,
 * когда сорвалось, когда нечего показать и когда человек ошибся. Дизайн, у
 * которого нарисовано только «всё хорошо», в проде разваливается именно здесь.
 */

/** Ряд одного примитива во всех его состояниях сразу. */
function Rank({ what, children }: { what: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(6rem,auto)_1fr] items-center gap-4 border-b border-paper/9 py-3 last:border-0">
      <span className="lbl">{what}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function States() {
  return (
    <Sheet
      kicker="08 · Состояния"
      title="Что происходит, когда что-то происходит"
      blurb="Загрузка, ошибка, пусто, отключено, наведение, фокус. Здесь продукт и отличается от картинки: у картинки всё всегда получилось."
    >
      <Plate
        title="Кнопки"
        path="состояния"
        why="Занятая кнопка не исчезает и не прыгает: у неё та же ширина, тот же текст, и крутилка вместо стрелки. Иначе палец промахивается по переехавшей кнопке."
      >
        <Card>
          <Rank what="Обычно">
            <Button tone="go">Сохранить</Button>
            <Button tone="line">Отмена</Button>
            <Button tone="quiet">Ещё</Button>
          </Rank>
          <Rank what="Наведение">
            <span className="inline-flex h-10 items-center rounded-[var(--radius-field)] bg-brass-lit px-4 text-sm font-semibold text-night">
              Сохранить
            </span>
            <span className="inline-flex h-10 items-center rounded-[var(--radius-field)] border border-paper/17 bg-paper/5 px-4 text-sm font-semibold">
              Отмена
            </span>
          </Rank>
          <Rank what="Фокус">
            <span className="inline-flex h-10 items-center rounded-[var(--radius-field)] bg-brass px-4 text-sm font-semibold text-night outline-2 outline-offset-2 outline-brass">
              Сохранить
            </span>
          </Rank>
          <Rank what="Занята">
            <span className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-field)] bg-brass px-4 text-sm font-semibold text-night opacity-70">
              <Loader2 className="size-4 animate-spin" />
              Сохранить
            </span>
          </Rank>
          <Rank what="Нельзя">
            <span className="inline-flex h-10 items-center rounded-[var(--radius-field)] bg-brass px-4 text-sm font-semibold text-night opacity-40">
              Сохранить
            </span>
            <span className="hint">Пока не заполнено название</span>
          </Rank>
          <Rank what="Получилось">
            <span className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-field)] bg-money px-4 text-sm font-semibold text-night">
              <Check className="size-4" />
              Сохранено
            </span>
          </Rank>
        </Card>
      </Plate>

      <Plate
        title="Поля"
        path="ввод и ошибки"
        why="Ошибка говорит, что не так и что сделать. «Неверное значение» — это не сообщение, это отписка."
      >
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <Field label="Пусто" placeholder="Например, 200" />
              <Field label="Заполнено" value="200" />
              <label className="flex flex-col gap-1.5">
                <span className="lbl">В фокусе</span>
                <span className="flex min-h-10 items-center rounded-[var(--radius-field)] border border-brass bg-night px-3 py-2.5 font-mono text-sm outline-2 outline-offset-2 outline-brass/30">
                  200
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Не сходится</span>
                <span className="flex min-h-10 items-center rounded-[var(--radius-field)] border border-taken bg-night px-3 py-2.5 font-mono text-sm">
                  900
                </span>
                <span className="flex items-start gap-1.5 text-xs text-taken">
                  <AlertTriangle className="mt-0.5 size-3.5 flex-none" />
                  Наличных больше, чем всех чаевых. Поднимите общую сумму или уменьшите эту.
                </span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="lbl">Только чтение</span>
                <span className="flex min-h-10 items-center rounded-[var(--radius-field)] border border-paper/9 bg-table px-3 py-2.5 font-mono text-sm text-faint">
                  ₴1 890
                </span>
                <span className="hint">Считает сервер — руками не меняется.</span>
              </label>
            </div>
          </div>
        </Card>
      </Plate>

      <Plate
        title="Пока грузится"
        path="скелеты"
        why="Скелет повторяет форму того, что придёт: карточку карточкой, строку строкой. Крутилка на весь экран говорит только «ждите» и заставляет гадать, чего именно."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Плитки">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-paper/9 p-4">
                  <span className="block h-2 w-16 animate-pulse rounded-full bg-raised" />
                  <span className="mt-3 block h-6 w-24 animate-pulse rounded-md bg-raised" />
                  <span className="mt-2 block h-2 w-20 animate-pulse rounded-full bg-raised" />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Список">
            <div className="flex flex-col">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="flex items-center gap-3 border-b border-paper/9 py-3 last:border-0">
                  <span className="size-8 flex-none animate-pulse rounded-full bg-raised" />
                  <span className="flex-1">
                    <span className="block h-2.5 w-32 animate-pulse rounded-full bg-raised" />
                    <span className="mt-1.5 block h-2 w-20 animate-pulse rounded-full bg-raised" />
                  </span>
                  <span className="h-3 w-14 animate-pulse rounded-full bg-raised" />
                </span>
              ))}
            </div>
          </Card>
        </div>
      </Plate>

      <Plate
        title="Когда сорвалось"
        path="ошибки и офлайн"
        why="Три разные новости, которые часто сваливают в одну: сервер не ответил, интернета нет, сервер ответил «нельзя». Лечатся они по-разному, значит и сказаны должны быть по-разному."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card flex flex-col items-center gap-3 p-6 text-center">
            <CloudOff className="size-6 text-taken" />
            <div>
              <h3 className="text-sm font-bold">Не дотянулись до сервера</h3>
              <p className="hint mt-1">Данные на экране — те, что были в прошлый раз.</p>
            </div>
            <Button tone="line" size="sm"><Undo2 className="size-3.5" />Ещё раз</Button>
          </div>

          <div className="card flex flex-col items-center gap-3 p-6 text-center">
            <WifiOff className="size-6 text-faint" />
            <div>
              <h3 className="text-sm font-bold">Нет интернета</h3>
              <p className="hint mt-1">Смену можно закрыть и без него — запишется, когда связь вернётся.</p>
            </div>
            <span className="rounded-full bg-raised px-3 py-1 text-2xs text-dim">2 записи ждут отправки</span>
          </div>

          <div className="card flex flex-col items-center gap-3 p-6 text-center">
            <AlertTriangle className="size-6 text-brass" />
            <div>
              <h3 className="text-sm font-bold">Сервер отказал</h3>
              <p className="hint mt-1">Наличных больше, чем всех чаевых — поправьте суммы.</p>
            </div>
            <Button tone="line" size="sm">Открыть день</Button>
          </div>
        </div>
      </Plate>

      <Plate
        title="Сообщения"
        path="тосты"
        why="Появляется снизу справа, живёт четыре секунды, уходит само. У того, что можно отменить, — кнопка отмены, а не «ок»."
      >
        <div className="flex flex-col gap-2.5">
          {[
            ['Смена закрыта — 8:12 на часах', 'good'],
            ['Цель поставлена', 'good'],
            ['День записан', 'undo'],
            ['Не сохранилось: наличных больше, чем чаевых', 'bad'],
          ].map(([said, tone]) => (
            <span
              key={said as string}
              className={cn(
                'flex w-full max-w-md items-center gap-2.5 rounded-[var(--radius-field)] border px-4 py-3 text-sm',
                'border-paper/17 bg-table shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]',
              )}
            >
              {tone === 'bad' ? (
                <AlertTriangle className="size-4 flex-none text-taken" />
              ) : (
                <Check className="size-4 flex-none text-money" />
              )}
              <span className="flex-1">{said as string}</span>
              {tone === 'undo' && (
                <span className="font-mono text-2xs tracking-[0.1em] text-brass uppercase">Отменить</span>
              )}
            </span>
          ))}
        </div>
      </Plate>

      <Plate
        title="Клетка календаря"
        path="все виды дня"
        why="Восемь состояний одной клетки. Если день читается только по цвету, его не прочитает тот, кто цвета не различает, — поэтому у каждого есть форма или слово."
      >
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {[
              { n: 3, tag: null, note: 'пусто' },
              { n: 4, tag: 'Вечер', amt: '2 200', note: 'отработан' },
              { n: 5, tag: 'Вечер', plan: true, note: 'план' },
              { n: 6, tag: 'Отпуск', grey: true, note: 'отпуск' },
              { n: 7, tag: 'Вечер', amt: '2 200', cover: true, note: 'ищут подмену' },
              { n: 8, tag: 'Вечер', amt: '2 200', today: true, note: 'сегодня' },
              { n: 9, tag: 'Вечер', amt: '2 200', picked: true, note: 'выбран' },
              { n: 10, tag: 'Вечер', amt: '2 200', blank: true, note: 'чужой месяц' },
            ].map((day) => (
              <div key={day.n} className="flex flex-col gap-1.5">
                <div
                  className={cn(
                    'flex min-h-24 flex-col gap-1.5 rounded-xl border p-2.5',
                    day.blank ? 'border-transparent' : 'border-transparent bg-deep',
                    day.today && 'border-brass',
                    day.picked && 'border-paper/17',
                    day.cover && 'border-taken',
                  )}
                >
                  <span className={cn('font-mono text-xs', day.blank ? 'text-edge-firm' : 'text-dim', day.today && 'text-brass')}>
                    {day.n}
                  </span>
                  {day.tag !== null && (
                    <span className={cn('flex items-center gap-1.5 text-xs', day.grey || day.plan ? 'text-faint' : 'text-dim')}>
                      <span className={cn('h-3.5 w-[3px] flex-none rounded-sm', day.grey || day.plan ? 'bg-edge-firm' : 'bg-brass')} />
                      {day.tag}
                    </span>
                  )}
                  {day.amt !== undefined && (
                    <span className={cn('mt-auto font-mono text-sm tabular', day.blank ? 'text-edge-firm' : 'text-money')}>
                      {day.amt}
                    </span>
                  )}
                </div>
                <span className="lbl text-center">{day.note}</span>
              </div>
            ))}
          </div>
        </Card>
      </Plate>
    </Sheet>
  );
}

export const Route = createFileRoute('/kit/states')({ component: States });
