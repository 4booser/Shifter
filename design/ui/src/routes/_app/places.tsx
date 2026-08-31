import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Calendar, Camera, Download, FileSpreadsheet, MapPin, Pencil, Plus, RotateCcw } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Field, Modal, Over, Pills, Switch } from '@/components/ui/kit';
import { PLACES } from '@/mock/data';

/**
 * Места.
 *
 * Место — это откуда берутся деньги и когда они приходят. Ставки, надбавки,
 * удержания и день выплаты живут здесь, а не в смене: смена их наследует, и
 * поправить правило один раз — значит поправить его во всех прошлых сменах
 * сразу.
 */
const BY_PLACE = [
  { name: 'Бар «Полночь»', earned: '₴18 400', hours: 103, shifts: 13, kept: '₴14 100', holiday: '4,2 дня' },
  { name: 'Ресторан «Веранда»', earned: '₴4 200', hours: 24, shifts: 3, kept: '₴3 380', holiday: '0,9 дня' },
  { name: 'Подработки', earned: '78 €', hours: 10, shifts: 1, kept: '78 €', holiday: '—' },
];

/** Должности: что человек делает и что ему за это идёт сверх часа. */
const ROLES = [
  { name: 'Бармен', place: 'Бар «Полночь»', pay: '₴200 в час', sales: null, sum: '₴200 × 8,5 ч = ₴1 700 за смену' },
  { name: 'Кальянщик', place: 'Бар «Полночь»', pay: '₴350 за смену', sales: '5% с проданного', sum: '5 кальянов по ₴350 = ₴87,50 сверх смены' },
  { name: 'Официант', place: 'Ресторан «Веранда»', pay: '₴150 в час', sales: '3% с чека', sum: '₴150 × 8 ч + 3% от ₴12 400 = ₴1 572' },
];

function Places() {
  const [open, setOpen] = useState(false);
  const [archive, setArchive] = useState(false);

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

      {/* Итог по каждому месту отдельно. Суммарная строка по всем местам
          складывала бы гривну с евро и час по ₴200 с часом по ₴150 — число
          получилось бы, а смысла в нём нет. */}
      <Card
        title="По местам"
        hint="Читайте построчно: общий итог смешал бы разные ставки и разные валюты."
        className="overflow-x-auto"
      >
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="lbl pb-2 text-left">Место</th>
              <th className="lbl pb-2 text-right">Заработано</th>
              <th className="lbl pb-2 text-right">Часы</th>
              <th className="lbl pb-2 text-right">Смены</th>
              <th className="lbl pb-2 text-right">На руки</th>
              <th className="lbl pb-2 text-right">Отпускных</th>
            </tr>
          </thead>
          <tbody>
            {BY_PLACE.map((row) => (
              <tr key={row.name} className="border-t border-paper/9">
                <td className="py-2.5 pr-3 whitespace-nowrap">{row.name}</td>
                <td className="py-2.5 text-right font-mono tabular">{row.earned}</td>
                <td className="py-2.5 text-right font-mono tabular">{row.hours}</td>
                <td className="py-2.5 text-right font-mono tabular">{row.shifts}</td>
                <td className="py-2.5 text-right font-mono tabular">{row.kept}</td>
                <td className="py-2.5 text-right font-mono text-dim tabular">{row.holiday}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint mt-3 border-t border-paper/9 pt-3">
          Эти даты смешивают валюты: подработки на террасе шли в евро.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Должности" hint="Что идёт сверх часа и как это считается.">
          <div className="flex flex-col">
            {ROLES.map((one) => (
              <div key={one.name} className="border-b border-paper/9 py-3 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{one.name}</span>
                  <span className="font-mono text-xs tabular">{one.pay}</span>
                </div>
                <p className="lbl">{one.place}{one.sales === null ? '' : ` · ${one.sales}`}</p>
                {/* Не «5%», а сколько это в деньгах: процент без примера
                    невозможно проверить, а проверять его хочется каждому. */}
                <p className="mt-1 font-mono text-2xs text-faint">{one.sum}</p>
              </div>
            ))}
            <div className="mt-3 border-t border-paper/9 pt-3">
              <Button tone="line" size="sm">
                <Plus className="size-3.5" />
                Добавить должность
              </Button>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Правила поверх ставки" hint="Действуют на все смены места, включая прошлые.">
            <div className="flex flex-col gap-3">
              <Switch on label="Сверхурочные после 40 ч в неделю" hint="Час сверх нормы идёт ×1,5." />
              <Switch on label="Ночные с 22:00 до 06:00" hint="×1,35 в «Полночи», ×1,2 в «Веранде»." />
              <Switch on label="Праздничные ×2" />
              <Switch label="Копить отпускные" hint="2,33 дня за отработанный месяц." />
            </div>
          </Card>

          <Card
            title="Перенести и забрать"
            hint="График редко начинается с чистого листа."
            right={<Download className="size-4 text-faint" />}
          >
            <div className="flex flex-wrap gap-2">
              <Button tone="line" size="sm">
                <FileSpreadsheet className="size-3.5" />
                Таблица
              </Button>
              <Button tone="line" size="sm">
                <Calendar className="size-3.5" />
                Календарь .ics
              </Button>
              <Button tone="line" size="sm">
                <Camera className="size-3.5" />
                Фото графика
              </Button>
              <Button tone="line" size="sm">Из другого приложения</Button>
              <Button tone="quiet" size="sm">Выгрузить CSV</Button>
            </div>
          </Card>
        </div>
      </div>

      <section>
        <button type="button" onClick={() => setArchive((was) => !was)}>
          <Button tone="quiet" size="sm">
            {archive ? 'Свернуть архив' : 'Показать архив'}
          </Button>
        </button>

        {archive && (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article className="card flex gap-3 p-4 opacity-60">
              <span className="mt-1 h-9 w-1 flex-none rounded-full bg-edge-firm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Кофейня «Зерно»</p>
                <p className="hint">июнь 2023 — февраль 2024 · 96 смен</p>
                <p className="hint mt-1">
                  В архиве: смены остались в истории, новые ставить нельзя.
                </p>
              </div>
              <RotateCcw className="size-3.5 flex-none text-faint" />
            </article>
          </div>
        )}
      </section>

      <Over open={open} onClose={() => setOpen(false)}>
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
                <Field label="Название" value="Бар «Полночь»" />
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
      </Over>
    </>
  );
}

export const Route = createFileRoute('/_app/places')({ component: Places });
