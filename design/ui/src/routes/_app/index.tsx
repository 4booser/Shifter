import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Redo2, Search, Undo2 } from 'lucide-react';

import { Brief, BriefChart } from '@/components/brief';
import { Docket, Month } from '@/components/calendar';
import { Head } from '@/components/screen';
import { Button, Card, Field, Modal, Over, Pills, Switch } from '@/components/ui/kit';
import { Window, Windows } from '@/components/windows';
import { TILES } from '@/mock/data';
import { cn } from '@/lib/utils';

/** Сколько принёс каждый день месяца — для полосы под сводкой. */
const BY_DAY = [
  2470, 1340, 0, 0, 2200, 2200, 2470, 1340, 1340, 0, 0, 2200, 2200, 2470, 0, 0, 0, 0, 0, 2200,
  2470, 1340, 1340, 0, 0, 2200, 2200, 2470, 1340, 1340, 1640,
];

/** Всё, что делают с клавиатуры. Открывается на ⌘K. */
const COMMANDS = [
  { what: 'Поставить смену', keys: 'S' },
  { what: 'Начать смену', keys: 'G' },
  { what: 'Перейти к сегодня', keys: 'T' },
  { what: 'Найти по календарю', keys: '/' },
  { what: 'Отчёт за месяц', keys: 'R' },
  { what: 'Отменить последнее', keys: '⌘Z' },
];

/** Первый запуск: четыре вопроса, после которых календарь уже считает. */
const STEPS = [
  { ask: 'Где вы работаете?', said: 'Как называете вслух — бар на углу, кофейня, ресторан.', value: 'Бар «Полночь»' },
  { ask: 'Что платят?', said: 'В час, за смену или в месяц. Проценты и надбавки добавим потом.', value: '₴180 в час' },
  { ask: 'В какие дни обычно?', said: 'Приблизительно — календарь потом поправит.', value: 'ср, чт, пт, сб' },
  { ask: 'Когда смена начинается и кончается', said: 'Тоже приблизительно.', value: '17:00 — 01:00' },
];

