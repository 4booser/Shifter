import { createFileRoute } from '@tanstack/react-router';
import { Eye, RefreshCw } from 'lucide-react';

import { Climb } from '@/components/calendar';
import { Head } from '@/components/screen';
import { Bars, Button, Card, Field, Split } from '@/components/ui/kit';
import { CLIMB, SPEND, STANDING } from '@/mock/data';

function Bank() {
  return (
    <>
      <Head
        said="Монобанк · пример"
        title="Банк"
        hint="Токен только на чтение. Он идёт из этого браузера прямо в банк — сервер Shifter его не видит."
        right={
          <>
            <Button tone="quiet" size="sm"><Eye className="size-3.5" />Выйти из примера</Button>
            <Button tone="line" size="sm"><RefreshCw className="size-3.5" />31 день</Button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-5">
          <span className="lbl">На карте</span>
          <p className="mt-1.5 text-3xl font-extrabold tabular">₴69 423</p>
        </div>
        <div className="card p-5">
          <span className="lbl">До зарплаты</span>
          <p className="mt-1.5 text-2xl font-bold tabular">₴621 <span className="text-sm font-normal text-faint">в день</span></p>
          <p className="hint mt-1">5 дней · ₴199 обещано подпискам</p>
        </div>
        <div className="card p-5">
          <span className="lbl">Час на самом деле</span>
          <p className="mt-1.5 text-2xl font-bold tabular">₴241 <span className="text-sm font-normal text-faint">вместо ₴250</span></p>
          <p className="hint mt-1">работа съела ₴1 597</p>
        </div>
      </div>

      <Card title="Хватит на два месяца" hint="Считаем по ₴621 в день плюс то, что списывается само.">
        <Climb points={[...CLIMB].reverse()} height={160} />
        <p className="hint mt-2">Тоньше всего 30 октября — ₴49 733.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="В смену тратится меньше" hint="22 дня со сменой против 9 без.">
          <Bars rows={[
            { name: 'в смену', share: 68, value: '₴529', tone: 'brass' },
            { name: 'без смены', share: 100, value: '₴778' },
          ]} />
          <p className="hint mt-3">Больше всего расходится дорога.</p>
        </Card>

        <Card title="Пришло и ушло" hint="Переводы между своими счетами не в счёт.">
          <p className="mb-3 text-2xl font-bold tabular">₴37 307</p>
          <Split parts={[
            { name: 'осталось', share: 50, colour: '#7fbf7a' },
            { name: 'потрачено', share: 50, colour: '#d9705f' },
          ]} />
        </Card>

        <Card title="Куда уходит" hint="Кому платили чаще всего за месяц.">
          <Bars rows={SPEND.map((row, i) => ({ ...row, tone: i === 0 ? 'brass' as const : undefined }))} />
        </Card>

        <Card title="Приходит само" hint="Подписки и всё, что списывается по кругу.">
          <div className="flex flex-col">
            {STANDING.map((row) => (
              <span key={row.name} className="flex items-baseline justify-between gap-3 border-b border-paper/9 py-2 last:border-0">
                <span className="truncate text-sm">{row.name}</span>
                <span className="font-mono text-sm tabular">
                  {row.amount} <span className="text-2xs text-faint">след. {row.next}</span>
                </span>
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Подключить свой банк" hint="Токен берётся на api.monobank.ua и хранится только в этом браузере.">
        <div className="flex flex-wrap items-end gap-2.5">
          <Field className="min-w-64 flex-1" label="Токен из monobank" placeholder="u...." />
          <Button tone="go">Подключить</Button>
        </div>
      </Card>
    </>
  );
}

export const Route = createFileRoute('/_app/bank')({ component: Bank });
