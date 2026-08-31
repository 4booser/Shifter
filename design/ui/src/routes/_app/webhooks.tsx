import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, Plus, Radio } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Field, Modal, Over, Pills, Switch } from '@/components/ui/kit';
import { shifts } from '@/lib/plural';
import { cn } from '@/lib/utils';

/**
 * Подключения.
 *
 * Единственный экран для тех, у кого график уже лежит в чужой системе:
 * пусть она сама кладёт смены сюда. Адрес и ключ — самое важное на
 * странице, поэтому они стоят крупно и с кнопкой «скопировать», а не
 * прячутся в настройках.
 */
const HOOKS = [
  {
    name: 'График из 1С',
    url: 'https://shifter.ink/in/9f21c4…',
    on: true,
    how: 'Подпись',
    last: '14 минут назад',
    brought: 42,
  },
  {
    name: 'Табель ресторана',
    url: 'https://shifter.ink/in/71ba08…',
    on: true,
    how: 'Ключ',
    last: 'вчера, 23:40',
    brought: 7,
  },
  {
    name: 'Старый бот',
    url: 'https://shifter.ink/in/3c05de…',
    on: false,
    how: 'Ключ',
    last: 'никогда',
    brought: 0,
  },
];

function Webhooks() {
  const [adding, setAdding] = useState(false);

  return (
    <>
      <Head
        said="Подключения"
        title="Пусть график приходит сам"
        hint="Чужая система шлёт смены на ваш адрес, и они появляются в календаре."
        right={
          <button type="button" onClick={() => setAdding(true)}>
            <Button tone="go">
              <Plus className="size-4" />
              Новый адрес
            </Button>
          </button>
        }
      />

      <div className="flex flex-col gap-3">
        {HOOKS.map((one) => (
          <section
            key={one.name}
            className={cn('card p-4', !one.on && 'opacity-55')}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'size-2 flex-none rounded-full',
                      one.on ? 'bg-money' : 'bg-edge-firm',
                    )}
                  />
                  <h2 className="font-semibold">{one.name}</h2>
                  <span className="lbl">{one.on ? one.how : 'выключен'}</span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <code className="rounded-[var(--radius-field)] border border-paper/9 bg-night px-2.5 py-1.5 font-mono text-xs text-dim">
                    {one.url}
                  </code>
                  <Button tone="quiet" size="sm">
                    <Copy className="size-3.5" />
                    адрес
                  </Button>
                  <Button tone="quiet" size="sm">
                    <Copy className="size-3.5" />
                    ключ
                  </Button>
                </div>
              </div>

              <div className="text-right">
                <p className="font-mono text-lg font-bold tabular">{one.brought}</p>
                <p className="lbl">{shifts(one.brought)} принёс</p>
                <p className="hint mt-1.5">последняя доставка: {one.last}</p>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Как слать" hint="Разбирается за пять минут тем, кто пишет отправителя.">
          <div className="flex flex-col gap-3">
            <pre className="overflow-x-auto rounded-[var(--radius-field)] border border-paper/9 bg-night p-3.5 font-mono text-2xs leading-relaxed text-dim">
{`POST /in/9f21c4…
X-Shifter-Key: <ключ>

{ "date": "2026-09-04",
  "start": "17:00",
  "end": "01:00",
  "place": "Бар «Полночь»" }`}
            </pre>
            <p className="hint">
              Принято, если ответили за пять минут. Не ответили — попробуем ещё трижды.
            </p>
          </div>
        </Card>

        <Card title="Что делать с полями" hint="Чужие названия сопоставляются с нашими один раз.">
          <div className="flex flex-col gap-2.5">
            {[
              ['date', 'День смены'],
              ['start / end', 'Начало и конец'],
              ['place', 'Место'],
              ['note', 'Заметка'],
            ].map(([from, to]) => (
              <span key={from} className="flex items-center gap-3 text-sm">
                <code className="font-mono text-xs text-brass">{from}</code>
                <span className="h-px flex-1 bg-edge" />
                <span className="text-dim">{to}</span>
              </span>
            ))}
            <p className="hint mt-1 border-t border-paper/9 pt-2.5">
              Шаблон смены по умолчанию не задан — тогда его должен назвать сам запрос.
            </p>
          </div>
        </Card>
      </div>

      <Over open={adding} onClose={() => setAdding(false)}>
        <Modal
          title="Новый адрес"
          said="Выдадим ссылку и ключ. Ключ показывается один раз."
          foot={
            <>
              <button type="button" onClick={() => setAdding(false)}>
                <Button tone="line" className="w-full">
                  Отмена
                </Button>
              </button>
              <Button tone="go">Создать</Button>
            </>
          }
        >
          <Field label="Как назовём" placeholder="График из 1С" />
          <div>
            <span className="lbl">Как отправитель докажет, что это он</span>
            <Pills className="mt-2" options={['Ключ в заголовке', 'Подпись']} value="Подпись" />
          </div>
          <Field label="Шаблон смены по умолчанию" placeholder="Не задан — назовёт запрос" />
          <Switch on label="Принимать доставки" hint="Можно выключить, не удаляя адрес." />
        </Modal>
      </Over>

      <p className="flex items-center gap-2 text-xs text-faint">
        <Radio className="size-3.5" />
        Всё, что приходит, попадает в календарь как обычная смена — её можно поправить и удалить.
      </p>
    </>
  );
}

export const Route = createFileRoute('/_app/webhooks')({ component: Webhooks });
