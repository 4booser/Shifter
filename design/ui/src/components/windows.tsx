import { ReactNode } from 'react';

import { Button, Field, Modal, Over, Pills, Switch } from '@/components/ui/kit';
import { cn } from '@/lib/utils';

/**
 * Окна приложения.
 *
 * Собраны в одном месте, потому что собираются из одного набора частей:
 * заголовок, строка пояснения, поля, одно латунное действие. Экран, который
 * их открывает, знает только имя окна — что внутри, решается здесь.
 */
export type Window =
  | null
  | 'goal'
  | 'event'
  | 'sales'
  | 'search'
  | 'conflict'
  | 'photo'
  | 'ics'
  | 'foreign'
  | 'rotation'
  | 'scheme'
  | 'pattern'
  | 'payout'
  | 'deletePlace'
  | 'review'
  | 'callback';

const FOOT = (close: () => void, go: string, cancel = 'Отмена') => (
  <>
    <span onClick={close}><Button tone="line" className="w-full">{cancel}</Button></span>
    <span onClick={close}><Button tone="go" className="w-full">{go}</Button></span>
  </>
);

export function Windows({ open, onClose }: { open: Window; onClose: () => void }) {
  const shut = () => onClose();

  const box = (name: Window, node: ReactNode) => (
    <Over open={open === name} onClose={shut}>
      {node}
    </Over>
  );

  return (
    <>
      {box('goal', (
        <Modal
          title="Цель"
          said="Сколько хотите зарабатывать. Приложение посчитает, по сколько выходит в день."
          foot={FOOT(shut, 'Поставить')}
        >
          <Pills options={['в неделю', 'в месяц', 'в год']} value="в месяц" />
          <Field label="Сколько" value="40 000" />
          <p className="hint">Сейчас выходит ₴38 770 — до цели ₴3 230.</p>
        </Modal>
      ))}

      {box('event', (
        <Modal
          title="День без смены"
          said="Отпуск и больничный не считаются днями без работы — прогноз их не трогает."
          foot={FOOT(shut, 'Сохранить', 'Убрать')}
        >
          <Pills options={['обычное', 'отпуск', 'больничный', 'выходной']} value="отпуск" />
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="С" value="15.08.2026" />
            <Field label="По" value="19.08.2026" />
          </div>
          <Field label="Заметка" placeholder="—" area />
        </Modal>
      ))}

      {box('sales', (
        <Modal
          title="Позиция"
          said="То, за что платят с продажи: коктейль, кальян, депозит."
          foot={FOOT(shut, 'Сохранить')}
        >
          <Field label="Название" value="Авторский коктейль" />
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Цена" value="380" />
            <Field label="Ваш процент" value="7,5" />
          </div>
          <p className="hint">С каждой продажи выходит ₴28,50.</p>
        </Modal>
      ))}

      {box('search', (
        <Modal title="Поиск" said="Смены, места, дни, суммы — всё одним полем.">
          <Field placeholder="Найти смену, место или сумму" value=">2000" />
          <div className="flex flex-col">
            {[
              ['1 августа', 'Вечер · ₴2 470'],
              ['7 августа', 'Вечер · ₴2 470'],
              ['14 августа', 'Вечер · ₴2 470'],
              ['22 августа', 'Вечер · ₴2 470'],
            ].map(([when, what]) => (
              <span key={when} className="flex items-center justify-between gap-3 border-b border-paper/9 py-2 last:border-0">
                <span className="text-sm">{when}</span>
                <span className="font-mono text-xs text-dim tabular">{what}</span>
              </span>
            ))}
          </div>
          <p className="hint">Понимает «&gt;2000», «бар», «июль», «отпуск».</p>
        </Modal>
      ))}

      {box('conflict', (
        <Modal
          title="День изменён на другом устройстве"
          said="Ничего не склеивается автоматически — выберите, что оставить."
          foot={
            <>
              <span onClick={shut}><Button tone="line" className="w-full">Оставить их</Button></span>
              <span onClick={shut}><Button tone="line" className="w-full">Записать мою</Button></span>
            </>
          }
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-[var(--radius-field)] border border-paper/17 p-3">
              <span className="lbl">На телефоне</span>
              <p className="mt-1 font-mono text-sm tabular">1 смена · чай 400</p>
              <p className="hint">17:12–01:40</p>
            </div>
            <div className="rounded-[var(--radius-field)] border border-brass p-3">
              <span className="lbl">Здесь</span>
              <p className="mt-1 font-mono text-sm tabular">1 смена · чай 550</p>
              <p className="hint">17:00–01:00</p>
            </div>
          </div>
        </Modal>
      ))}

      {box('photo', (
        <Modal
          title="Фото графика"
          said="Снимите доску в подсобке — приложение разберёт, кто и когда выходит."
          foot={FOOT(shut, 'Разобрать')}
        >
          <div className="grid place-items-center rounded-[var(--radius-field)] border border-dashed border-paper/17 px-4 py-10 text-center">
            <p className="text-sm text-dim">Перетащите фото или выберите файл</p>
            <p className="hint mt-1">JPEG или PNG, до 10 МБ</p>
          </div>
        </Modal>
      ))}

      {box('ics', (
        <Modal
          title="Календарь по ссылке"
          said="Подписка на .ics: смены появятся сами, когда их поставят."
          foot={FOOT(shut, 'Подключить')}
        >
          <Field label="Ссылка" value="https://cal.sova.bar/anya.ics" />
          <div className="rounded-[var(--radius-field)] border border-paper/9 p-3">
            <span className="lbl">Нашлось</span>
            <p className="mt-1 font-mono text-sm tabular">14 смен · 1–30 сентября</p>
            <p className="hint">Все совпадают с шаблоном «Вечер».</p>
          </div>
        </Modal>
      ))}

      {box('foreign', (
        <Modal
          title="Файл из другого приложения"
          said="Разберём таблицу и покажем, что получилось, до того как записать."
          foot={FOOT(shut, 'Записать 22')}
        >
          <div className="flex flex-col">
            {[
              ['01.08', 'Вечер · 17:00–01:00', true],
              ['02.08', 'День · 09:00–17:00', true],
              ['03.08', 'Night shift', false],
            ].map(([when, what, known]) => (
              <span key={when as string} className="flex items-center gap-3 border-b border-paper/9 py-2 last:border-0">
                <span className="font-mono text-2xs text-faint">{when as string}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{what as string}</span>
                <span className={cn('text-2xs font-semibold', (known as boolean) ? 'text-money' : 'text-taken')}>
                  {(known as boolean) ? 'узнали' : 'не поняли'}
                </span>
              </span>
            ))}
          </div>
          <p className="hint">Непонятые строки не запишутся — их можно поправить руками.</p>
        </Modal>
      ))}

      {box('rotation', (
        <Modal
          title="Два через два"
          said="Разложить смену по кругу на несколько месяцев вперёд."
          foot={FOOT(shut, 'Разложить')}
        >
          <Field label="Какая смена" value="🍸 Вечер, бар" />
          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Работаю" value="2" />
            <Field label="Отдыхаю" value="2" />
            <Field label="Месяцев" value="3" />
          </div>
          <Field label="Начиная с" value="01.09.2026" />
          <p className="hint">Получится 46 смен до конца ноября.</p>
        </Modal>
      ))}

      {box('scheme', (
        <Modal
          title="Цвета по дням"
          said="Схема раскрашивает календарь, не трогая смены."
          foot={FOOT(shut, 'Сохранить', 'Удалить')}
        >
          <Field label="Название" value="Мой обычный график" />
          <div className="flex flex-col gap-2">
            {['понедельник', 'вторник', 'среда', 'четверг', 'пятница'].map((day, i) => (
              <span key={day} className="flex items-center gap-2.5">
                <span className="w-24 text-xs text-dim">{day}</span>
                <span className="flex gap-1.5">
                  {['#e0a45b', '#7fbf7a', '#d9705f', '#b5ada3'].map((colour, j) => (
                    <span
                      key={colour}
                      className={cn(
                        'size-5 rounded-full',
                        i % 4 === j && 'ring-2 ring-paper ring-offset-2 ring-offset-table',
                      )}
                      style={{ background: colour }}
                    />
                  ))}
                </span>
              </span>
            ))}
          </div>
        </Modal>
      ))}

      {box('pattern', (
        <Modal
          title="Повторить неделю"
          said="Взять текущую неделю и разложить её вперёд."
          foot={FOOT(shut, 'Разложить')}
        >
          <div className="rounded-[var(--radius-field)] border border-paper/9 p-3">
            <span className="lbl">Что повторяем</span>
            <p className="mt-1.5 font-mono text-sm">ср чт пт — Вечер · сб вс — День</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Начиная с" value="07.09.2026" />
            <Field label="Недель" value="8" />
          </div>
          <Switch on label="Пропускать занятые дни" hint="Уже поставленные смены не тронем." />
        </Modal>
      ))}

      {box('payout', (
        <Modal
          title="Пришли деньги"
          said="Отметьте, что и когда пришло — приложение сверит с тем, что было обещано."
          foot={FOOT(shut, 'Записать')}
        >
          <Field label="Место" value="Бар «Полночь»" />
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Сколько" value="16 590" />
            <Field label="Когда" value="05.09.2026" />
          </div>
          <p className="hint">Обещали ₴16 590 к 5 сентября — сходится.</p>
        </Modal>
      ))}

      {box('deletePlace', (
        <Modal
          title="Удалить место?"
          said="На нём 47 отмеченных смен. Они останутся — но потеряют правила расчёта."
          foot={
            <>
              <span onClick={shut}><Button tone="line" className="w-full">Оставить</Button></span>
              <span onClick={shut}><Button tone="danger" className="w-full">Удалить</Button></span>
            </>
          }
        >
          <div className="rounded-[var(--radius-field)] border border-taken/40 bg-taken/10 p-3">
            <p className="text-sm">
              Ночные надбавки, налог и питание перестанут считаться. Заработок за прошлые
              месяцы пересчитан не будет.
            </p>
          </div>
          <Field label="Введите название, чтобы подтвердить" placeholder="Бар «Полночь»" />
        </Modal>
      ))}

      {box('review', (
        <Modal
          title="Как прошло"
          said="Открывается только после смены и только двоим, кто на ней был."
          foot={FOOT(shut, 'Отправить')}
        >
          <div>
            <span className="lbl">Оценка</span>
            <div className="mt-2 flex gap-1.5 text-2xl">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={n <= 4 ? 'text-brass' : 'text-edge-firm'}>★</span>
              ))}
            </div>
          </div>
          <div>
            <span className="lbl">Что отметить</span>
            <Pills className="mt-2" options={['не опоздал', 'быстрый', 'чисто', 'помог закрыться']} value="не опоздал" />
          </div>
          <Field label="Словами" placeholder="Необязательно" area />
        </Modal>
      ))}

      {box('callback', (
        <Modal
          title="Позвать снова"
          said="Те, кто уже работал у вас по бирже. Контакты свежие."
          foot={FOOT(shut, 'Позвать')}
        >
          <div className="flex flex-col">
            {[
              { who: 'Костя', what: 'бармен · 3 смены у вас', stars: '4.9' },
              { who: 'Лена', what: 'повар · 1 смена у вас', stars: '5.0' },
            ].map(({ who, what, stars }) => (
              <span key={who} className="flex items-center gap-3 border-b border-paper/9 py-2.5 last:border-0">
                <span className="grid size-8 flex-none place-items-center rounded-full bg-raised text-xs">
                  {who[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{who}</span>
                  <span className="hint">{what}</span>
                </span>
                <span className="font-mono text-2xs text-brass">★ {stars}</span>
              </span>
            ))}
          </div>
        </Modal>
      ))}
    </>
  );
}
