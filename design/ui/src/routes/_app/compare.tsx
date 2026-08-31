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
        <Card title="Заработано" hint="Плотная линия — август, пунктир — июль. Шкала у них одна.">
          <Climb points={CLIMB} ghost={CLIMB.map((one) => one * 0.918)} height={220} />
        </Card>

        <Card title="Что изменилось" hint="Накопительно, по рабочим дням: выходные не растягивают линию.">
          <Bars rows={[
            { name: 'Заработано', under: 'было ₴35 600', share: 100, value: '+9%', tone: 'money' },
            { name: 'Часы', under: 'было 152 ч', share: 72, value: '+7%', tone: 'money' },
            { name: 'Твой час', under: 'было ₴234', share: 20, value: '+2%', tone: 'money' },
            { name: 'Чаевые', under: 'было ₴8 900', share: 62, value: '−13%', tone: 'taken' },
            { name: 'Удержали', under: 'было ₴7 400', share: 45, value: '+9%', tone: 'taken' },
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Час вырос" hint="Главное число сравнения — остальное следствие.">
          <p className="text-2xl font-bold tabular">
            ₴234 <span className="text-base font-normal text-faint">→</span> ₴238
          </p>
          <p className="hint mt-1">
            Плюс ₴4 в час. На 163 часах это ₴652 — остальные ₴2 518 разницы дали одиннадцать
            лишних часов, а не подорожавший час.
          </p>
          <p className="hint mt-3 border-t border-paper/9 pt-3">
            Различать это важно: час дорожает раз в полгода, а часы добираются каждым выходом.
          </p>
        </Card>

        <Card title="Август впереди июля" hint="По дням, а не по итогу.">
          <div className="flex flex-col gap-2.5">
            {[
              { what: 'К 10-му числу', said: 'август опережал на ₴1 200' },
              { what: 'К 20-му', said: 'отставал на ₴900 — отпуск' },
              { what: 'К 31-му', said: 'впереди на ₴3 170' },
            ].map((one) => (
              <div key={one.what} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm">{one.what}</span>
                <span className="hint">{one.said}</span>
              </div>
            ))}
            <p className="hint mt-1 border-t border-paper/9 pt-2.5">
              Месяц выигрывается не ровным ходом: две недели он проигрывал и всё равно вышел
              вперёд за последнюю.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/compare')({ component: Compare });
