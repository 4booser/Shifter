import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Archive, Pencil, Plus } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Field, Modal, Over, Pills, Switch } from '@/components/ui/kit';
import { SHIFTS } from '@/mock/data';

/**
 * Шаблоны смен.
 *
 * На карточке написано не только «₴200 в час», но и во что это выливается
 * за смену. Ставку помнят все, а вот сколько выходит за вечер — считают в
 * уме каждый раз, и обычно неверно.
 */
const SUMS: Record<string, string> = {
  'Вечер': '₴200 × 8,5 ч = ₴1 700 за смену',
  'День': '₴150 × 7,5 ч = ₴1 125 за смену',
  'Банкет': '₴1 400 за смену, часы не в счёт',
};

/** Дни без смены: тоже занимают день в календаре, но денег не приносят. */
const EVENTS = [
  { name: '📚 Английский', when: 'вт и чт · 19:00—20:30', note: 'без оплаты' },
  { name: '🏖 Отпуск', when: 'весь день', note: 'оплачивается из отпускных' },
  { name: '🤒 Больничный', when: 'весь день', note: 'по справке' },
  { name: '🏋️ Зал', when: 'пн, ср · 08:00—09:30', note: 'без оплаты' },
];

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
              {/* Ставку помнят, итог за смену считают в уме. Пусть считает
                  шаблон — он не ошибается и не забывает про перерыв. */}
              <p className="mt-1.5 font-mono text-2xs text-faint">{SUMS[shift.name]}</p>
            </div>
            <span className="flex flex-none gap-1 text-faint">
              <Pencil className="size-3.5" />
              <Archive className="size-3.5" />
            </span>
          </article>
        ))}
      </div>

      <Card title="Дни без смены" hint="Занимают день в календаре, но денег не приносят.">
        <div className="flex flex-col">
          {EVENTS.map((one) => (
            <span
              key={one.name}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-paper/9 py-2.5 last:border-0"
            >
              <span className="text-sm">{one.name}</span>
              <span className="font-mono text-2xs text-faint">{one.when}</span>
              <span className="hint ml-auto">{one.note}</span>
            </span>
          ))}
          <div className="mt-3 border-t border-paper/9 pt-3">
            <Button tone="line" size="sm">
              <Plus className="size-3.5" />
              Новый тип дня
            </Button>
          </div>
        </div>
      </Card>

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

      <Over open={open} onClose={() => setOpen(false)}>
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
      </Over>
    </>
  );
}

export const Route = createFileRoute('/_app/shifts')({ component: Shifts });