function Calendar() {
  const [shiftModal, setShiftModal] = useState(false);
  const [win, setWin] = useState<Window>(null);
  const [palette, setPalette] = useState(false);
  const [draft, setDraft] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  const [step, setStep] = useState(0);

  return (
    <>
      <Head
        said="Август 2026"
        title="Календарь"
        right={
          <>
            <Button size="icon" tone="line"><ChevronLeft className="size-4" /></Button>
            <Button size="icon" tone="line"><ChevronRight className="size-4" /></Button>
            <Button size="icon" tone="quiet"><Undo2 className="size-4" /></Button>
            <Button size="icon" tone="quiet"><Redo2 className="size-4" /></Button>
            <span onClick={() => setPalette(true)}>
              <Button tone="quiet" size="sm">⌘K</Button>
            </span>
            <span onClick={() => setWin('search')}><Button tone="quiet" size="sm"><Search className="size-3.5" />Найти</Button></span>
            <span onClick={() => setWin('rotation')}><Button tone="line" size="sm">Разложить</Button></span>
            <Button tone="quiet" size="sm">Сегодня</Button>
            <Button tone="go" size="sm" className="cursor-pointer" >
              <span onClick={() => setShiftModal(true)}>Поставить смену</span>
            </Button>
          </>
        }
      />

      {/* Одно крупное число и ниже плитки. Раньше здесь та же четвёрка стояла
          трижды — под суммой, в строке чаевых и в плитках; повторённая цифра
          не запоминается лучше, она просто отодвигает календарь вниз. */}
      <div>
        <span className="lbl">Заработано</span>
        <p className="mt-1.5 text-5xl font-extrabold tracking-[-0.05em] tabular">
          <span className="font-medium text-faint">₴</span>24 700
        </p>
        <p className="hint mt-2">17 смен · 137 часов · 1—31 августа</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Brief>
          <p className="text-sm text-dim">
            Сегодня вечер в «Полночи» с 17:00. Это 17-я смена месяца — на одну меньше, чем в
            июле, но час дороже: ₴180 против ₴167. До цели ₴3 300, и одна суббота её закрывает.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-paper/9 pt-3">
            <Button tone="line" size="sm">Спросить об этом</Button>
            <button type="button" onClick={() => setDraft((was) => !was)}>
              <Button tone="quiet" size="sm">
                {draft ? 'Убрать черновик' : 'А если взять ещё смен?'}
              </Button>
            </button>
            <button type="button" onClick={() => setFirstRun(true)}>
              <Button tone="quiet" size="sm">Показать первый запуск</Button>
            </button>
          </div>
        </Brief>

        <Card title="Месяц глазами сводки">
          <BriefChart days={BY_DAY} payday={4} best={0} />
        </Card>
      </div>

      {/* Черновик недели: смены примеряются, ничего не сохраняя. Пока он
          открыт, в календаре они бледные — видно, что это ещё не план. */}
      {draft && (
        <Card
          title="Что если взять эти смены"
          hint="Ничего не сохранено. Пока это примерка."
          right={
            <span className="flex gap-2">
              <Button tone="go" size="sm">Превратить в план</Button>
              <button type="button" onClick={() => setDraft(false)}>
                <Button tone="quiet" size="sm">Выкинуть черновик</Button>
              </button>
            </span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-wrap gap-2">
              {['ср 2 · вечер', 'пт 4 · вечер', 'сб 5 · вечер', 'вс 6 · день'].map((one) => (
                <span
                  key={one}
                  className="rounded-[var(--radius-field)] border border-dashed border-brass/45 px-3 py-1.5 text-xs text-brass"
                >
                  {one}
                </span>
              ))}
            </div>
            <div className="text-right">
              <p className="font-mono text-xl font-bold text-money tabular">+₴8 810</p>
              <p className="lbl">поверх нынешних</p>
            </div>
          </div>
          <p className="mt-3 flex gap-2 border-t border-paper/9 pt-3 text-xs text-taken">
            Четыре часа из этих смен переваливают за недельную норму — они пойдут по
            сверхурочной ставке, и это уже посчитано выше.
          </p>
        </Card>
      )}

      {/* Полосой вбок на телефоне: восемь плиток в столбик — это экран
          прокрутки между человеком и календарём, ради которого он зашёл. */}
      <div className={cn(
        'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1',
        '[&>*]:w-[62%] [&>*]:flex-none [&>*]:snap-start',
        'sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 sm:[&>*]:w-auto lg:grid-cols-4',
      )}>
        {TILES.map((tile) => (
          <div key={tile.said} className="card p-4">
            <span className="lbl">{tile.said}</span>
            <p className={cn(
              'mt-1.5 text-2xl font-bold tracking-[-0.03em] tabular',
              tile.tone === 'bad' && 'text-taken',
            )}>
              {tile.num}
            </p>
            <p className="hint mt-0.5">{tile.foot}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2.6fr)_minmax(320px,1fr)]">
        <Month />
        <div className="flex flex-col gap-4">
          <Docket />
          <Card
            title="Цель на месяц"
            right={<span onClick={() => setWin('goal')}><Button tone="quiet" size="sm">Изменить</Button></span>}
          >
            <p className="text-xl font-bold tabular">
              ₴24 700 <span className="text-base font-semibold text-faint">из ₴28 000</span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-brass" style={{ width: '88%' }} />
            </div>
            <p className="hint mt-2">Осталось ₴3 300 за 1 день — нужна ещё одна суббота.</p>
          </Card>
          <Card
            title="День без смены"
            right={<span onClick={() => setWin('event')}><Button tone="quiet" size="sm">Подробно</Button></span>}
          >
            <Pills options={['отпуск', 'больничный', 'выходной']} />
            <div className="mt-3 border-t border-paper/9 pt-3">
              <Switch label="Прошу подменить" hint="Смена появится на графике команды." />
            </div>
          </Card>
        </div>
      </div>

      {/* Всё, что открывают из календаря: цель, событие, поиск, раскладка,
          импорты и разрешение конфликта. */}
      <Card title="Ещё из календаря" hint="Окна, которые открываются отсюда.">
        <div className="flex flex-wrap gap-2">
          {([
            ['goal', 'Цель'],
            ['event', 'День без смены'],
            ['sales', 'Позиции с продаж'],
            ['search', 'Поиск'],
            ['rotation', 'Два через два'],
            ['pattern', 'Повторить неделю'],
            ['scheme', 'Цвета по дням'],
            ['photo', 'Фото графика'],
            ['ics', 'Календарь по ссылке'],
            ['foreign', 'Файл из другого приложения'],
            ['conflict', 'Конфликт версий'],
          ] as [Window, string][]).map(([name, label]) => (
            <span key={label} onClick={() => setWin(name)}>
              <Button tone="line" size="sm">{label}</Button>
            </span>
          ))}
        </div>
      </Card>

      <Windows open={win} onClose={() => setWin(null)} />

      <Over open={palette} onClose={() => setPalette(false)}>
        <Modal title="Что сделать" said="То же самое, но не отрывая рук от клавиатуры.">
          <Field placeholder="Начните печатать…" />
          <div className="flex flex-col">
            {COMMANDS.map((one) => (
              <span
                key={one.what}
                className="flex items-center justify-between gap-3 border-b border-paper/9 py-2.5 last:border-0"
              >
                <span className="text-sm">{one.what}</span>
                <span className="rounded border border-paper/17 px-1.5 py-0.5 font-mono text-2xs text-faint">
                  {one.keys}
                </span>
              </span>
            ))}
          </div>
        </Modal>
      </Over>

      {/* Первый запуск: четыре вопроса и ни одного лишнего. Всё, что можно
          спросить потом, спрашивается потом — иначе до календаря не доходят. */}
      <Over
        open={firstRun}
        onClose={() => {
          setFirstRun(false);
          setStep(0);
        }}
      >
        <Modal
          title={STEPS[step]?.ask ?? ''}
          said={STEPS[step]?.said}
          foot={
            <>
              <button
                type="button"
                onClick={() => (step === 0 ? setFirstRun(false) : setStep(step - 1))}
              >
                <Button tone="line" className="w-full">{step === 0 ? 'Не сейчас' : 'Назад'}</Button>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (step === STEPS.length - 1) {
                    setFirstRun(false);
                    setStep(0);
                  } else {
                    setStep(step + 1);
                  }
                }}
              >
                <Button tone="go" className="w-full">
                  {step === STEPS.length - 1 ? 'Готово' : 'Дальше'}
                </Button>
              </button>
            </>
          }
        >
          <Field value={STEPS[step]?.value} />
          <div className="flex items-center gap-1.5">
            {STEPS.map((one, index) => (
              <span
                key={one.ask}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  index <= step ? 'bg-brass' : 'bg-raised',
                )}
              />
            ))}
          </div>
          <p className="hint">
            Шестьдесят секунд — и календарь начинает считать. Остальное правится по ходу.
          </p>
        </Modal>
      </Over>

      <Over open={shiftModal} onClose={() => setShiftModal(false)}>
            <Modal
              title="Поставить смену"
              said="Выберите шаблон — часы и ставка подставятся сами."
              foot={
                <>
                  <span onClick={() => setShiftModal(false)}><Button tone="line" className="w-full">Отмена</Button></span>
                  <span onClick={() => setShiftModal(false)}><Button tone="go" className="w-full">Поставить</Button></span>
                </>
              }
            >
              <Pills options={['🍸 Вечер', '☕️ День', '🥂 Банкет']} value="🍸 Вечер" />
              <Field label="На какой день" value="31.08.2026" />
              <Switch on label="Отметить сразу отработанной" />
      </Modal>
      </Over>
    </>
  );
}

export const Route = createFileRoute('/_app/')({ component: Calendar });
