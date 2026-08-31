import { createFileRoute } from '@tanstack/react-router';

import { Head } from '@/components/screen';
import { cn } from '@/lib/utils';

/**
 * Планы.
 *
 * Один столбец, снизу вверх: что уже стоит, что делается, что задумано.
 * Не таблица со сроками — сроки в такой таблице всегда врут, а порядок
 * работ честен и без них.
 */
const STAGE = {
  done: { label: 'готово', dot: 'bg-money', ring: 'border-money/35' },
  now: { label: 'в работе', dot: 'bg-brass', ring: 'border-brass/45' },
  next: { label: 'дальше', dot: 'bg-edge-firm', ring: 'border-paper/9' },
} as const;

const PLAN: { stage: keyof typeof STAGE; title: string; body: string }[] = [
  { stage: 'next', title: 'Рейтинги глубже', body: 'Не одна звезда, а из чего она собралась.' },
  { stage: 'next', title: 'Приложение iOS и Android', body: 'То же самое, но из магазина.' },
  { stage: 'now', title: 'Ночные и праздничные', body: 'Надбавка считается сама, по правилам места.' },
  { stage: 'now', title: 'Обмен сменами', body: 'Отдать свою смену и забрать чужую внутри команды.' },
  { stage: 'done', title: 'Страница статуса', body: 'Видно, работает ли сервис, до того как писать в поддержку.' },
  { stage: 'done', title: 'Восстановление пароля', body: 'Письмо со ссылкой, ссылка живёт час.' },
  { stage: 'done', title: 'Годовой отчёт-постер', body: 'Год в одной картинке, которую не стыдно показать.' },
  { stage: 'done', title: 'Календарная подписка', body: 'Смены появляются в обычном календаре телефона.' },
  { stage: 'done', title: 'Телеграм-бот', body: 'Отметить смену, не открывая приложение.' },
  { stage: 'done', title: 'Биржа подработок', body: 'Разовая смена там, где сегодня некому выйти.' },
  { stage: 'done', title: 'Команды', body: 'Общий график, прикрытие смен, роли.' },
  { stage: 'done', title: 'Выплаты и сверка', body: 'Сколько обещали, сколько пришло, чего не хватает.' },
  { stage: 'done', title: 'Импорт графика с фото', body: 'Снимок листа со стены превращается в смены.' },
  { stage: 'done', title: 'Живая смена', body: 'Идёт прямо сейчас и считает деньги на ходу.' },
  { stage: 'done', title: 'Календарь смен с деньгами', body: 'С этого всё началось.' },
];

function Roadmap() {
  return (
    <>
      <Head
        said="Планы"
        title="Что сделано и что дальше"
        hint="Без дат: сроки в таком списке всегда оказываются враньём, а порядок — нет."
      />

      <div className="relative max-w-3xl pl-6">
        {/* Линия времени. Идёт сквозь все точки и обрывается на последней. */}
        <span className="absolute top-2 bottom-2 left-[5px] w-px bg-edge-firm" aria-hidden />

        <div className="flex flex-col gap-5">
          {PLAN.map((one) => (
            <div key={one.title} className="relative">
              <span
                className={cn(
                  'absolute top-[7px] -left-6 size-[11px] rounded-full ring-4 ring-night',
                  STAGE[one.stage].dot,
                )}
                aria-hidden
              />
              <div
                className={cn(
                  'rounded-[var(--radius-field)] border p-3.5',
                  one.stage === 'next' ? 'border-dashed' : '',
                  STAGE[one.stage].ring,
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="font-semibold">{one.title}</h3>
                  <span className="lbl">{STAGE[one.stage].label}</span>
                </div>
                <p className="hint mt-1">{one.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/roadmap')({ component: Roadmap });
