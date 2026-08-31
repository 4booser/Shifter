import { createFileRoute } from '@tanstack/react-router';
import { Printer, Share2 } from 'lucide-react';

import { Frame, Plate, Sheet } from '@/components/frame';
import { Bars, Button, Card, Pills } from '@/components/ui/kit';
import { Climb } from '@/components/calendar';
import { CLIMB } from '@/mock/data';

/**
 * Бумаги: то, что человек показывает кому-то ещё.
 *
 * Отчёт печатают, расчётку сверяют с бухгалтерией, справку о доходе несут в
 * банк. Поэтому здесь единственное место во всём макете, где допустима
 * светлая бумага: чёрный лист на принтере — это картридж и ничего больше.
 */
function Papers() {
  return (
    <Sheet
      kicker="06 · Бумаги"
      title="То, что показывают другим"
      blurb="Отчёт, расчётка, справка. Единственное место, где вид переворачивается в светлый: эти экраны печатают и пересылают, а чёрный лист на принтере — это перевод краски."
    >
      <Plate
        title="Отчёт за месяц"
        path="/report"
        why="Свод, который отдают бухгалтеру или себе в архив. Сверху — итог одной строкой, ниже — из чего он сложился."
      >
        <Frame tab="Год">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="lbl">Отчёт</span>
              <h2 className="mt-1 text-2xl font-bold">Август 2026</h2>
            </div>
            <span className="flex gap-2">
              <Button tone="line" size="sm"><Printer className="size-3.5" />Печать</Button>
              <Button tone="line" size="sm"><Share2 className="size-3.5" />XLSX</Button>
              <Pills options={['Месяц', 'Год']} value="Месяц" />
            </span>
          </div>

          {/* Светлый лист внутри тёмного приложения: это бумага, а не экран. */}
          <div className="rounded-[var(--radius-card)] bg-paper p-8 text-night">
            <div className="flex items-baseline justify-between border-b border-night/15 pb-4">
              <div>
                <p className="font-mono text-2xs tracking-[0.14em] text-night/50 uppercase">
                  Shifter · отчёт за период
                </p>
                <p className="mt-1 text-xl font-bold">1 — 31 августа 2026</p>
                <p className="text-sm text-night/60">Аня · Бар «Сова», Ресторан «Дым»</p>
              </div>
              <p className="text-3xl font-extrabold tabular">₴24 700</p>
            </div>

            <table className="mt-5 w-full border-collapse font-mono text-sm">
              <tbody>
                {[
                  ['Смены · 137 ч', '19 480'],
                  ['Чаевые', '7 700'],
                  ['Надбавки за ночь', '2 142'],
                  ['Отдано в котёл', '−634'],
                  ['Питание', '−1 530'],
                  ['Штраф · разбили', '−700'],
                ].map(([what, sum]) => (
                  <tr key={what} className="border-b border-night/10">
                    <td className="py-2 text-night/70">{what}</td>
                    <td className="py-2 text-right tabular">{sum}</td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-3 font-semibold">Итого до налога</td>
                  <td className="pt-3 text-right font-semibold tabular">26 458</td>
                </tr>
                <tr>
                  <td className="py-1 text-night/70">Налог 19,5%</td>
                  <td className="py-1 text-right tabular">−5 159</td>
                </tr>
                <tr className="border-t-2 border-night/70">
                  <td className="pt-2 text-base font-bold">На руки</td>
                  <td className="pt-2 text-right text-base font-bold tabular">₴21 299</td>
                </tr>
              </tbody>
            </table>

            <p className="mt-5 font-mono text-2xs text-night/45">
              Собрано приложением из отмеченных смен. Не является платёжным документом.
            </p>
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Проверка расчётки"
        path="/payslip"
        why="Единственный экран, который спорит с работодателем. Слева — что насчитало приложение, справа — что написано в расчётке, и цветом только расхождение."
      >
        <Frame tab="Выплаты">
          <div>
            <span className="lbl">Сверка</span>
            <h2 className="mt-1 text-2xl font-bold">Расчётка за август</h2>
            <p className="hint mt-1">Сходится всё, кроме надбавки за ночь — недосчитали ₴642.</p>
          </div>

          <Card>
            <table className="w-full border-collapse font-mono text-sm">
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
                  ['Часы', '137', '137', ''],
                  ['Ставка', '19 480', '19 480', ''],
                  ['Ночные', '2 142', '1 500', '−642'],
                  ['Чаевые', '7 700', '7 700', ''],
                  ['Питание', '−1 530', '−1 530', ''],
                ].map(([what, mine, theirs, diff]) => (
                  <tr key={what} className="border-t border-paper/9">
                    <td className="py-2.5 text-dim">{what}</td>
                    <td className="py-2.5 text-right tabular">{mine}</td>
                    <td className="py-2.5 text-right tabular">{theirs}</td>
                    <td className={`py-2.5 text-right tabular ${diff === '' ? 'text-faint' : 'font-bold text-taken'}`}>
                      {diff === '' ? '—' : diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Frame>
      </Plate>

      <Plate
        title="Сравнение периодов"
        path="/compare"
        why="Два месяца рядом. Разница считается за вас — сравнивать колонки цифр глазами люди не умеют и не должны."
      >
        <Frame tab="Год">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="lbl">Сравнение</span>
              <h2 className="mt-1 text-2xl font-bold">Август против июля</h2>
            </div>
            <Pills options={['Месяцы', 'Кварталы', 'Годы']} value="Месяцы" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <Card title="Заработано" hint="Плотная линия — август, бледная — июль.">
              <Climb points={CLIMB} />
            </Card>
            <Card title="Что изменилось">
              <Bars rows={[
                { name: 'Заработано', under: 'было ₴21 400', share: 100, value: '+15%', tone: 'money' },
                { name: 'Часы', under: 'было 128 ч', share: 40, value: '+7%', tone: 'money' },
                { name: 'Твой час', under: 'было ₴167', share: 55, value: '+8%', tone: 'money' },
                { name: 'Чаевые', under: 'было ₴8 900', share: 62, value: '−13%', tone: 'taken' },
                { name: 'Удержали', under: 'было ₴1 100', share: 88, value: '+103%', tone: 'taken' },
              ]} />
            </Card>
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Справка о доходе"
        path="/contract · /cv"
        why="Бумага для банка или арендодателя. Собирается из того же, из чего отчёт, но говорит одно число и период."
      >
        <Frame tab="Выплаты">
          <div className="rounded-[var(--radius-card)] bg-paper p-10 text-night">
            <p className="font-mono text-2xs tracking-[0.14em] text-night/50 uppercase">
              Справка о доходе
            </p>
            <h3 className="mt-3 text-2xl font-bold">Аня Проба</h3>
            <p className="mt-1 text-night/60">Бармен · Бар «Сова», Днепр</p>

            <div className="mt-7 grid gap-5 sm:grid-cols-3">
              {[
                ['За период', 'мар — авг 2026'],
                ['Средний месяц', '₴22 480'],
                ['Всего', '₴134 880'],
              ].map(([what, value]) => (
                <div key={what}>
                  <p className="font-mono text-2xs tracking-[0.12em] text-night/50 uppercase">{what}</p>
                  <p className="mt-1 text-xl font-bold tabular">{value}</p>
                </div>
              ))}
            </div>

            <p className="mt-8 font-mono text-2xs text-night/45">
              Сформировано 31 августа 2026. Основано на сменах, отмеченных владельцем аккаунта.
            </p>
          </div>
        </Frame>
      </Plate>
    </Sheet>
  );
}

export const Route = createFileRoute('/papers')({ component: Papers });
