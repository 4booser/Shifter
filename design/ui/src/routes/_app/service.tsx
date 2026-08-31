import { createFileRoute } from '@tanstack/react-router';
import { Download, MessageCircle, Plug, Trash2 } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Field, Switch } from '@/components/ui/kit';

/**
 * Служебные страницы.
 *
 * Их открывают редко и по делу: работает ли сервис, что изменилось, куда
 * дели данные, спросить словами. Собраны на одном экране, потому что
 * заслуживают одного пункта в меню, а не пяти.
 */
function Service() {
  return (
    <>
      <Head said="Служебное" title="Состояние и данные" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Как себя чувствует сервис">
          <div className="flex flex-col gap-2.5">
            {[
              { what: 'Приложение', ms: 12 },
              { what: 'База', ms: 3 },
              { what: 'Уведомления', ms: 41 },
              { what: 'Банк', ms: 88 },
            ].map((one) => (
              <span key={one.what} className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-money" />
                <span className="flex-1 text-sm">{one.what}</span>
                <span className="hint">работает</span>
                <span className="font-mono text-2xs text-faint tabular">{one.ms} мс</span>
              </span>
            ))}
            <p className="hint mt-1 border-t border-paper/9 pt-2.5">Без перерывов 27 дней.</p>
          </div>
        </Card>

        <Card title="Что нового">
          <div className="flex flex-col gap-3">
            {[
              { when: '31 августа', what: 'Живая смена считает перерыв' },
              { when: '24 августа', what: 'Банк показывает, во сколько обходится рабочий день' },
              { when: '18 августа', what: 'Обмен сменами внутри команды' },
              { when: '9 августа', what: 'Отчёт и справка о доходе' },
            ].map((one) => (
              <span key={one.when} className="border-b border-paper/9 pb-2.5 last:border-0 last:pb-0">
                <span className="lbl">{one.when}</span>
                <span className="mt-0.5 block text-sm">{one.what}</span>
              </span>
            ))}
          </div>
        </Card>

        <Card title="Спросить словами" right={<MessageCircle className="size-4 text-faint" />}>
          <div className="flex flex-col gap-2.5">
            <span className="self-end rounded-[var(--radius-field)] bg-raised px-3 py-2 text-sm">
              Сколько я заработал в июле?
            </span>
            <span className="rounded-[var(--radius-field)] border border-paper/9 px-3 py-2 text-sm text-dim">
              ₴21 400 за 128 часов. Это на 15% меньше августа.
            </span>
            <Field placeholder="Спросить о своих сменах" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ваши данные" hint="Всё, что приложение о вас знает, забирается одним файлом.">
          <div className="flex flex-col gap-3">
            <Button tone="line"><Download className="size-4" />Выгрузить архив</Button>
            <p className="hint">
              ZIP с таблицами: смены, дни, места, выплаты, расходы. Открывается в Excel.
            </p>
            <div className="border-t border-paper/9 pt-3">
              <Button tone="danger"><Trash2 className="size-4" />Удалить аккаунт</Button>
              <p className="hint mt-2">
                Вместе со сменами, выплатами и всем, что вы отмечали. Отменить нельзя.
              </p>
            </div>
          </div>
        </Card>

        <Card title="Уведомления и подключения" right={<Plug className="size-4 text-faint" />}>
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
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/service')({ component: Service });
