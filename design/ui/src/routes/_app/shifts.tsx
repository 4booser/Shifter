import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Archive, Pencil, Plus } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Field, Modal, Pills, Switch } from '@/components/ui/kit';
import { SHIFTS } from '@/mock/data';

function Shifts() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Head
        said="Шаблоны"
        title="Смены"
        hint="Шаблон помнит часы и ставку — в календаре смена ставится одним нажатием."
        right={<span onClick={() => setOpen(true)}><Button tone="go"><Plus className="size-4" />Новая смена</Button></span>}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SHIFTS.map((shift) => (
          <article key={shift.name} className="card flex gap-3 p-4">
            <span className="mt-1 h-9 w-1 flex-none rounded-full bg-brass" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{shift.symbol} {shift.name}</p>
              <p className="font-mono text-2xs text-faint">{shift.time} · {shift.hours}</p>
              <p className="mt-2 text-sm font-semibold tabular">{shift.pay}</p>
              <p className="hint">{shift.place}{shift.extra !== undefined ? ` · ${shift.extra}` : ''}</p>
            </div>
            <span className="flex flex-none gap-1 text-faint">
              <Pencil className="size-3.5" />
              <Archive className="size-3.5" />
            </span>
          </article>
        ))}
      </div>

      <section>
        <span className="lbl">В архиве</span>
        <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="card flex gap-3 p-4 opacity-60">
            <span className="mt-1 h-9 w-1 flex-none rounded-full bg-edge-firm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">🌅 Утро</p>
              <p className="font-mono text-2xs text-faint">07:00–15:00 · 8,0 ч</p>
              <p className="mt-2 text-sm font-semibold tabular">₴140 в час</p>
            </div>
          </article>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-night/70 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[430px]">
            <Modal
              title="Новая смена"
              said="Шаблон помнит часы и ставку — дальше смена ставится одним нажатием."
              foot={
                <>
                  <span onClick={() => setOpen(false)}><Button tone="line" className="w-full">Отмена</Button></span>
                  <span onClick={() => setOpen(false)}><Button tone="go" className="w-full">Сохранить</Button></span>
                </>
              }
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
              <Switch label="Красит день в календаре" />
            </Modal>
          </div>
        </div>
      )}
    </>
  );
}

export const Route = createFileRoute('/_app/shifts')({ component: Shifts });
