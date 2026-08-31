import { createFileRoute } from '@tanstack/react-router';

import { Climb } from '@/components/calendar';
import { Head } from '@/components/screen';
import { Bars, Card, Pills, Split } from '@/components/ui/kit';
import { CLIMB, WEEKDAY_PAY } from '@/mock/data';

function Stats() {
  return (
    <>
      <Head said="Август" title="Статистика" right={<Pills options={['Месяц', 'Год']} value="Месяц" />} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { said: 'Заработано', num: '₴24 700', delta: '↓ 4%' },
          { said: 'Часов', num: '137', delta: '↑ 7%' },
          { said: 'Смен', num: '17', delta: '↓ 4%' },
          { said: 'В час', num: '₴180', delta: '↑ 8%' },
        ].map(({ said, num, delta }) => (
          <div key={said} className="card p-4">
            <span className="lbl">{said}</span>
            <p className="mt-1.5 text-2xl font-bold tabular">{num}</p>
            <p className={`text-xs font-semibold tabular ${delta.startsWith('↑') ? 'text-money' : 'text-taken'}`}>{delta}</p>
          </div>
        ))}
      </div>

      <Card title="Заработано за период" hint="Плато посередине — отпуск, а не сломанный график.">
        <Climb points={CLIMB} height={200} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Из чего сложились деньги" hint="Ставка, чаевые и всё, что сверху.">
          <p className="mb-3 text-2xl font-bold tabular">₴24 700</p>
          <Split parts={[
            { name: 'ставка', share: 64, colour: '#e0a45b' },
            { name: 'чаевые', share: 31, colour: '#7fbf7a' },
            { name: 'надбавки', share: 5, colour: '#b5ada3' },
          ]} />
        </Card>

        <Card title="Какой день недели платит" hint="Средний заработок за отработанный день.">
          <Bars rows={WEEKDAY_PAY.map((row) => ({ ...row, tone: row.name === 'сб' ? 'brass' as const : undefined }))} />
        </Card>

        <Card title="Где чаевые гуще" hint="За час, действительно проведённый там.">
          <Bars rows={[
            { name: 'бар', under: '77 ч', share: 100, value: '₴111/ч', tone: 'brass' },
            { name: 'терраса', under: '24 ч', share: 62, value: '₴69/ч' },
            { name: 'зал', under: '98 ч', share: 39, value: '₴43/ч' },
          ]} />
        </Card>

        <Card title="Что ещё случилось" hint="Мелочи, которые обычно негде увидеть.">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
            {[
              ['Лучший день', '₴2 470'], ['Ночных часов', '62'],
              ['Надбавки', '₴2 142'], ['Отдано в котёл', '₴634'],
              ['Удержано', '₴2 230'], ['Налог', '₴5 955'],
              ['Гостей', '990'], ['Средний чек', '₴126'],
            ].map(([what, value]) => (
              <div key={what}>
                <dt className="lbl">{what}</dt>
                <dd className="text-sm font-semibold tabular">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/stats')({ component: Stats });
