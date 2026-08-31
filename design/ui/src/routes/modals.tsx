import { createFileRoute } from '@tanstack/react-router';

import { Plate, Sheet } from '@/components/frame';
import { Button, Field, Modal, Pills, Switch } from '@/components/ui/kit';

/**
 * Окна.
 *
 * Все семнадцать собираются из одних и тех же частей: заголовок, строка
 * пояснения, поля, одно латунное действие. Если для окна понадобилась новая
 * деталь — значит его придумали неправильно.
 */
function Modals() {
  return (
    <Sheet
      kicker="03 · Окна"
      title="Всё, что всплывает"
      blurb="Семнадцать модалок и панелей. Одно латунное действие на окно, служебные подписи моноширинные, поля темнее фона — чтобы окно читалось как лежащее сверху, а не вклеенное."
    >
      <Plate title="Смена" path="shift-modal" why="Самое частое окно в приложении: из него растёт весь календарь.">
        <Modal
          title="Новая смена"
          said="Шаблон помнит часы и ставку — дальше смена ставится одним нажатием."
          foot={<><Button tone="line">Отмена</Button><Button tone="go">Сохранить</Button></>}
        >
          <div className="grid grid-cols-[4.5rem_1fr] gap-2.5">
            <Field label="Значок" value="🍸" />
            <Field label="Название" value="Вечер, бар" />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Начало" value="17:00" />
            <Field label="Конец" value="01:00" />
            <Field label="Перерыв" value="30" />
          </div>
          <p className="hint">Смена переходит за полночь — часы считаются до утра.</p>
          <div>
            <span className="lbl">Платят</span>
            <Pills className="mt-2" options={['в час', 'в день', 'в неделю', 'в месяц']} value="в час" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Ставка" value="200" />
            <Field label="% с выручки" placeholder="—" />
          </div>
        </Modal>
      </Plate>

      <Plate title="Место работы" path="location-modal" why="Длинное окно, поэтому разбито на смысловые группы, а не на одну простыню полей.">
        <Modal
          title="Бар «Сова»"
          wide
          said="Когда приходят деньги, сколько стоит ночь и что удерживает заведение."
          foot={<><Button tone="line">Отмена</Button><Button tone="go">Сохранить</Button></>}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Название" value="Бар «Сова»" />
            <Field label="Город" value="Днепр" />
          </div>
          <div className="border-t border-paper/9 pt-3">
            <span className="lbl">Когда платят</span>
            <Pills className="mt-2" options={['раз в месяц', 'дважды в месяц', 'раз в две недели', 'раз в неделю']} value="дважды в месяц" />
          </div>
          <div className="grid grid-cols-3 gap-2.5 border-t border-paper/9 pt-3">
            <Field label="Ночь ×" value="1,35" />
            <Field label="Ночь с" value="22:00" />
            <Field label="до" value="06:00" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Питание за смену" value="90" />
            <Field label="Налог, %" value="19,5" />
          </div>
          <Switch label="Налог и с чаевых" />
        </Modal>
      </Plate>

      <Plate title="Цель и выплата" path="goals-modal · payout-modal">
        <div className="grid gap-4 lg:grid-cols-2">
          <Modal
            title="Цель"
            said="Сколько хотите зарабатывать. Приложение посчитает, по сколько выходит в день."
            foot={<><Button tone="line">Отмена</Button><Button tone="go">Поставить</Button></>}
          >
            <Pills options={['в неделю', 'в месяц', 'в год']} value="в месяц" />
            <Field label="Сколько" value="40 000" />
          </Modal>

          <Modal
            title="Пришли деньги"
            said="Отметьте, что и когда пришло — приложение сверит с тем, что было обещано."
            foot={<><Button tone="line">Отмена</Button><Button tone="go">Записать</Button></>}
          >
            <Field label="Место" value="Бар «Сова»" />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Сколько" value="16 590" />
              <Field label="Когда" value="05.09.2026" />
            </div>
            <p className="hint">Обещали ₴16 590 к 5 сентября — сходится.</p>
          </Modal>
        </div>
      </Plate>

      <Plate title="Событие и продажи" path="event-modal · sales-modal">
        <div className="grid gap-4 lg:grid-cols-2">
          <Modal
            title="Отпуск"
            said="Отпуск и больничный не считаются днями без работы — прогноз их не трогает."
            foot={<><Button tone="line">Убрать</Button><Button tone="go">Сохранить</Button></>}
          >
            <Pills options={['обычное', 'отпуск', 'больничный', 'выходной']} value="отпуск" />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="С" value="15.08.2026" />
              <Field label="По" value="19.08.2026" />
            </div>
            <Field label="Заметка" placeholder="—" area />
          </Modal>

          <Modal
            title="Позиция"
            said="То, за что платят с продажи: коктейль, кальян, депозит."
            foot={<><Button tone="line">Отмена</Button><Button tone="go">Сохранить</Button></>}
          >
            <Field label="Название" value="Авторский коктейль" />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Цена" value="380" />
              <Field label="Ваш процент" value="7,5" />
            </div>
          </Modal>
        </div>
      </Plate>

      <Plate
        title="Конфликт версий"
        path="conflict-modal"
        why="Единственное окно с двумя равными действиями: приложение не решает за человека, чьи деньги правильные."
      >
        <Modal
          title="День изменён на другом устройстве"
          said="Ничего не склеивается автоматически — выберите, что оставить."
          foot={<><Button tone="line">Оставить их</Button><Button tone="line">Записать мою</Button></>}
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
      </Plate>

      <Plate title="Импорт и поиск" path="import-modal · search-modal">
        <div className="grid gap-4 lg:grid-cols-2">
          <Modal
            title="Фото графика"
            said="Снимите доску в подсобке — приложение разберёт, кто и когда выходит."
            foot={<><Button tone="line">Отмена</Button><Button tone="go">Разобрать</Button></>}
          >
            <div className="grid place-items-center rounded-[var(--radius-field)] border border-dashed border-paper/17 px-4 py-10 text-center">
              <p className="text-sm text-dim">Перетащите фото или выберите файл</p>
              <p className="hint mt-1">JPEG или PNG, до 10 МБ</p>
            </div>
          </Modal>

          <Modal title="Поиск" said="Смены, места, дни, суммы — всё одним полем.">
            <Field placeholder="Найти смену, место или сумму" value=">2000" />
            <div className="flex flex-col">
              {[
                ['1 августа', 'Вечер · ₴2 470'],
                ['7 августа', 'Вечер · ₴2 470'],
                ['14 августа', 'Вечер · ₴2 470'],
              ].map(([when, what]) => (
                <span key={when} className="flex items-center justify-between gap-3 border-b border-paper/9 py-2 last:border-0">
                  <span className="text-sm">{when}</span>
                  <span className="font-mono text-xs text-dim tabular">{what}</span>
                </span>
              ))}
            </div>
          </Modal>
        </div>
      </Plate>

      <Plate
        title="Панель дня"
        path="day-panel"
        why="Не модалка, а панель сбоку: день правят, глядя на месяц вокруг, и окно этот месяц закрывает."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <div className="grid place-items-center rounded-[var(--radius-card)] border border-dashed border-paper/17 p-10 text-center">
            <p className="hint">Здесь остаётся календарь — панель его не закрывает.</p>
          </div>
          <div className="card flex flex-col gap-3.5 p-4">
            <div>
              <h3 className="text-base font-bold">Понедельник, 31 августа</h3>
              <p className="text-2xl font-bold text-money tabular">₴1 640</p>
            </div>
            <div className="flex items-center gap-2 border-t border-paper/9 pt-3">
              <span className="grid size-5 flex-none place-items-center rounded-md bg-money text-2xs font-bold text-night">✓</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">Вечер</span>
                <span className="font-mono text-2xs text-faint">17:12–01:40 · 8,5 ч · по факту</span>
              </span>
              <span className="font-mono text-sm tabular">₴1 600</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Перерыв" value="30" />
              <Field label="Выручка" value="8 200" />
              <Field label="Гостей" value="64" />
            </div>
            <div>
              <span className="lbl">Где работали</span>
              <Pills className="mt-1.5" options={['зал', 'бар', 'терраса', 'банкет']} value="бар" />
            </div>
            <div className="border-t border-paper/9 pt-3">
              <span className="lbl">День без смены</span>
              <Pills className="mt-1.5" options={['отпуск', 'больничный', 'выходной']} />
            </div>
            <Switch label="Прошу подменить" hint="Смена появится на графике команды." />
          </div>
        </div>
      </Plate>
    </Sheet>
  );
}

export const Route = createFileRoute('/modals')({ component: Modals });
