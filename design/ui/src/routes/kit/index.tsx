import { createFileRoute } from '@tanstack/react-router';
import { CalendarPlus, Coffee, Landmark } from 'lucide-react';

import { Sheet, Plate } from '@/components/frame';
import { Bars, Button, Card, Empty, Field, Pills, Split, Switch } from '@/components/ui/kit';

const COLOURS = [
  ['Ночь', '#0b0a09', 'фон'],
  ['Стол', '#121110', 'карточки'],
  ['Приподнято', '#1a1816', 'окна'],
  ['Латунь', '#e0a45b', 'единственный акцент'],
  ['Пришло', '#7fbf7a', 'деньги в плюс'],
  ['Удержали', '#d9705f', 'деньги в минус'],
  ['Бумага', '#f2ede6', 'текст'],
  ['Тусклая', '#b5ada3', 'второй план'],
  ['Бледная', '#7c746b', 'служебное'],
] as const;

function Foundations() {
  return (
    <Sheet
      kicker="01 · Основа"
      title="Из чего собрано всё остальное"
      blurb="Девять цветов, два шрифта и десяток примитивов. Любой из шестидесяти экранов складывается только из них — если для экрана понадобилось что-то ещё, значит ошиблись здесь."
    >
      <Plate
        title="Цвет"
        path="палитра"
        why="Тёплая темнота, а не сине-чёрная: сине-чёрный читается как офисный дашборд. Акцент один — латунь. Зелёный и красно-глиняный зарезервированы под деньги и больше нигде не появляются."
      >
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {COLOURS.map(([name, hex, what]) => (
            <div key={name} className="overflow-hidden rounded-xl border border-paper/9">
              <div className="h-16" style={{ background: hex }} />
              <div className="p-2.5">
                <div className="text-xs">{name}</div>
                <div className="font-mono text-2xs text-faint">{hex}</div>
                <div className="mt-0.5 text-2xs text-faint">{what}</div>
              </div>
            </div>
          ))}
        </div>
      </Plate>

      <Plate
        title="Шрифт"
        path="типографика"
        why="Деньги — крупно, плотно и табличными цифрами: их сравнивают взглядом по столбцу. Служебные подписи моноширинные и разрежённые — так они не спорят с деньгами за внимание."
      >
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <span className="lbl">Деньги · 800 · табличные</span>
              <p className="mt-1 text-5xl font-extrabold tracking-[-0.05em] tabular">₴24 700</p>
            </div>
            <div>
              <span className="lbl">Заголовок · 700</span>
              <p className="mt-1 text-2xl font-bold">Понедельник, 31 августа</p>
            </div>
            <div>
              <span className="lbl">Текст · 400</span>
              <p className="mt-1 text-dim">Осталось ₴10 100 за 7 дней — по ₴1 443 в день.</p>
            </div>
            <div>
              <span className="lbl">Служебное · моно · 0.13em</span>
              <p className="mt-1 font-mono text-xs tracking-[0.13em] text-faint">
                17:00–01:00 · 8,5 Ч · БАР
              </p>
            </div>
            <div>
              <span className="lbl">Чек · моно</span>
              <p className="mt-1 font-mono text-sm tabular">8,0 ч × ₴200 — 1 600</p>
            </div>
          </div>
        </Card>
      </Plate>

      <Plate title="Кнопки" path="действия" why="Латунная кнопка на экране одна: если их две, ни одна не главная.">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button tone="go">Сохранить</Button>
            <Button tone="line">Отмена</Button>
            <Button tone="quiet">Старая версия</Button>
            <Button tone="danger">Удалить</Button>
            <Button tone="go" size="sm">Мелкая</Button>
            <Button tone="line" size="lg">Крупная</Button>
          </div>
        </Card>
      </Plate>

      <Plate title="Поля и переключатели" path="ввод">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex flex-col gap-3">
              <Field label="Название" value="Вечер, бар" />
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Начало" value="17:00" />
                <Field label="Конец" value="01:00" />
              </div>
              <Field label="Заметка" placeholder="—" area />
            </div>
          </Card>
          <Card>
            <div className="flex flex-col gap-4">
              <div>
                <span className="lbl">Выбор одного</span>
                <Pills className="mt-2" options={['в час', 'в день', 'в неделю', 'в месяц']} value="в час" />
              </div>
              <div className="flex flex-col gap-3 border-t border-paper/9 pt-4">
                <Switch on label="Названия смен в клетке" />
                <Switch label="Заработок в клетке" hint="Суммы видно прямо на сетке." />
                <Switch on label="Прятать суммы" hint="Числа заменяются точками." />
              </div>
            </div>
          </Card>
        </div>
      </Plate>

      <Plate
        title="Данные"
        path="полосы и доли"
        why="Полоса — сравнение, цифра рядом — ответ. Ни одного графика без числа: по картинке нельзя назвать сумму."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Где чаевые гуще" hint="За час, действительно проведённый там.">
            <Bars
              rows={[
                { name: 'бар', under: '77 ч', share: 100, value: '₴111/ч', tone: 'brass' },
                { name: 'зал', under: '98 ч', share: 39, value: '₴43/ч' },
                { name: 'терраса', under: '24 ч', share: 62, value: '₴69/ч' },
              ]}
            />
          </Card>
          <Card title="Из чего сложились деньги">
            <p className="mb-3 text-2xl font-bold tabular">₴24 700</p>
            <Split
              parts={[
                { name: 'ставка', share: 64, colour: '#e0a45b' },
                { name: 'чаевые', share: 31, colour: '#7fbf7a' },
                { name: 'надбавки', share: 5, colour: '#b5ada3' },
              ]}
            />
          </Card>
        </div>
      </Plate>

      <Plate
        title="Пустые состояния"
        path="когда данных нет"
        why="Пустой экран — это тоже экран. Он говорит, что делать дальше, а не извиняется."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Empty
            glyph={<CalendarPlus className="size-6" />}
            title="Пока ни одной смены"
            said="Заведите ту, что работаете чаще всего."
            action="Завести первую"
          />
          <Empty
            glyph={<Landmark className="size-6" />}
            title="Банк не подключён"
            said="Токен только на чтение, из этого браузера прямо в банк."
            action="Посмотреть на примере"
          />
          <Empty
            glyph={<Coffee className="size-6" />}
            title="В этот день смен нет"
            said="Выходной — тоже день. Его можно отметить."
          />
        </div>
      </Plate>
    </Sheet>
  );
}

export const Route = createFileRoute('/kit/')({ component: Foundations });
