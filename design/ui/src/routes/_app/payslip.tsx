import { createFileRoute } from '@tanstack/react-router';
import { Printer, Upload } from 'lucide-react';

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
        hint="Сходится всё, кроме надбавки за ночь — недосчитали ₴395."
        right={
          <>
            <Button tone="line"><Upload className="size-4" />Загрузить расчётку</Button>
            <Button tone="quiet"><Printer className="size-4" />Напечатать</Button>
          </>
        }
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
                { what: 'Смен', mine: '20', theirs: '20', diff: '' },
                { what: 'Часы', mine: '163', theirs: '163', diff: '' },
                { what: 'из них ночных', mine: '62', theirs: '46', diff: '−16' },
                { what: 'из них сверхурочных', mine: '0', theirs: '0', diff: '' },
                { what: 'Ставка', mine: '29 975', theirs: '29 975', diff: '' },
                { what: 'Ночные и праздничные', mine: '1 095', theirs: '700', diff: '−395' },
                { what: 'Доля с продаж', mine: '0', theirs: '0', diff: '' },
                { what: 'Питание', mine: '−1 800', theirs: '−1 800', diff: '' },
                { what: 'В котёл', mine: '−385', theirs: '−385', diff: '' },
                { what: 'Налог', mine: '−5 845', theirs: '−5 768', diff: '+77' },
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
                <td className="pt-3 text-right font-semibold tabular">23 040</td>
                <td className="pt-3 text-right font-semibold tabular">22 722</td>
                <td className="pt-3 text-right font-bold text-taken tabular">−318</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Чаевые — рядом с итогом, а не внутри него" hint="Их платит гость, а не заведение.">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">Чаевые за период</span>
              <span className="font-mono text-sm font-semibold text-money tabular">₴7 700</span>
            </div>
            <p className="hint">
              В расчётке их нет и не должно быть: заведение их не начисляет. Мы держим их отдельной
              строкой, чтобы вы не искали в бумаге то, чего там не бывает.
            </p>
            <div className="flex items-baseline justify-between gap-3 border-t border-paper/9 pt-2.5">
              <span className="text-sm font-semibold">С чаевыми на руки</span>
              <span className="font-mono text-sm font-bold text-money tabular">₴30 740</span>
            </div>
          </div>
        </Card>

        <Card title="Отпускные" hint="Копятся сами, вспоминают о них при увольнении.">
          <p className="text-2xl font-bold tabular">4,2 дня</p>
          <p className="hint mt-1">
            2,33 дня за отработанный месяц. По нынешней ставке это ₴6 300 — их обязаны выплатить,
            если вы уйдёте, не отгуляв.
          </p>
        </Card>
      </div>

      <Card title="О чём спрашивать" hint="Готовая формулировка — её можно показать менеджеру.">
        <p className="text-sm text-dim">
          За август у меня 62 ночных часа при коэффициенте 1,35 — это ₴1 095 надбавки. В
          расчётке стоит ₴700 и всего 46 ночных часов. Разница ₴395; итог на руки расходится
          на ₴318.
        </p>
        <div className="mt-3 flex gap-2">
          <Button tone="line" size="sm">Скопировать</Button>
          <Button tone="quiet" size="sm">Показать, откуда цифры</Button>
        </div>
        <p className="hint mt-3 border-t border-paper/9 pt-3">
          Печатается на одну страницу. Подработки в евро в эту сверку не входят — расчётка их не
          знает, и смешивать валюты в одном итоге незачем.
        </p>
      </Card>
    </>
  );
}

export const Route = createFileRoute('/_app/payslip')({ component: Payslip });
