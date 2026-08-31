import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertTriangle, ChevronLeft, ChevronRight, Image, Users } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Empty, Field, Pills, Switch } from '@/components/ui/kit';
import { CREW } from '@/mock/data';
import { plural } from '@/lib/plural';
import { cn } from '@/lib/utils';

/**
 * Общий график.
 *
 * Главное правило экрана — денег на нём нет. Ни у кого, кроме тех, кто сам
 * решил их показать: общий график, из которого видно чужую ставку, — ровно
 * то, чем это приложение обещало не быть.
 *
 * «Что стоит неделя» поэтому считается только по тем, кто поделился, и прямо
 * об этом говорит. Оценивать остальных «по среднему» нельзя: догадка о чужой
 * зарплате, показанная всей смене, — это та же утечка, только неточная.
 */
const DAYS = ['ПН 31', 'ВТ 1', 'СР 2', 'ЧТ 3', 'ПТ 4', 'СБ 5', 'ВС 6'];

const COVER = [
  { who: 'Костя', when: 'ЧТ 3 сентября · 11:00—19:00 · зал', why: 'уезжает', offers: 2 },
  { who: 'Ира', when: 'ВС 6 сентября · 17:00—01:00 · бар', why: 'смена подряд третья', offers: 0 },
];

function Schedule() {
  const [view, setView] = useState<'кто' | 'смены'>('кто');
  const [none, setNone] = useState(false);

  const sharing = CREW.filter((one) => one.you || one.name === 'Костя').length;
  const onShift = DAYS.map((_, day) => CREW.filter((one) => one.week[day] !== '').length);

  if (none) {
    return (
      <>
        <Head said="Общий график" title="Смена" />
        <Empty
          glyph={<Users className="size-7" />}
          title="Команды пока нет"
          said="График становится общим, когда в нём есть кто-то ещё. Заведите свою смену или войдите по коду из шести букв."
          action="Завести смену"
        />
        <button type="button" onClick={() => setNone(false)} className="self-start">
          <Button tone="quiet" size="sm">Показать, как выглядит с командой</Button>
        </button>
      </>
    );
  }

  return (
    <>
      <Head
        said="31 августа — 6 сентября"
        title="Смена «Полночь»"
        hint="Кто выходит и когда. Заработок остаётся вашим — на общем графике его нет ни у кого."
        right={
          <>
            <Pills options={['Неделя', 'Месяц']} value="Неделя" />
            <Button size="icon" tone="line">
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" tone="line">
              <ChevronRight className="size-4" />
            </Button>
            <Link to="/team">
              <Button tone="line" size="sm">Команда</Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {(['кто', 'смены'] as const).map((one) => (
          <button key={one} type="button" onClick={() => setView(one)}>
            <span
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                view === one ? 'border-brass bg-brass font-semibold text-night' : 'border-paper/17 text-dim',
              )}
            >
              {one === 'кто' ? 'По людям' : 'По сменам'}
            </span>
          </button>
        ))}
        <span className="ml-auto flex gap-2">
          <Button tone="quiet" size="sm">Только новенькие</Button>
          <Button tone="line" size="sm">
            <Image className="size-3.5" />
            Неделя картинкой
          </Button>
        </span>
      </div>

      {view === 'кто' ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className="lbl pb-2.5 text-left">Кто</th>
                {DAYS.map((d) => (
                  <th key={d} className={cn('lbl pb-2.5 text-center', d === 'ПН 31' && 'text-brass')}>
                    {d}
                  </th>
                ))}
                <th className="lbl pb-2.5 text-right">Часы</th>
              </tr>
            </thead>
            <tbody>
              {CREW.map((one) => (
                <tr key={one.name} className="border-t border-paper/9">
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: one.colour }} />
                      {one.name}
                      {one.you && <span className="hint">· вы</span>}
                      {one.trainee && <span className="hint">· стажёр до 14 сентября</span>}
                    </span>
                  </td>
                  {one.week.map((mark, i) => (
                    <td key={i} className="py-2 text-center">
                      {mark !== '' && (
                        <span
                          className={cn(
                            'inline-grid size-6 place-items-center rounded-md text-2xs font-bold',
                            one.you ? 'bg-brass text-night' : 'bg-raised text-dim',
                            one.cover === i && 'ring-2 ring-taken',
                          )}
                        >
                          {mark}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="py-2 text-right font-mono text-xs tabular">
                    {one.hours} ч
                    <span className="block text-2xs text-faint">{one.days} дн.</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-paper/17">
                <td className="lbl pt-2.5">На смене</td>
                {/* Считаем по той же таблице, что нарисована выше. Число,
                    вбитое руками, рано или поздно начинает ей противоречить —
                    и тогда верят ему, а не строкам. */}
                {onShift.map((n, i) => (
                  <td
                    key={i}
                    className={cn(
                      'pt-2.5 text-center font-mono text-xs font-semibold tabular',
                      n <= 1 && 'text-taken',
                    )}
                  >
                    {n}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>
      ) : (
        <Card hint="Не по людям, а по местам в смене: пустая строка — это слот, на который никто не встал.">
          <div className="flex flex-col gap-3">
            {[
              { when: 'ПН 31 · 11:00—19:00 · зал', who: ['Ира'] },
              { when: 'ПН 31 · 17:00—01:00 · бар', who: ['Костя'] },
              { when: 'ЧТ 3 · 09:00—17:00 · кухня', who: [] },
              { when: 'ЧТ 3 · 17:00—01:00 · бар', who: ['Вы', 'Ира'] },
              { when: 'СБ 5 · 11:00—19:00 · зал', who: ['Вы'] },
              { when: 'СБ 5 · 17:00—01:00 · бар', who: ['Ира'] },
            ].map((one) => (
              <div
                key={one.when}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-[var(--radius-field)] border p-3',
                  one.who.length === 0 ? 'border-taken/35 bg-taken/5' : 'border-paper/9',
                )}
              >
                <span className="flex-1 font-mono text-xs text-dim">{one.when}</span>
                {one.who.length === 0 ? (
                  <>
                    <span className="text-xs text-taken">никто не встал</span>
                    <Button tone="go" size="sm">Встану</Button>
                  </>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {one.who.map((name) => (
                      <span
                        key={name}
                        className="rounded-full border border-paper/17 px-2.5 py-0.5 text-2xs"
                      >
                        {name}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ищут подмену" hint="Отдать смену может только тот, чья она. Взять — любой в команде.">
          <div className="flex flex-col gap-3">
            {COVER.map((one) => (
              <div key={one.who} className="rounded-[var(--radius-field)] border border-paper/9 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{one.who}</span>
                  <span className="hint">{one.why}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-dim">{one.when}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Button tone="go" size="sm">Могу выйти</Button>
                  <span className="hint">
                    {one.offers === 0
                      ? 'пока никто не откликнулся'
                      : `${one.offers} ${plural(one.offers, 'отклик', 'отклика', 'откликов')} — выбирает тот, чья смена`}
                  </span>
                </div>
              </div>
            ))}

            <div className="border-t border-paper/9 pt-3">
              <p className="hint">
                Свою пятницу вы отдали в подмену. Вызвался Марк — решение за вами, и до него смена
                остаётся вашей. Кто заберёт, тот поставит её себе по своей ставке.
              </p>
              <div className="mt-2 flex gap-2">
                <Button tone="go" size="sm">Отдать Марку</Button>
                <Button tone="quiet" size="sm">Забрать обратно</Button>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="На что посмотреть" hint="То, что в таблице не бросается в глаза.">
            <div className="flex flex-col gap-2.5">
              {[
                { bad: true, said: 'В четверг на кухне никого — слот открыт третьи сутки.' },
                { bad: true, said: 'У вас пятница до 01:00 и суббота с 11:00 — между ними 10 часов. Одиннадцать — это норма отдыха, по которой считает ЕС.' },
                { bad: false, said: 'Костя в среду на подработке — в графике он есть, но не здесь.' },
                { bad: false, said: 'У Марка испытательный кончается 14 сентября.' },
              ].map((one) => (
                <div key={one.said} className="flex gap-2.5">
                  <span className={cn('mt-0.5 flex-none', one.bad ? 'text-taken' : 'text-faint')}>
                    <AlertTriangle className="size-3.5" />
                  </span>
                  <span className="text-xs text-dim">{one.said}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Что стоит эта неделя" hint="Только по тем, кто сам открыл свою ставку.">
            <p className="text-2xl font-bold tabular">₴14 200</p>
            <p className="hint mt-1">
              Посчитано по {sharing} из {CREW.length}: остальные ставку не открывали, и мы её не
              придумываем. Оценка «по среднему» — это та же чужая зарплата, только неточная.
            </p>
          </Card>
        </div>
      </div>

      <Card title="Вы на этом графике" hint="Что о вас видит команда.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Field label="Имя, которое видит смена" value="Аня" />
            <div>
              <span className="lbl">Ваш цвет</span>
              <div className="mt-2 flex gap-2">
                {['#e0a45b', '#7fbf7a', '#6f9fd8', '#b58bd4', '#d9705f'].map((colour, index) => (
                  <span
                    key={colour}
                    className={cn(
                      'size-7 rounded-full',
                      index === 0 && 'ring-2 ring-paper ring-offset-2 ring-offset-table',
                    )}
                    style={{ background: colour }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Switch label="Скрывать мои смены, пока я сам их не покажу" hint="Сейчас скрыто 2 из 17." />
            <Switch label="Показывать этой команде мою ставку" hint="Выключено. Включать не обязательно и обратимо." />
            <Switch on label="Я здесь стажируюсь — пусть это будет видно" />
            <button type="button" onClick={() => setNone(true)} className="self-start">
              <Button tone="quiet" size="sm">Показать пустое состояние</Button>
            </button>
          </div>
        </div>
      </Card>
    </>
  );
}

export const Route = createFileRoute('/_app/schedule')({ component: Schedule });
