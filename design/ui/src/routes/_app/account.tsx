import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, Download, Monitor, Send, Smartphone, Trash2 } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Field, Modal, Over, Pills, Switch } from '@/components/ui/kit';
import { cn } from '@/lib/utils';

/**
 * Аккаунт.
 *
 * Собран по одному правилу: рядом с каждым переключателем написано, что
 * случится, а не что он называется. «Выключить ленту календаря» — это не
 * настройка, а «подписанные календари перестанут обновляться», и человек
 * должен это прочитать до нажатия, а не после.
 */
const DEVICES = [
  { what: 'MacBook · Chrome', where: 'Киев', when: 'сейчас', here: true, icon: Monitor },
  { what: 'iPhone · приложение', where: 'Киев', when: '2 часа назад', here: false, icon: Smartphone },
  { what: 'Windows · Firefox', where: 'Львов', when: '11 дней назад', here: false, icon: Monitor },
  { what: 'Неизвестное устройство', where: 'Варшава', when: '2 месяца назад', here: false, icon: Monitor },
];

const CODES = ['4f2a-91bc', '7d10-33ef', 'a5c8-2b74', '0e6f-cd15', '9241-7ab3', 'b83d-4e09'];

function Account() {
  const [twoStep, setTwoStep] = useState(false);
  const [killing, setKilling] = useState(false);
  const [letter, setLetter] = useState(true);

  return (
    <>
      <Head said="Аккаунт" title="Кто вы и как входите" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Кто вы">
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Имя" value="Анна" />
              <Field label="Фамилия" value="Ковалевская" />
            </div>
            <Field label="Имя, которое видит смена" value="Аня" />
            <div className="flex flex-wrap justify-between gap-2 border-t border-paper/9 pt-3">
              <span className="hint">Вход по адресу 4booser@gmail.com</span>
              <span className="hint">С нами с марта 2024</span>
            </div>
          </div>
        </Card>

        <Card title="Пароль" hint="Пока пароля нет, войти можно только через Google.">
          <div className="flex flex-col gap-3">
            <Field label="Нынешний" placeholder="••••••••" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Новый" placeholder="не короче 8 знаков" />
              <Field label="Ещё раз" placeholder="" />
            </div>
            <Button tone="line">Сменить</Button>
          </div>
        </Card>
      </div>

      <Card
        title="Вход в два шага"
        hint="Второй шаг спрашивается только на новом устройстве."
        right={
          <button type="button" onClick={() => setTwoStep((was) => !was)}>
            <Button tone={twoStep ? 'quiet' : 'go'} size="sm">
              {twoStep ? 'Выключить' : 'Включить'}
            </Button>
          </button>
        }
      >
        {twoStep ? (
          <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
            <div>
              {/* Не настоящий код — сканировать в макете нечего. Но и не
                  диагональная штриховка: узор без углов-искателей читается
                  как сломанная картинка, а не как «здесь будет QR». */}
              <span className="grid size-[168px] place-items-center rounded-[var(--radius-field)] bg-paper">
                <span className="grid size-36 grid-cols-[repeat(21,1fr)] grid-rows-[repeat(21,1fr)]">
                  {Array.from({ length: 441 }, (_, cell) => {
                    const x = cell % 21;
                    const y = Math.floor(cell / 21);
                    const corner = (cx: number, cy: number) =>
                      x >= cx && x < cx + 7 && y >= cy && y < cy + 7;
                    const ring = (cx: number, cy: number) =>
                      x === cx || x === cx + 6 || y === cy || y === cy + 6;
                    const core = (cx: number, cy: number) =>
                      x >= cx + 2 && x <= cx + 4 && y >= cy + 2 && y <= cy + 4;

                    let dark: boolean;

                    if (corner(0, 0) || corner(14, 0) || corner(0, 14)) {
                      const cx = x >= 14 ? 14 : 0;
                      const cy = y >= 14 ? 14 : 0;
                      dark = ring(cx, cy) || core(cx, cy);
                    } else {
                      dark = (x * 13 + y * 29 + x * y * 7) % 5 < 2;
                    }

                    return <span key={cell} className={dark ? 'bg-night' : 'bg-paper'} />;
                  })}
                </span>
              </span>
              <p className="hint mt-2">Снимите любым приложением-аутентификатором.</p>
            </div>

            <div className="flex flex-col gap-3">
              <Field label="Или впишите ключ руками" value="JBSW Y3DP EHPK 3PXP" />
              <Field label="Код из приложения" placeholder="000000" />
              <Button tone="go" className="self-start">Подтвердить</Button>

              <div className="border-t border-paper/9 pt-3">
                <span className="lbl">Запасные коды</span>
                <p className="hint mt-1">
                  По одному разу каждый. Перепишите на бумагу: телефон, который их показывает, —
                  ровно тот, который вы потеряете.
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {CODES.map((code) => (
                    <span
                      key={code}
                      className="rounded-[var(--radius-field)] border border-paper/9 bg-night px-2.5 py-1.5 text-center font-mono text-xs"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-dim">
            Сейчас выключено. Включите — и чужой, у кого оказался пароль, всё равно не войдёт.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Где вы вошли" hint="Всё, кроме этого устройства, выкидывается одной кнопкой.">
          <div className="flex flex-col">
            {DEVICES.map((one) => (
              <span
                key={one.what}
                className="flex items-center gap-3 border-b border-paper/9 py-2.5 last:border-0"
              >
                <one.icon
                  className={cn('size-4 flex-none', one.where === 'Варшава' ? 'text-taken' : 'text-faint')}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{one.what}</span>
                  <span className="lbl">
                    {one.where} · {one.when}
                  </span>
                </span>
                {one.here ? (
                  <span className="text-2xs text-money">это устройство</span>
                ) : (
                  <Button tone="quiet" size="sm">выйти</Button>
                )}
              </span>
            ))}
            <div className="mt-3 border-t border-paper/9 pt-3">
              <Button tone="line">Выйти отовсюду, кроме этого</Button>
            </div>
          </div>
        </Card>

        <Card title="Телеграм" hint="Отметить смену, не открывая приложение.">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-dim">Не подключён.</p>
            <Field label="Отправьте боту этот код в течение пяти минут" value="7F3K-92" />
            <div className="flex gap-2">
              <Button tone="go">
                <Send className="size-4" />
                Открыть бота
              </Button>
              <Button tone="quiet">Новый код</Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Календарь для подписки" hint="Смены появятся в обычном календаре телефона.">
          <div className="flex flex-col gap-3">
            <Field label="Ссылка только на чтение" value="https://shifter.ink/feed/a4f2…" />
            <div className="flex flex-wrap gap-2">
              <Button tone="line" size="sm">
                <Copy className="size-3.5" />
                Скопировать
              </Button>
              <Button tone="quiet" size="sm">Новая ссылка</Button>
              <Button tone="quiet" size="sm">Выключить ленту</Button>
            </div>
            <p className="hint">
              Новая ссылка закрывает старую: календари, подписанные на неё, перестанут обновляться,
              и это будет выглядеть так, будто смен нет.
            </p>
          </div>
        </Card>

        <Card title="Месяц письмом" hint="Раз в месяц, коротко: сколько вышло и что изменилось.">
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => setLetter((was) => !was)} className="text-left">
              <Switch on={letter} label="Присылать" hint="На 4booser@gmail.com." />
            </button>
            <p className="hint">В каждом письме одна ссылка, которая их прекращает.</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Отдых между сменами" hint="Своя граница, а не та, что в законе.">
          <div className="flex flex-col gap-3">
            <Pills options={['8 ч', '10 ч', '11 ч', '12 ч']} value="11 ч" />
            <p className="hint">
              Одиннадцать часов — норма ежедневного отдыха, по которой считает ЕС. Если между вашими
              сменами выйдет меньше, график это отметит.
            </p>
          </div>
        </Card>

        <Card title="Ваши данные">
          <div className="flex flex-col gap-3">
            <Button tone="line">
              <Download className="size-4" />
              Выгрузить всё
            </Button>
            <p className="hint">
              ZIP с таблицами: смены, дни, места, выплаты, расходы. Открывается в Excel.
            </p>
            <div className="border-t border-paper/9 pt-3">
              <button type="button" onClick={() => setKilling(true)}>
                <Button tone="danger">
                  <Trash2 className="size-4" />
                  Удалить аккаунт
                </Button>
              </button>
            </div>
          </div>
        </Card>
      </div>

      <Over open={killing} onClose={() => setKilling(false)}>
        <Modal
          title="Удалить аккаунт"
          said="Вместе со сменами, выплатами и всем, что вы отмечали. Отменить нельзя."
          foot={
            <>
              <button type="button" onClick={() => setKilling(false)}>
                <Button tone="line" className="w-full">Оставить всё как есть</Button>
              </button>
              <Button tone="danger">Удалить насовсем</Button>
            </>
          }
        >
          <p className="text-sm text-dim">
            381 смена, 2 952 часа и три года записей исчезнут. Выгрузите архив, если он вам ещё
            понадобится — после удаления взять его будет негде.
          </p>
          <Field label="Впишите свой логин, чтобы подтвердить" placeholder="4booser@gmail.com" />
        </Modal>
      </Over>
    </>
  );
}

export const Route = createFileRoute('/_app/account')({ component: Account });
