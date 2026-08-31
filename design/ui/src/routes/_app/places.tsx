import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { MapPin, Pencil, Plus } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Field, Modal, Pills, Switch } from '@/components/ui/kit';
import { PLACES } from '@/mock/data';

function Places() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Head
        said="Где вы работаете"
        title="Места"
        hint="Когда приходят деньги, сколько стоит ночь и что удерживает заведение."
        right={<span onClick={() => setOpen(true)}><Button tone="go"><Plus className="size-4" />Новое место</Button></span>}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {PLACES.map((place) => (
          <article key={place.name} className="card flex gap-3 p-4">
            <span className="mt-1 h-9 w-1 flex-none rounded-full" style={{ background: place.colour }} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{place.name}</p>
              <p className="hint">{place.cycle}</p>
              <p className="hint mt-0.5 flex items-center gap-1"><MapPin className="size-3" />{place.where}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {place.rules.map((rule) => (
                  <span key={rule} className="rounded-full bg-raised px-2 py-0.5 text-2xs text-dim">{rule}</span>
                ))}
              </div>
            </div>
            <Pencil className="size-3.5 flex-none text-faint" />
          </article>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/70 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[560px]">
            <Modal
              title="Новое место"
              wide
              said="Когда приходят деньги, сколько стоит ночь и что удерживает заведение."
              foot={
                <>
                  <span onClick={() => setOpen(false)}><Button tone="line" className="w-full">Отмена</Button></span>
                  <span onClick={() => setOpen(false)}><Button tone="go" className="w-full">Сохранить</Button></span>
                </>
              }
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
          </div>
        </div>
      )}
    </>
  );
}

export const Route = createFileRoute('/_app/places')({ component: Places });
