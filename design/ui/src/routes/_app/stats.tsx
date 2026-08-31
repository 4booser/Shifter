import { createFileRoute } from '@tanstack/react-router';
import { FileText, Pencil, Share2 } from 'lucide-react';

import { Climb } from '@/components/calendar';
import { Columns, Dial, Meter, Track, Week } from '@/components/charts';
import { Head } from '@/components/screen';
import { Bars, Button, Card, Pills } from '@/components/ui/kit';
import { CLIMB } from '@/mock/data';
import { cn } from '@/lib/utils';

/**
 * Статистика.
 *
 * Самый длинный экран приложения, и это его свойство, а не недосмотр: он
 * отвечает на вопросы, которые задают раз в месяц и по одному. Порядок —
 * от «сколько вышло» к «почему столько» и дальше к «а это нормально».
 */

/** Сколько приносит каждый час суток, от 0 до 23. */
const CLOCK = [
  62, 41, 18, 0, 0, 0, 0, 0, 12, 34, 58, 96, 140, 132, 118, 126, 168, 214, 262, 288, 301, 317, 296, 184,
];

const SPANS = [
  { day: 'ПН', from: 11, to: 19, perHour: '₴164' },
  { day: 'ВТ', from: 11, to: 19, perHour: '₴158' },
  { day: 'СР', from: 16, to: 24, perHour: '₴181' },
  { day: 'ЧТ', from: 16, to: 24.5, perHour: '₴190' },
  { day: 'ПТ', from: 17, to: 26, perHour: '₴228' },
  { day: 'СБ', from: 17, to: 27, perHour: '₴247' },
  { day: 'ВС', from: 13, to: 21, perHour: '₴172' },
];

const HOURLY = [162, 164, 161, 165, 163, 166, 181, 179, 183, 180, 184, 182, 186, 185];

const YEAR = [
  { name: 'С', kept: 19400, cut: 4100 },
  { name: 'О', kept: 21200, cut: 4600 },
  { name: 'Н', kept: 20100, cut: 4300 },
  { name: 'Д', kept: 27800, cut: 6100 },
  { name: 'Я', kept: 16200, cut: 3400 },
  { name: 'Ф', kept: 18700, cut: 3900 },
  { name: 'М', kept: 20400, cut: 4300 },
  { name: 'А', kept: 21900, cut: 4700 },
  { name: 'М', kept: 23100, cut: 4900 },
  { name: 'И', kept: 22400, cut: 4800 },
  { name: 'И', kept: 17300, cut: 3700 },
  { name: 'А', kept: 24700, cut: 5300 },
];

/** Из чего сложились деньги: сначала то, что пришло, потом то, что срезали. */
const CAME = [
  { name: 'Ставка', num: 15800, note: '137 ч × ₴180' },
  { name: 'Чаевые', num: 7700, note: 'из них ₴2 900 наличными' },
  { name: 'Продажи', num: 2142, note: '3% с выручки ₴71 400' },
  { name: 'Надбавки', num: 1830, note: 'ночные и праздничные' },
  { name: 'Сверхурочные', num: 1284, note: '9 ч сверх недельной нормы' },
];

const CUT = [
  { name: 'Налог', num: 5955, note: 'официально, 19,5%' },
  { name: 'В котёл', num: 634, note: '5% от чаевых' },
  { name: 'Питание и штрафы', num: 1240, note: '22 обеда и один бой посуды' },
];

function Money({ n }: { n: number }) {
  return <>₴{n.toLocaleString('ru-RU')}</>;
}

