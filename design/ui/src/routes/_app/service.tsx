import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, Download, Monitor, Plug, Smartphone, Trash2 } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Field, Switch } from '@/components/ui/kit';

/**
 * Данные и уведомления.
 *
 * Раньше здесь же жили состояние сервиса, новости и помощник — по кусочку
 * от каждого. Кусочки уехали на свои страницы: половина экрана, которую
 * нельзя открыть целиком, только дразнит.
 */
const ELSEWHERE = [
  { to: '/status', title: 'Работает ли сервис', hint: 'Проверить до того, как писать в поддержку.' },
  { to: '/whats-new', title: 'Что нового', hint: 'Шесть последних выпусков.' },
  { to: '/roadmap', title: 'Планы', hint: 'Что делается и что дальше.' },
  { to: '/webhooks', title: 'Подключения', hint: 'Чтобы график приходил сам.' },
] as const;

const DEVICES = [
  { what: 'MacBook · Chrome', where: 'Киев', when: 'сейчас', here: true, icon: Monitor },
  { what: 'iPhone · приложение', where: 'Киев', when: '2 часа назад', here: false, icon: Smartphone },
  { what: 'Windows · Firefox', where: 'Львов', when: '11 дней назад', here: false, icon: Monitor },
];

function Service() {
  return (
    <>
      <Head said="Служебное" title="Данные и уведомления" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Уведомления" right={<Plug className="size-4 text-faint" />}>
          <div className="flex flex-col gap-3">
            <Switch on label="Напомнить закрыть смену" hint="Если смена идёт дольше плана." />
            <Switch on label="Завтра работаете" hint="Вечером накануне." />
            <Switch label="Придут деньги" hint="Утром в день выплаты." />
            <Switch label="Воскресный итог недели" />
            <div className="border-t border-paper/9 pt-3">
              <Field label="Календарь для подписки" value="https://shifter.ink/feed/a4f2…" />
              <p className="hint mt-2">
                Ссылка только на чтение: вставляется в Google Calendar или Apple Calendar.
              </p>
            </div>
          </div>
        </Card>

        <Card title="Где вы вошли" hint="Всё, кроме этого устройства, можно выкинуть одной кнопкой.">
          <div className="flex flex-col">
            {DEVICES.map((one) => (
              <span
                key={one.what}
                className="flex items-center gap-3 border-b border-paper/9 py-2.5 last:border-0"
              >
                <one.icon className="size-4 flex-none text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{one.what}</span>
                  <span className="lbl">
                    {one.where} · {one.when}
                  </span>
                </span>
                {one.here ? (
                  <span className="text-2xs text-money">это устройство</span>
                ) : (
                  <Button tone="quiet" size="sm">
                    выйти
                  </Button>
                )}
              </span>
            ))}
            <div className="mt-3 border-t border-paper/9 pt-3">
              <Button tone="line">Выйти отовсюду, кроме этого</Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ваши данные" hint="Всё, что приложение о вас знает, забирается одним файлом.">
          <div className="flex flex-col gap-3">
            <Button tone="line">
              <Download className="size-4" />
              Выгрузить архив
            </Button>
            <p className="hint">
              ZIP с таблицами: смены, дни, места, выплаты, расходы. Открывается в Excel.
            </p>
            <div className="border-t border-paper/9 pt-3">
              <Button tone="danger">
                <Trash2 className="size-4" />
                Удалить аккаунт
              </Button>
              <p className="hint mt-2">
                Вместе со сменами, выплатами и всем, что вы отмечали. Отменить нельзя.
              </p>
            </div>
          </div>
        </Card>

        <Card title="Остальное служебное">
          <div className="flex flex-col">
            {ELSEWHERE.map((one) => (
              <Link
                key={one.to}
                to={one.to}
                className="flex items-center gap-3 border-b border-paper/9 py-3 last:border-0 hover:text-brass"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{one.title}</span>
                  <span className="hint">{one.hint}</span>
                </span>
                <ArrowUpRight className="size-4 flex-none text-faint" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/service')({ component: Service });
