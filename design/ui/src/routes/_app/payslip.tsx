import { createFileRoute } from '@tanstack/react-router';
import { Upload } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card } from '@/components/ui/kit';

/**
 * Расчётка.
 *
 * Единственный экран, который спорит с работодателем. Слева — что насчитало
 * приложение, справа — что написано в бумаге, и цветом отмечено только
 * расхождение: если подсветить всё, спорить будет не о чем.
 */
function Payslip() {
  return (
    <>
      <Head
        said="Сверка"
        title="Расчётка за август"
        hint="Сходится всё, кроме надбавки за ночь — недосчитали ₴642."
        right={<Button tone="line"><Upload className="size-4" />Загрузить расчётку</Button>}
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse font-mono text-sm">
            <thead>
              <tr>
                <th className="pb-2 text-left lbl">Строка</th>
                <th className="pb-2 text-right lbl">Приложение</th>
                <th className="pb-2 text-right lbl">Расчётка</th>
                <th className="pb-2 text-right lbl">Разница</th>
              </tr>
            </thead>
            <tbody>
              {[
                { what: 'Часы', mine: '137', theirs: '137', diff: '' },
                { what: 'Ставка', mine: '19 480', theirs: '19 480', diff: '' },
                { what: 'Ночные', mine: '2 142', theirs: '1 500', diff: '−642' },
                { what: 'Чаевые', mine: '7 700', theirs: '7 700', diff: '' },
                { what: 'Питание', mine: '−1 530', theirs: '−1 530', diff: '' },
                { what: 'Налог', mine: '−5 159', theirs: '−5 034', diff: '+125' },
              ].map((row) => (
                <tr key={row.what} className="border-t border-paper/9">
                  <td className="py-2.5 text-dim">{row.what}</td>
                  <td className="py-2.5 text-right tabular">{row.mine}</td>
                  <td className="py-2.5 text-right tabular">{row.theirs}</td>
                  <td className={`py-2.5 text-right tabular ${row.diff === '' ? 'text-faint' : 'font-bold text-taken'}`}>
                    {row.diff === '' ? '—' : row.diff}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-paper/17">
                <td className="pt-3 font-semibold">На руки</td>
                <td className="pt-3 text-right font-semibold tabular">21 299</td>
                <td className="pt-3 text-right font-semibold tabular">20 782</td>
                <td className="pt-3 text-right font-bold text-taken tabular">−517</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="О чём спрашивать" hint="Готовая формулировка — её можно показать менеджеру.">
        <p className="text-sm text-dim">
          За август у меня 62 ночных часа при коэффициенте 1,35 — это ₴2 142 надбавки. В
          расчётке стоит ₴1 500. Разница ₴642; итог на руки расходится на ₴517.
        </p>
        <div className="mt-3 flex gap-2">
          <Button tone="line" size="sm">Скопировать</Button>
          <Button tone="quiet" size="sm">Показать, откуда цифры</Button>
        </div>
      </Card>
    </>
  );
}

export const Route = createFileRoute('/_app/payslip')({ component: Payslip });
