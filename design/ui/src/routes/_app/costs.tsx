import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import { Head } from '@/components/screen';
import { Bars, Button, Card } from '@/components/ui/kit';

/**
 * Расходы.
 *
 * Не вычитаются из заработка: такси домой — это деньги, ушедшие после того,
 * как зарплата пришла. Сложить их в одну цифру значит перестать сходиться с
 * расчёткой, а это единственное, ради чего приложение и заводят.
 */
function Costs() {
  return (
    <>
      <Head
        said="Август"
        title="Во что обошлась работа"
        hint="Ни одна из этих сумм не вычтена из заработка — они ушли уже после него."
        right={<Button tone="go"><Plus className="size-4" />Записать расход</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <Card title="По видам">
          <Bars rows={[
            { name: 'дорога', under: '38 раз', share: 100, value: '₴3 040', tone: 'taken' },
            { name: 'еда', under: '12 раз', share: 42, value: '₴1 280', tone: 'taken' },
            { name: 'форма', under: '2 раза', share: 22, value: '₴670', tone: 'taken' },
            { name: 'инструмент', under: '1 раз', share: 12, value: '₴350', tone: 'taken' },
          ]} />
        </Card>

        <Card title="Что это значит">
          <p className="text-2xl font-bold tabular">₴5 340</p>
          <p className="hint mt-1">за месяц, это 22% чаевых</p>
          <div className="mt-4 border-t border-paper/9 pt-3">
            <span className="lbl">Час после расходов</span>
            <p className="mt-1 text-xl font-bold tabular">
              ₴212 <span className="text-sm font-normal text-faint">вместо ₴238</span>
            </p>
          </div>
        </Card>
      </div>

      <Card title="Что записано">
        <div className="flex flex-col">
          {[
            { when: '31 августа', what: 'Uklon · домой после смены', kind: 'дорога', sum: '180' },
            { when: '29 августа', what: 'Кав’ярня «Мулен» · обед', kind: 'еда', sum: '145' },
            { when: '24 августа', what: 'Рубашка на смену', kind: 'форма', sum: '520' },
            { when: '18 августа', what: 'Джиггер и стрейнер', kind: 'инструмент', sum: '350' },
          ].map(({ when, what, kind, sum }) => (
            <span key={when} className="flex items-center gap-3 border-b border-paper/9 py-3 last:border-0">
              <span className="font-mono text-2xs text-faint">{when}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{what}</span>
              <span className="rounded-full bg-raised px-2 py-0.5 text-2xs text-dim">{kind}</span>
              <span className="font-mono text-sm text-taken tabular">−₴{sum}</span>
            </span>
          ))}
        </div>
      </Card>
    </>
  );
}

export const Route = createFileRoute('/_app/costs')({ component: Costs });
