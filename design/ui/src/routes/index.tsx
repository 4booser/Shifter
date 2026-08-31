import { Link, createFileRoute } from '@tanstack/react-router';
import { Landmark, PanelsTopLeft, Smartphone, SquareStack } from 'lucide-react';

/**
 * Оглавление макета.
 *
 * Первое, что видит смотрящий: чем этот макет отличается от того, что есть
 * сейчас, и куда идти. Без этого шестьдесят экранов — просто длинная лента.
 */
const PARTS = [
  {
    to: '/foundations',
    n: '01',
    icon: Landmark,
    title: 'Основа',
    said: 'Цвета, шрифт, сетка, все примитивы — кнопки, поля, полосы, пустые состояния.',
  },
  {
    to: '/screens',
    n: '02',
    icon: PanelsTopLeft,
    title: 'Экраны',
    said: 'Календарь, смены, места, график, подработки, выплаты, банк, год, настройки, вход.',
  },
  {
    to: '/modals',
    n: '03',
    icon: SquareStack,
    title: 'Окна',
    said: 'Семнадцать модалок и панелей: смена, место, цель, выплата, событие, импорт, конфликт.',
  },
  {
    to: '/phone',
    n: '04',
    icon: Smartphone,
    title: 'Телефон',
    said: 'Те же экраны шириной в ладонь: календарь, день, живая смена, доска.',
  },
] as const;

function Index() {
  return (
    <main className="mx-auto max-w-[1320px] px-6 pt-20 pb-32">
      <p className="font-mono text-xs tracking-[0.16em] text-brass uppercase">
        Макет интерфейса · вариант «Ночная смена»
      </p>
      <h1 className="mt-4 max-w-4xl text-5xl font-extrabold tracking-[-0.04em]">
        Приложение открывают в два часа ночи
      </h1>

      <div className="mt-6 grid max-w-4xl gap-4 text-dim md:grid-cols-2">
        <p>
          После закрытия, с телефона, в подсобке. Не в опенспейсе при дневном свете. Поэтому
          основа — <b className="font-semibold text-paper">тёплая темнота</b>, а не белый дашборд:
          белый экран в такой момент бьёт по глазам и выглядит как чужой рабочий инструмент.
        </p>
        <p>
          Акцент один — <b className="font-semibold text-brass">латунь</b>, цвет лампы над
          раздачей. Всё остальное молчит, чтобы светились только деньги. Зелёный — что пришло,
          красно-глиняный — что удержали. Опорный объект —{' '}
          <b className="font-semibold text-paper">чек с раздачи</b>: язык самой профессии, а не
          универсальный дашборд.
        </p>
      </div>

      <p className="mt-6 max-w-4xl text-sm text-faint">
        Здесь ничего не работает: ни одного запроса, ни одного обработчика. Это интерфейс, а не
        приложение — данные выдуманы и лежат рядом в файле.
      </p>

      <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PARTS.map((part) => (
          <Link
            key={part.to}
            to={part.to}
            className="card flex flex-col gap-2 p-5 transition-colors hover:border-brass/60"
          >
            <span className="flex items-center justify-between">
              <span className="font-mono text-2xs tracking-[0.14em] text-brass">{part.n}</span>
              <part.icon className="size-4 text-faint" />
            </span>
            <h2 className="text-lg font-bold">{part.title}</h2>
            <p className="hint">{part.said}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

export const Route = createFileRoute('/')({ component: Index });
