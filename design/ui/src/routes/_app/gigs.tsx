import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Field, Modal, Pills } from '@/components/ui/kit';
import { GIGS } from '@/mock/data';
import { cn } from '@/lib/utils';

function Gigs() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Head
        said="Биржа"
        title="Подработки"
        hint="Каждая карточка отвечает на единственный вопрос: это дороже вашего часа или дешевле."
        right={<span onClick={() => setOpen(true)}><Button tone="go"><Plus className="size-4" />Нужен человек</Button></span>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pills options={['разовые', 'постоянные']} value="разовые" />
        <Pills options={['Объявления', 'Люди']} value="Объявления" />
        <Field className="w-40" placeholder="Город" />
        <Pills options={['все', 'бар', 'зал', 'кухня']} value="все" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {GIGS.map((gig) => (
          <article key={gig.title} className="card flex flex-col gap-2 p-4">
            <div className="flex items-start gap-2">
              <p className="flex-1 font-semibold">{gig.title}</p>
              {gig.urgent === true && (
                <span className="rounded-full border border-taken px-2 py-0.5 text-2xs font-bold text-taken">горит</span>
              )}
            </div>
            <p className="hint">{gig.venue} · {gig.city}</p>
            <p className="font-mono text-2xs text-faint">{gig.when}</p>
            <p className="text-lg font-bold tabular">
              {gig.pay} <span className="text-xs font-normal text-faint">{gig.per}</span>
            </p>
            <p className={cn('text-xs font-semibold', gig.worse === true ? 'text-taken' : 'text-money')}>
              {gig.worth}
            </p>
            <Button tone="line" size="sm">Откликнуться</Button>
          </article>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/70 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[560px]">
            <Modal
              title="Нужен человек"
              wide
              said="Чем короче объявление, тем быстрее на него откликнутся."
              foot={
                <>
                  <span onClick={() => setOpen(false)}><Button tone="line" className="w-full">Отмена</Button></span>
                  <span onClick={() => setOpen(false)}><Button tone="go" className="w-full">Разместить</Button></span>
                </>
              }
            >
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Заведение" value="Бар «Сова»" />
                <Field label="Город" value="Днепр" />
              </div>
              <Field label="Заголовок" value="Бармен на вечер пятницы" />
              <div>
                <span className="lbl">Кого ищете</span>
                <Pills className="mt-2" options={['🍸 Бармен', '🍽️ Официант', '☕ Бариста', '🔥 Повар']} value="🍸 Бармен" />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <Field label="Когда" value="05.09.2026" />
                <Field label="С" value="16:00" />
                <Field label="До" value="23:00" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Сколько" value="250" />
                <Field label="Человек" value="1" />
              </div>
              <div>
                <span className="lbl">Фото места — от 3 до 6</span>
                <div className="mt-2 flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-16 rounded-lg bg-raised" />
                  ))}
                  <span className="grid size-16 place-items-center rounded-lg border border-dashed border-paper/17 text-faint">+</span>
                </div>
              </div>
            </Modal>
          </div>
        </div>
      )}
    </>
  );
}

export const Route = createFileRoute('/_app/gigs')({ component: Gigs });
