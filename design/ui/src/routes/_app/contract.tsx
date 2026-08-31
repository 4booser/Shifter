import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, Check, ScanLine } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Field } from '@/components/ui/kit';
import { cn } from '@/lib/utils';

/**
 * Что спросить до подписи.
 *
 * Экран не выносит приговор договору — он находит, о чём в нём молчат, и
 * даёт формулировку вопроса. Разница принципиальная: «пункт отсутствует» —
 * это факт, а «договор плохой» — это совет, которого приложение давать не
 * вправе.
 */
const FOUND = [
  {
    ok: false,
    what: 'Часы',
    say: 'Про рабочие часы ничего. Спросите, сколько их в неделю и кто ставит график.',
  },
  {
    ok: false,
    what: 'Сверхурочные',
    say: 'Про часы сверх нормы ничего. Спросите, как их считают и по какой ставке платят.',
  },
  {
    ok: false,
    what: 'Перерыв',
    say: 'Перерыва нет. Спросите, сколько он длится и оплачивается ли.',
  },
  {
    ok: false,
    what: 'Увольнение',
    say: 'Про уход ничего. Спросите, за сколько предупреждает каждая сторона.',
  },
  {
    ok: false,
    what: 'Отпуск',
    say: 'Отпуска нет. Спросите, сколько дней в году и как их берут.',
  },
  {
    ok: true,
    what: 'Чаевые',
    say: 'Чаевые упомянуты. Спросите, какой раздел в цифрах и кто может его менять.',
  },
];

function Contract() {
  const missing = FOUND.filter((one) => !one.ok).length;

  return (
    <>
      <Head
        said="Перед выходом"
        title="Вопросы до подписи"
        hint="Вставьте текст договора. Приложение не оценивает его — оно показывает, о чём там не сказано."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Текст договора"
          hint="Остаётся в этом окне и никуда не отправляется."
          right={<ScanLine className="size-4 text-faint" />}
        >
          <div className="flex flex-col gap-3">
            <Field
              area
              placeholder="Вставьте текст или сфотографируйте страницы…"
              className="[&_span:last-child]:min-h-[300px]"
            />
            <div className="flex gap-2 [&>*]:flex-1">
              <Button tone="go">Разобрать</Button>
              <Button tone="line">Снять на камеру</Button>
            </div>
          </div>
        </Card>

        <Card
          title="О чём спросить"
          hint={`Не нашлось ${missing} из ${FOUND.length} обычных пунктов.`}
        >
          <div className="flex flex-col gap-2.5">
            {FOUND.map((one) => (
              <div
                key={one.what}
                className={cn(
                  'flex gap-3 rounded-[var(--radius-field)] border p-3',
                  one.ok ? 'border-paper/9' : 'border-taken/35 bg-taken/5',
                )}
              >
                <span className={cn('mt-0.5 flex-none', one.ok ? 'text-money' : 'text-taken')}>
                  {one.ok ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{one.what}</span>
                  <span className="hint mt-0.5 block">{one.say}</span>
                </span>
              </div>
            ))}

            <p className="hint mt-1 border-t border-paper/9 pt-3">
              Упомянуты — не значит справедливы. Пункты всё равно надо прочитать.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/contract')({ component: Contract });
