import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Docket, Month } from '@/components/calendar';
import { Head } from '@/components/screen';
import { Button, Card, Field, Modal, Pills, Switch } from '@/components/ui/kit';
import { TILES } from '@/mock/data';
import { cn } from '@/lib/utils';

function Calendar() {
  const [shiftModal, setShiftModal] = useState(false);

  return (
    <>
      <Head
        said="Август 2026"
        title="Календарь"
        right={
          <>
            <Button size="icon" tone="line"><ChevronLeft className="size-4" /></Button>
            <Button size="icon" tone="line"><ChevronRight className="size-4" /></Button>
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <Card title="Цель на месяц">
            <p className="text-xl font-bold tabular">
              ₴24 700 <span className="text-base font-semibold text-faint">из ₴40 000</span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-brass" style={{ width: '62%' }} />
            </div>
            <p className="hint mt-2">Осталось ₴15 300 за 1 день.</p>
          </Card>
          <Card title="День без смены">
            <Pills options={['отпуск', 'больничный', 'выходной']} />
            <div className="mt-3 border-t border-paper/9 pt-3">
              <Switch label="Прошу подменить" hint="Смена появится на графике команды." />
            </div>
          </Card>
        </div>
      </div>

      {shiftModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-night/70 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[430px]">
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
          </div>
        </div>
      )}
    </>
  );
}

export const Route = createFileRoute('/_app/')({ component: Calendar });
