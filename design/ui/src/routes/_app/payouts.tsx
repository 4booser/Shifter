import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Banknote, CircleAlert, FileText, Plus } from 'lucide-react';

import { Head } from '@/components/screen';
import { Bars, Button, Card, Field, Modal, Over, Pills, Switch } from '@/components/ui/kit';
import { plural } from '@/lib/plural';
import { cn } from '@/lib/utils';

/**
 * Выплаты.
 *
 * Экран отвечает на один вопрос — «мне должны или уже нет» — и потому
 * начинается с суммы долга, а не со списка периодов. Списки ниже нужны,
 * только когда ответ «должны» и надо понять, кто именно.
 */

type State = 'ждём' | 'задержка' | 'пришло' | 'недоплата' | 'пропало' | 'закрыто';

const TONE: Record<State, string> = {
  'ждём': 'text-faint',
  'задержка': 'text-taken',
  'пришло': 'text-money',
  'недоплата': 'text-taken',
  'пропало': 'text-taken',
  'закрыто': 'text-faint',
};

const DOT: Record<State, string> = {
  'ждём': 'bg-brass',
  'задержка': 'bg-taken',
  'пришло': 'bg-money',
  'недоплата': 'bg-taken',
  'пропало': 'bg-edge-firm',
  'закрыто': 'bg-edge-firm',
};

interface Row {
  place: string;
  span: string;
  due: string;
  amount: string;
  state: State;
  note?: string;
  short?: string;
}

const WAITING: Row[] = [
  { place: 'Бар «Полночь»', span: '16—31 августа', due: 'ждём 5 сентября', amount: '₴16 590', state: 'ждём' },
  { place: 'Бар «Полночь»', span: '1—15 августа', due: 'ждали 20 августа', amount: '₴17 808', state: 'задержка', note: '12 дней просрочки' },
  { place: 'Ресторан «Веранда»', span: '16—31 июля', due: 'ждали 5 августа', amount: '₴18 437', state: 'недоплата', short: 'пришло ₴16 900, не хватает ₴1 537' },
  { place: 'Кофейня «Зерно»', span: '1—15 июля', due: 'ждали 20 июля', amount: '₴17 274', state: 'пропало', note: '43 дня — столько же, сколько в прошлый раз' },
];

const DONE: Row[] = [
  { place: 'Бар «Полночь»', span: '16—31 июля', due: 'пришло 5 августа', amount: '₴18 120', state: 'пришло', note: 'день в день' },
  { place: 'Бар «Полночь»', span: '1—15 июля', due: 'пришло 21 июля', amount: '₴15 940', state: 'пришло', note: 'на день позже' },
  { place: 'Подработка, «Дым»', span: '12 июля', due: 'наличными в тот же день', amount: '₴2 400', state: 'закрыто', note: 'записано с ваших слов, банк это не подтверждает' },
];

function Line({ row, wide = false }: { row: Row; wide?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-paper/9 py-3 last:border-0">
      <span className={cn('size-2 flex-none rounded-full', DOT[row.state])} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{row.place}</span>
          <span className={cn('text-2xs font-bold uppercase', TONE[row.state])}>{row.state}</span>
        </span>
        <span className="block font-mono text-2xs text-faint">
          {row.span} · {row.due}
        </span>
        {row.short !== undefined && (
          <span className="mt-0.5 block text-2xs text-taken">{row.short}</span>
        )}
        {row.note !== undefined && <span className="hint">{row.note}</span>}
      </span>

      <span className="flex flex-none items-center gap-3">
        <span className="font-mono text-sm font-semibold tabular">{row.amount}</span>
        {/* Торопить нечего, пока срок не вышел: кнопка «Поторопить» на
            платеже, который ещё не должен был прийти, учит нажимать её зря. */}
        {wide && row.state !== 'ждём' && (
          <span className="hidden gap-1 sm:flex">
            <Button tone="quiet" size="sm">Поторопить</Button>
            <Button tone="quiet" size="sm">Закрыть вопрос</Button>
            {row.state === 'пропало' && <Button tone="quiet" size="sm">Махнуть рукой</Button>}
          </span>
        )}
      </span>
    </div>
  );
}