function Stats() {
  const came = CAME.reduce((sum, one) => sum + one.num, 0);
  const cut = CUT.reduce((sum, one) => sum + one.num, 0);
  const peak = Math.max(...CAME.map((one) => one.num));

  return (
    <>
      <Head
        said="1 — 31 августа"
        title="Статистика"
        right={
          <>
            <Pills options={['Месяц', 'Год', 'Свой']} value="Месяц" />
            <Button tone="line" size="sm">
              <FileText className="size-3.5" />
              Отчёт
            </Button>
            <Button tone="line" size="sm">
              <Share2 className="size-3.5" />
              Сторис
            </Button>
          </>
        }
      />

      {/* Шесть чисел, которыми месяц описывают вслух. */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { said: 'Заработано', num: '₴24 700', delta: '↓ 4%' },
          { said: 'На руки', num: '₴18 745', delta: '↓ 5%' },
          { said: 'Часов', num: '137', delta: '↑ 7%' },
          { said: 'Смен', num: '17', delta: '↓ 4%' },
          { said: 'В час', num: '₴180', delta: '↑ 8%' },
          { said: 'Средний день', num: '₴1 453', delta: '↓ 1%' },
        ].map(({ said, num, delta }) => (
          <div key={said} className="card p-4">
            <span className="lbl">{said}</span>
            <p className="mt-1.5 text-xl font-bold tabular">{num}</p>
            <p
              className={cn(
                'text-xs font-semibold tabular',
                delta.startsWith('↑') ? 'text-money' : 'text-taken',
              )}
            >
              {delta}
            </p>
          </div>
        ))}
      </div>

      <p className="hint -mt-1">
        Работа в двух валютах сведена в одну по курсу, по которому банк покупает: ₴24 700 — это
        ₴21 300 и 78 € за подработки на террасе.
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card
          title="Заработано за период"
          hint="Накопительно, день за днём. Плато посередине — отпуск, а не сломанный график."
        >
          <Climb points={CLIMB} height={200} />
          <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-paper/9 pt-3">
            <span className="hint">К концу периода выйдет ₴26 100</span>
            <span className="hint">Прошлый период: ₴25 700</span>
          </div>
        </Card>

        <Card
          title="Цель на месяц"
          right={
            <Button tone="quiet" size="sm">
              <Pencil className="size-3.5" />
              Изменить
            </Button>
          }
        >
          <Meter reached={24700} goal={28000} projected={26100} />

          <dl className="mt-4 flex flex-col gap-2.5 border-t border-paper/9 pt-4">
            {[
              ['Осталось добрать', '₴3 300'],
              ['Дней в периоде', '1'],
              ['Уже поставлено смен', '1 · ₴1 640'],
              ['Чтобы дотянуть', 'нужна ещё одна суббота'],
            ].map(([what, value]) => (
              <div key={what} className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-faint">{what}</dt>
                <dd className="font-mono text-xs font-semibold tabular">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="hint mt-3">
            Белая метка на полосе — куда период приедет, если дальше идти тем же ходом.
          </p>
        </Card>
      </div>

      {/* Из чего сложились деньги: один тон и подписи. Пять оттенков,
          которые при дальтонизме сливаются в один, хуже честного списка. */}
      <Card
        title="Из чего сложились деньги"
        hint="Всё, что пришло, — сверху. Всё, что срезали, — под чертой."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-2.5">
            {CAME.map((one) => (
              <div key={one.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{one.name}</span>
                  <span className="font-mono text-sm font-semibold tabular">
                    <Money n={one.num} />
                  </span>
                </div>
                <span className="mt-1 block h-1.5 rounded-full bg-deep">
                  <span
                    className="block h-full rounded-full bg-brass"
                    style={{ width: `${(one.num / peak) * 100}%` }}
                  />
                </span>
                <span className="lbl mt-1 block">{one.note}</span>
              </div>
            ))}

            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-paper/9 pt-2.5">
              <span className="text-sm font-semibold">Начислено</span>
              <span className="font-mono text-sm font-bold tabular">
                <Money n={came} />
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {CUT.map((one) => (
              <div key={one.name} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm">{one.name}</span>
                  <span className="lbl">{one.note}</span>
                </span>
                <span className="font-mono text-sm font-semibold text-taken tabular">
                  −<Money n={one.num} />
                </span>
              </div>
            ))}

            <div className="tear my-2" />

            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">На руки</span>
              <span className="font-mono text-2xl font-bold text-money tabular">
                <Money n={came - cut} />
              </span>
            </div>
            <p className="hint">
              Срезали <Money n={cut} /> — это {((cut / came) * 100).toFixed(0)}% от начисленного.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Сутки по кругу" hint="Час за часом, за весь период.">
          <Dial hours={CLOCK} />
        </Card>

        <Card title="Форма недели" hint="Когда день начинается, когда кончается и что платит его час.">
          <Week spans={SPANS} />
        </Card>
      </div>

      <Card
        title="Ваш час, неделя за неделей"
        hint="Прибавку видно и так. Тихое снижение — только здесь."
      >
        <Track points={HOURLY} marks={[{ at: 6, said: '18 июня — ставка выросла со ₴163 до ₴181' }]} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Места рядом" hint="Заработок за час, действительно проведённый там.">
          <Bars
            rows={[
              { name: 'Полночь', under: '77 ч', share: 100, value: '₴211/ч', tone: 'brass' },
              { name: 'Веранда', under: '24 ч', share: 74, value: '₴156/ч' },
              { name: 'Зерно', under: '36 ч', share: 61, value: '₴129/ч' },
              { name: 'Подработки', under: '9 ч', share: 0, value: 'нет ставки', tone: 'quiet' },
            ]}
          />
          <p className="hint mt-3 border-t border-paper/9 pt-3">
            У подработок ставка не задана — эти девять часов не участвуют в среднем.
          </p>
        </Card>

        <Card title="Чаевые: наличные против карты" hint="Наличные видит только тот, кто их записал.">
          <div className="flex flex-col gap-3">
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
              <span className="bg-brass" style={{ width: '38%' }} />
              <span className="bg-brass/45" style={{ width: '62%' }} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {[
                ['Наличными', '₴2 900', 'bg-brass'],
                ['На карту', '₴4 800', 'bg-brass/45'],
              ].map(([name, num, paint]) => (
                <span key={name} className="flex items-center gap-2 text-xs">
                  <span className={cn('size-2 rounded-full', paint)} />
                  <span className="text-dim">{name}</span>
                  <b className="font-mono font-semibold tabular">{num}</b>
                </span>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-paper/9 pt-3">
              {[
                ['На смену', '₴453'],
                ['Лучшая смена', '₴1 240'],
                ['Доля в заработке', '31%'],
                ['Отдано в котёл', '₴634'],
              ].map(([what, value]) => (
                <div key={what}>
                  <dt className="lbl">{what}</dt>
                  <dd className="font-mono text-sm font-semibold tabular">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Во сколько работа обошлась"
          hint="Этих денег нет в суммах выше — они уходят до того, как их посчитали."
        >
          <Bars
            rows={[
              { name: 'Такси домой', under: '14 раз', share: 100, value: '₴2 380', tone: 'taken' },
              { name: 'Проезд', under: '21 раз', share: 34, value: '₴812', tone: 'taken' },
              { name: 'Форма и обувь', under: '1 раз', share: 25, value: '₴600', tone: 'taken' },
              { name: 'Кофе на смене', under: '17 раз', share: 14, value: '₴340', tone: 'taken' },
            ]}
          />
          <div className="mt-3 flex flex-wrap justify-between gap-3 border-t border-paper/9 pt-3">
            <span className="hint">Час с дорогой и тратами</span>
            <span className="font-mono text-sm font-semibold tabular">₴149 вместо ₴180</span>
          </div>
        </Card>

        <Card title="Этот месяц нормальный?" hint="Сравнение не с чужими, а с вашими же двенадцатью.">
          <div className="flex flex-col gap-3">
            {[
              { what: 'Заработок', mine: 24700, low: 16200, high: 27800, said: 'выше обычного' },
              { what: 'Часы', mine: 137, low: 96, high: 164, said: 'как всегда' },
              { what: 'Час', mine: 180, low: 158, high: 186, said: 'у верхней границы' },
            ].map((row) => (
              <div key={row.what}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{row.what}</span>
                  <span className="hint">{row.said}</span>
                </div>
                <span className="relative mt-1.5 block h-2 rounded-full bg-deep">
                  <span
                    className="absolute top-0 h-full w-1 rounded-full bg-brass"
                    style={{ left: `${((row.mine - row.low) / (row.high - row.low)) * 100}%` }}
                  />
                </span>
                <div className="mt-1 flex justify-between">
                  <span className="lbl">{row.low.toLocaleString('ru-RU')}</span>
                  <span className="lbl">{row.high.toLocaleString('ru-RU')}</span>
                </div>
              </div>
            ))}
            <p className="hint border-t border-paper/9 pt-3">
              Декабрь и май всегда выше — сравнивать август стоит с августом, а не со средним.
            </p>
          </div>
        </Card>
      </div>

      <Card title="Двенадцать месяцев" hint="Из чего собрался каждый: что осталось и что срезали.">
        <Columns months={YEAR} />
      </Card>
    </>
  );
}

export const Route = createFileRoute('/_app/stats')({ component: Stats });
