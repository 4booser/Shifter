import { createFileRoute } from '@tanstack/react-router';

import { Climb } from '@/components/calendar';
import { Head } from '@/components/screen';
import { Bars, Card, Pills } from '@/components/ui/kit';
import { CLIMB } from '@/mock/data';

/** Два периода рядом: разницу считает приложение, а не глаз по колонкам. */
function Compare() {
  return (
    <>
      <Head
        said="Сравнение"
        title="Август против июля"
        right={<Pills options={['Месяцы', 'Кварталы', 'Годы']} value="Месяцы" />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <Card title="Заработано" hint="Плотная линия — август, бледная — июль.">
          <Climb points={CLIMB} height={220} />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="По дням недели" hint="Где месяцы разошлись сильнее всего.">
          <Bars rows={[
            { name: 'суббота', under: 'было ₴2 100', share: 100, value: '+14%', tone: 'money' },
            { name: 'пятница', under: 'было ₴2 190', share: 92, value: '+1%', tone: 'quiet' },
            { name: 'среда', under: 'было ₴1 620', share: 62, value: '−14%', tone: 'taken' },
          ]} />
        </Card>

        <Card title="Что стоит знать" hint="Выводы, а не цифры: цифры выше.">
          <ul className="flex flex-col gap-2.5 text-sm text-dim">
            <li>Час подорожал на 8% — вечерних смен стало больше, чем дневных.</li>
            <li>Чаевые упали при выросших часах: пять смен пришлись на отпускную неделю зала.</li>
            <li>Удержания выросли вдвое из-за одного штрафа в ₴700.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/compare')({ component: Compare });