function Payouts() {
  const [recording, setRecording] = useState(false);
  const [earlier, setEarlier] = useState(false);

  const lateCount = WAITING.filter((one) => one.state !== 'ждём').length;

  return (
    <>
      <Head
        said="Что обещано"
        title="Выплаты"
        right={
          <>
            <button type="button" onClick={() => setRecording(true)}>
              <Button tone="go">
                <Plus className="size-4" />
                Пришли деньги
              </Button>
            </button>
            <Link to="/payslip">
              <Button tone="line">
                <FileText className="size-4" />
                Расчётка за период
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-6 md:col-span-2">
          <span className="lbl">Вам должны</span>
          <p className="mt-1.5 text-4xl font-extrabold tabular">₴70 109</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-taken">
            <CircleAlert className="size-4" />
            Из них ₴53 519 уже просрочено — это{' '}
            {lateCount} {plural(lateCount, 'период', 'периода', 'периодов')} из {WAITING.length}
          </p>
        </div>

        <div className="card p-6">
          <span className="lbl">Ближайшие деньги</span>
          <p className="mt-1.5 text-2xl font-bold text-money tabular">₴16 590</p>
          <p className="hint mt-1">через 4 дня · 5 сентября · «Полночь»</p>
        </div>
      </div>

      <Card
        title="Ждём"
        hint="Сверху то, что придёт скорее всего. Ниже — то, за чем придётся сходить."
      >
        <div className="flex flex-col">
          {WAITING.map((row) => (
            <Line key={row.span + row.place} row={row} wide />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Сколько выходит за период" hint="Красным — то, что ещё не пришло.">
          <Bars
            rows={[
              { name: '1—15 июля', share: 93, value: '₴17 274', tone: 'taken' },
              { name: '16—31 июля', share: 100, value: '₴18 437', tone: 'taken' },
              { name: '1—15 авг.', share: 96, value: '₴17 808', tone: 'taken' },
              { name: '16—31 авг.', share: 90, value: '₴16 590', tone: 'brass' },
            ]}
          />
          <button type="button" onClick={() => setEarlier((was) => !was)} className="mt-3 block">
            <Button tone="quiet" size="sm">
              {earlier ? 'Свернуть прошлые' : 'Показать прошлые периоды'}
            </Button>
          </button>
          {earlier && (
            <div className="mt-3 border-t border-paper/9 pt-3">
              <Bars
                rows={[
                  { name: '1—15 июня', share: 88, value: '₴16 240', tone: 'money' },
                  { name: '16—30 июня', share: 50, value: '₴9 260', tone: 'money' },
                ]}
              />
            </div>
          )}
        </Card>

        <Card
          title="Как здесь платят"
          hint="По тому, что уже случилось. Банк это подтверждает, память — нет."
        >
          <div className="flex flex-col gap-3.5">
            {[
              { place: 'Бар «Полночь»', avg: 'день в день', meta: '6 выплат, одна с опозданием на день', bad: false },
              { place: 'Ресторан «Веранда»', avg: 'недоплачивает', meta: '3 раза подряд меньше обещанного, в среднем на ₴1 400', bad: true },
              { place: 'Кофейня «Зерно»', avg: '+43 дня', meta: '4 задержки, худшая 57 дней', bad: true },
            ].map((one) => (
              <span key={one.place} className="flex flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{one.place}</span>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular',
                      one.bad ? 'text-taken' : 'text-money',
                    )}
                  >
                    {one.avg}
                  </span>
                </span>
                <span className="hint">{one.meta}</span>
              </span>
            ))}

            <Link to="/contract" className="border-t border-paper/9 pt-3 text-sm text-brass">
              Вопросы, которые стоило задать до подписи →
            </Link>
          </div>
        </Card>
      </div>

      <Card title="Закрытые" hint="То, по чему вопросов больше нет.">
        <div className="flex flex-col">
          {DONE.map((row) => (
            <Line key={row.span + row.place} row={row} />
          ))}
        </div>
      </Card>

      <Over open={recording} onClose={() => setRecording(false)}>
        <Modal
          title="Пришли деньги"
          said="Отметить, что и за какой период получено."
          wide
          foot={
            <>
              <button type="button" onClick={() => setRecording(false)}>
                <Button tone="line" className="w-full">Отмена</Button>
              </button>
              <Button tone="go">Записать</Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Сколько" value="16 590" />
            <Field label="Когда" value="1 сентября" />
          </div>
          <Field label="За какой период" value="16—31 августа, «Полночь»" />
          <div>
            <span className="lbl">Чем</span>
            <Pills className="mt-2" options={['На карту', 'Наличными', 'Аванс']} value="На карту" />
          </div>
          <Field label="Комиссия, если была" placeholder="0" />
          <Switch label="Считать период закрытым" hint="Даже если сумма меньше обещанной." />
          <p className="hint">
            Наличные никто, кроме вас, не подтвердит — в сверке с банком они так и будут помечены.
          </p>
        </Modal>
      </Over>

      <p className="flex items-center gap-2 text-xs text-faint">
        <Banknote className="size-3.5" />
        Периоды берутся из настроек места. Если место платит не так — это правится там, а не здесь.
      </p>
    </>
  );
}

export const Route = createFileRoute('/_app/payouts')({ component: Payouts });
