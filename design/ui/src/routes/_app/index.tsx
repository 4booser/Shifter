import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

import { Docket, Month } from '@/components/calendar';
import { Head } from '@/components/screen';
import { Button, Card, Field, Modal, Pills, Switch, Over } from '@/components/ui/kit';
import { Window, Windows } from '@/components/windows';
import { TILES } from '@/mock/data';
import { cn } from '@/lib/utils';

function Calendar() {
  const [shiftModal, setShiftModal] = useState(false);
  const [win, setWin] = useState<Window>(null);

  return (
    <>
      <Head
        said="Август 2026"
        title="Календарь"
        right={
          <>
            <Button size="icon" tone="line"><ChevronLeft className="size-4" /></Button>
            <Button size="icon" tone="line"><ChevronRight className="size-4" /></Button>
            <span onClick={() => setWin('search')}><Button tone="quiet" size="sm"><Search className="size-3.5" />Найти</Button></span>
            <span onClick={() => setWin('rotation')}><Button tone="line" size="sm">Разложить</Button></span>
            <Button tone="quiet" size="sm">Сегодня</Button>
            <Button tone="go" size="sm" className="cursor-pointer" >
              <span onClick={() => setShiftModal(true)}>Поставить смену</span>
            </Button>
          </>
        }
      />

      <div>
        <span className="lbl">Заработано</span>
        <p className="mt-1.5 text-5xl font-extrabold tracking-[-0.05em] tabular">
          <span className="font-medium text-faint">₴</span>24 700
        </p>
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-dim">
          <span><b className="font-semibold text-paper tabular">17</b> смен</span>
          <span><b className="font-semibold text-paper tabular">137</b> часов</span>
          <span>час стоил <b className="font-semibold text-paper tabular">₴180</b></span>
          <span>чаевые <b className="font-semibold text-paper tabular">₴7 700</b></span>
        </div>
      </div>

      {/* Полосой вбок на телефоне: восемь плиток в столбик — это экран
          прокрутки между человеком и календарём, ради которого он зашёл. */}
      <div className={cn(
        'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1',
        '[&>*]:w-[62%] [&>*]:flex-none [&>*]:snap-start',
        'sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 sm:[&>*]:w-auto lg:grid-cols-4',
      )}>
        {TILES.map((tile) => (
          <div key={tile.said} className="card p-4">
            <span className="lbl">{tile.said}</span>
            <p className={cn(
              'mt-1.5 text-2xl font-bold tracking-[-0.03em] tabular',
              tile.tone === 'good' && 'text-money',
              tile.tone === 'bad' && 'text-taken',
            )}>
              {tile.num}
            </p>
            <p className="hint mt-0.5">{tile.foot}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2.6fr)_minmax(320px,1fr)]">
        <Month />
        <div className="flex flex-col gap-4">
          <Docket />
          <Card
            title="Цель на месяц"
            right={<span onClick={() => setWin('goal')}><Button tone="quiet" size="sm">Изменить</Button></span>}
          >
            <p className="text-xl font-bold tabular">
              ₴24 700 <span className="text-base font-semibold text-faint">из ₴40 000</span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-brass" style={{ width: '62%' }} />
            </div>
            <p className="hint mt-2">Осталось ₴15 300 за 1 день.</p>
          </Card>
          <Card
            title="День без смены"
            right={<span onClick={() => setWin('event')}><Button tone="quiet" size="sm">Подробно</Button></span>}
          >
            <Pills options={['отпуск', 'больничный', 'выходной']} />
            <div className="mt-3 border-t border-paper/9 pt-3">
              <Switch label="Прошу подменить" hint="Смена появится на графике команды." />
            </div>
          </Card>
        </div>
      </div>

      {/* Всё, что открывают из календаря: цель, событие, поиск, раскладка,
          импорты и разрешение конфликта. */}
      <Card title="Ещё из календаря" hint="Окна, которые открываются отсюда.">
        <div className="flex flex-wrap gap-2">
          {([
            ['goal', 'Цель'],
            ['event', 'День без смены'],
            ['sales', 'Позиции с продаж'],
            ['search', 'Поиск'],
            ['rotation', 'Два через два'],
            ['pattern', 'Повторить неделю'],
            ['scheme', 'Цвета по дням'],
            ['photo', 'Фото графика'],
            ['ics', 'Календарь по ссылке'],
            ['foreign', 'Файл из другого приложения'],
            ['conflict', 'Конфликт версий'],
          ] as [Window, string][]).map(([name, label]) => (
            <span key={label} onClick={() => setWin(name)}>
              <Button tone="line" size="sm">{label}</Button>
            </span>
          ))}
        </div>
      </Card>

      <Windows open={win} onClose={() => setWin(null)} />

      <Over open={shiftModal} onClose={() => setShiftModal(false)}>
            <Modal
              title="Поставить смену"
              said="Выберите шаблон — часы и ставка подставятся сами."
              foot={
                <>
                  <span onClick={() => setShiftModal(false)}><Button tone="line" className="w-full">Отмена</Button></span>
                  <span onClick={() => setShiftModal(false)}><Button tone="go" className="w-full">Поставить</Button></span>
                </>
              }
            >
              <Pills options={['🍸 Вечер', '☕️ День', '🥂 Банкет']} value="🍸 Вечер" />
              <Field label="На какой день" value="31.08.2026" />
              <Switch on label="Отметить сразу отработанной" />
      </Modal>
      </Over>
    </>
  );
}

export const Route = createFileRoute('/_app/')({ component: Calendar });
