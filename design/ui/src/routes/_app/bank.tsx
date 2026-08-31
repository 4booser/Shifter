import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { CreditCard, Eye, Lock, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';

import { Climb } from '@/components/calendar';
import { Head } from '@/components/screen';
import { Bars, Button, Card, Empty, Field, Split, Switch } from '@/components/ui/kit';
import { SPEND, STANDING } from '@/mock/data';
import { cn } from '@/lib/utils';

/**
 * Банк.
 *
 * Единственный экран, где приложение просит чужой доступ, и потому первое,
 * что на нём написано, — куда этот доступ уходит. Токен идёт из браузера
 * прямо в банк; сервер Shifter его не видит и не хранит. Это не оговорка
 * мелким шрифтом внизу, а подзаголовок страницы.
 */
/**
 * Запас на два месяца, в тысячах.
 *
 * Ряд начинается с той же суммы, что стоит в «На карте» сверху: график,
 * который начинается не оттуда, откуда написано, читают как ошибку — и
 * правильно делают.
 */
const RUNWAY = Array.from({ length: 61 }, (_, day) => {
  const spent = day * 0.621;
  // Подписки списываются кучей первого числа, и на кривой это ступенька.
  const bills = Math.floor((day + 8) / 30) * 1.4;

  return Number((81.483 - spent - bills).toFixed(2));
});

const ACCOUNTS = [
  { name: 'Чёрная карта', tail: '•• 4417', money: '₴69 423', on: true },
  { name: 'Белая карта', tail: '•• 0982', money: '₴12 060', on: true },
  { name: 'Банка «На отпуск»', tail: 'копилка', money: '₴31 500', on: false },
];

function Bank() {
  const [empty, setEmpty] = useState(false);
  const [locked, setLocked] = useState(true);
  const [waiting, setWaiting] = useState(false);

  return (
    <>
      <Head
        said="Монобанк · пример"
        title="Банк"
        hint="Токен только на чтение. Он идёт из этого браузера прямо в банк — сервер Shifter его не видит."
        right={
          <>
            <Button tone="quiet" size="sm">
              <Eye className="size-3.5" />
              Выйти из примера
            </Button>
            <button type="button" onClick={() => setWaiting((was) => !was)}>
              <Button tone="line" size="sm">
                <RefreshCw className="size-3.5" />
                Обновить месяц
              </Button>
            </button>
            <Button tone="line" size="sm">Загрузить три месяца</Button>
          </>
        }
      />

      {waiting && (
        <p className="card border-brass/35 p-3.5 text-sm text-dim">
          Банк просит подождать — он пускает не чаще раза в минуту. Попробуем сами через 43 секунды,
          нажимать ещё раз не нужно.
        </p>
      )}

      {/* Счета: какие из них вообще считать. Копилка на отпуск в «до зарплаты»
          не участвует, иначе экран покажет запас, которого нет. */}
      <Card
        title="Счета"
        hint="Отмеченные складываются в остаток. Копилку обычно не считают — она не на жизнь."
        right={<CreditCard className="size-4 text-faint" />}
      >
        <div className="flex flex-col">
          {ACCOUNTS.map((one) => (
            <span
              key={one.tail}
              className={cn(
                'flex items-center gap-3 border-b border-paper/9 py-3 last:border-0',
                !one.on && 'opacity-55',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{one.name}</span>
                <span className="lbl">{one.tail}</span>
              </span>
              <span className="font-mono text-sm font-semibold tabular">{one.money}</span>
              <span className="w-24">
                <Switch on={one.on} label="" />
              </span>
            </span>
          ))}
        </div>
      </Card>

      {empty ? (
        <Empty
          glyph={<CreditCard className="size-7" />}
          title="Пока ничего не загружено"
          said="Нажмите «Обновить месяц» — выписка придёт из банка в этот браузер и дальше никуда."
          action="Обновить месяц"
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="card p-5">
              <span className="lbl">На карте</span>
              <p className="mt-1.5 text-3xl font-extrabold tabular">₴81 483</p>
              <p className="hint mt-1">две карты, копилка не в счёт</p>
            </div>
            <div className="card p-5">
              <span className="lbl">До зарплаты</span>
              <p className="mt-1.5 text-2xl font-bold tabular">
                ₴621 <span className="text-sm font-normal text-faint">в день</span>
              </p>
              <p className="hint mt-1">4 дня · ₴199 обещано подпискам</p>
            </div>
            <div className="card p-5">
              <span className="lbl">Час на самом деле</span>
              <p className="mt-1.5 text-2xl font-bold tabular">
                ₴241 <span className="text-sm font-normal text-faint">вместо ₴250</span>
              </p>
              <p className="hint mt-1">работа съела ₴1 597</p>
            </div>
          </div>

          <Card title="Хватит на два месяца" hint="Считаем по ₴621 в день плюс то, что списывается само.">
            <Climb
              points={RUNWAY}
              height={160}
              from="сегодня · ₴81 483"
              mid="через месяц"
              to="через два · ₴41 421"
            />
            <p className="hint mt-2">
              Две ступеньки — дни, когда списываются подписки. Если ничего не менять, к 31 октября
              останется ₴41 421.
            </p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="В смену тратится меньше" hint="22 дня со сменой против 9 без.">
              <Bars
                rows={[
                  { name: 'в смену', share: 68, value: '₴529', tone: 'brass' },
                  { name: 'без смены', share: 100, value: '₴778' },
                ]}
              />
              <p className="hint mt-3">Больше всего расходится дорога.</p>
            </Card>

            <Card title="Пришло и ушло" hint="Переводы между своими счетами не в счёт.">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-2xl font-bold tabular">₴37 307</p>
                <p className="hint">пришло за месяц</p>
              </div>
              <Split
                parts={[
                  { name: 'потрачено', share: 67, colour: '#d9705f' },
                  { name: 'осталось', share: 33, colour: '#7fbf7a' },
                ]}
              />
              <div className="mt-3 flex justify-between border-t border-paper/9 pt-3">
                <span className="hint">₴24 900 ушло</span>
                <span className="hint">₴12 407 осталось</span>
              </div>
            </Card>

            <Card title="Куда уходит" hint="Кому платили чаще всего за месяц.">
              <Bars rows={SPEND.map((row, i) => ({ ...row, tone: i === 0 ? ('brass' as const) : undefined }))} />
            </Card>

            <Card title="Приходит само" hint="Подписки и всё, что списывается по кругу.">
              <div className="flex flex-col">
                {STANDING.map((row) => (
                  <span
                    key={row.name}
                    className="flex items-baseline justify-between gap-3 border-b border-paper/9 py-2 last:border-0"
                  >
                    <span className="truncate text-sm">{row.name}</span>
                    <span className="font-mono text-sm tabular">
                      {row.amount} <span className="text-2xs text-faint">след. {row.next}</span>
                    </span>
                  </span>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Подключить свой банк"
          hint="Токен берётся на api.monobank.ua и остаётся только в этом браузере."
          right={<ShieldCheck className="size-4 text-money" />}
        >
          <div className="flex flex-wrap items-end gap-2.5">
            <Field className="min-w-64 flex-1" label="Токен из monobank" placeholder="u…" />
            <Button tone="go">Подключить</Button>
          </div>
          <ul className="mt-4 flex flex-col gap-2 border-t border-paper/9 pt-4">
            {[
              'Токен только на чтение: платить им нельзя.',
              'Он не уходит на сервер Shifter — запрос идёт из браузера прямо в банк.',
              'Выписка тоже остаётся здесь: наверх летят только итоги, и то если вы их сохраните.',
            ].map((one) => (
              <li key={one} className="hint flex gap-2">
                <span className="text-money">·</span>
                {one}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Замок и данные" right={<Lock className="size-4 text-faint" />}>
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => setLocked((was) => !was)} className="text-left">
              <Switch
                on={locked}
                label={locked ? 'Замок включён' : 'Замок выключен'}
                hint="Спрашивать код при каждом открытии банка."
              />
            </button>

            <button type="button" onClick={() => setEmpty((was) => !was)} className="text-left">
              <Switch on={empty} label="Показать пустой экран" hint="Как выглядит банк до первой загрузки." />
            </button>

            <div className="border-t border-paper/9 pt-3">
              <Button tone="danger">
                <Trash2 className="size-4" />
                Отключить и стереть
              </Button>
              <p className="hint mt-2">
                Токен и вся выписка исчезают из браузера. Смены и деньги, которые вы отмечали сами,
                остаются — они никогда и не были банковскими.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/bank')({ component: Bank });
