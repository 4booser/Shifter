import { createFileRoute } from '@tanstack/react-router';
import { ArrowRight, Eye, KeyRound, Monitor, ShieldCheck, Smartphone } from 'lucide-react';

import { Frame, Plate, Sheet } from '@/components/frame';
import { Button, Card, Field, Pills, Switch } from '@/components/ui/kit';

const THEMES = ['как в системе', 'ночь', 'латунь', 'пепел', 'бумага'];

function Account() {
  return (
    <Sheet
      kicker="05 · Настройки и вход"
      title="Про себя и про вход"
      blurb="Всё, что человек трогает один раз и забывает: как это выглядит, как печатаются деньги, что видно в клетке, и кто ещё держит ключ от аккаунта."
    >
      <Plate
        title="Настройки"
        path="/account"
        why="Разложено по тому, как об этом думают, а не по тому, как хранится: сначала вид, потом деньги, потом календарь, потом сам аккаунт."
      >
        <Frame tab="Календарь">
          <div>
            <span className="lbl">Настройки</span>
            <h2 className="mt-1 text-2xl font-bold">Как это выглядит и считается</h2>
            <p className="hint mt-1">
              Всё здесь меняет только вид — числа остаются теми же, какими их посчитал сервер.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Оформление" hint="Тема применяется сразу, на всех экранах.">
              <div className="flex flex-col gap-4">
                <div>
                  <span className="lbl">Тема</span>
                  <Pills className="mt-2" options={THEMES} value="ночь" />
                </div>
                <div>
                  <span className="lbl">Плотность</span>
                  <Pills className="mt-2" options={['просторно', 'плотно']} value="просторно" />
                </div>
                <div>
                  <span className="lbl">Размер текста</span>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="h-1.5 flex-1 rounded-full bg-raised">
                      <span className="block h-full w-1/2 rounded-full bg-brass" />
                    </span>
                    <span className="font-mono text-xs text-faint tabular">15px</span>
                  </div>
                </div>
                <Switch label="Меньше движения" hint="Переходы становятся мгновенными." />
              </div>
            </Card>

            <Card title="Деньги" hint="Так будут выглядеть суммы: ₴12 345">
              <div className="flex flex-col gap-4">
                <div>
                  <span className="lbl">Знак</span>
                  <Pills className="mt-2" options={['₴', '€', '$', '£', 'zł', '₸']} value="₴" />
                </div>
                <div>
                  <span className="lbl">Где знак</span>
                  <Pills className="mt-2" options={['₴100', '100 ₴']} value="₴100" />
                </div>
                <div>
                  <span className="lbl">Копейки</span>
                  <Pills className="mt-2" options={['без них', 'две цифры']} value="без них" />
                </div>
                <Switch on label="Разделять тысячи" />
                <Switch label="Прятать суммы" hint="Числа заменяются точками — для чужих глаз." />
              </div>
            </Card>

            <Card title="Календарь" hint="Что видно в клетке и с какого дня начинается неделя.">
              <div className="flex flex-col gap-4">
                <div>
                  <span className="lbl">Неделя начинается</span>
                  <Pills className="mt-2" options={['с понедельника', 'с воскресенья']} value="с понедельника" />
                </div>
                <div>
                  <span className="lbl">Время в клетке</span>
                  <Pills className="mt-2" options={['не показывать', 'начало', 'начало и конец']} value="не показывать" />
                </div>
                <Switch on label="Заработок в клетке" />
                <Switch on label="Названия смен в клетке" />
                <Switch on label="Выделять выходные" />
              </div>
            </Card>

            <Card title="Аккаунт" hint="anya">
              <div className="flex flex-col gap-3">
                <Field label="Как вас зовут" value="Аня" />
                <p className="hint">
                  Привязка Google и Telegram, подписка на календарь и удаление аккаунта — ниже.
                </p>
                <Button tone="line">Выйти</Button>
              </div>
            </Card>
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Безопасность"
        path="/account · пароль, код, устройства"
        why="Каждая карточка закрыта, пока её не попросят: страница, где всё опасное уже раскрыто, — это страница, которую пролистывают."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Пароль" right={<KeyRound className="size-4 text-faint" />}>
            <Button tone="line">Изменить пароль</Button>
          </Card>

          <Card
            title="Вход по коду"
            hint="Пароля мало, если его узнали. Код меняется каждые полминуты."
            right={<ShieldCheck className="size-4 text-faint" />}
          >
            <div className="flex flex-col gap-2.5">
              <span className="rounded-[var(--radius-field)] bg-night px-3 py-2 font-mono text-xs break-all select-all">
                JBSWY3DPEHPK3PXP
              </span>
              <Field label="Код из приложения" placeholder="123456" />
              <Button tone="go">Включить</Button>
            </div>
          </Card>

          <Card
            title="Где вы вошли"
            hint="Каждая строка — устройство, у которого сейчас есть ключ."
            right={<Monitor className="size-4 text-faint" />}
          >
            <div className="flex flex-col">
              {[
                ['Chrome · Mac', 'вошли 31 августа', Monitor],
                ['Приложение на телефоне', 'вошли 12 августа', Smartphone],
              ].map(([name, when, Icon]) => {
                const Glyph = Icon as typeof Monitor;

                return (
                  <span key={name as string} className="flex items-center gap-2.5 border-b border-paper/9 py-2.5 last:border-0">
                    <Glyph className="size-4 flex-none text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{name as string}</span>
                      <span className="hint">{when as string}</span>
                    </span>
                  </span>
                );
              })}
            </div>
          </Card>
        </div>
      </Plate>

      <Plate
        title="Вход"
        path="/login · /register · /reset"
        why="Первый экран приложения. Свет сверху и одно поле за другим: в два часа ночи это должно занимать четыре секунды."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              title: 'Вход',
              said: 'Смены, часы и деньги — посчитанные честно.',
              fields: [['Логин', 'anya'], ['Пароль', '••••••••']],
              action: 'Войти',
              foot: 'Забыли пароль?',
            },
            {
              title: 'Второй шаг',
              said: 'Шесть цифр из приложения-аутентификатора.',
              fields: [['Код из приложения', '••••••']],
              action: 'Подтвердить',
              foot: 'Или один из запасных кодов',
            },
            {
              title: 'Новый пароль',
              said: 'Ссылка одноразовая и живёт час.',
              fields: [['Новый пароль', '••••••••'], ['Ещё раз', '••••••••']],
              action: 'Сменить',
            },
          ].map((one) => (
            <div
              key={one.title}
              className="relative grid place-items-center overflow-hidden rounded-[var(--radius-card)] border border-paper/9 bg-night px-5 py-10"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(120% 80% at 50% -10%, rgba(224,164,91,0.10), transparent 60%)' }}
              />
              <div className="relative flex w-full max-w-xs flex-col gap-3.5">
                <div>
                  <span className="text-base font-extrabold tracking-[-0.04em]">
                    Shifter<span className="text-brass">.</span>
                  </span>
                  <h3 className="mt-3 text-xl font-bold">{one.title}</h3>
                  <p className="hint mt-0.5">{one.said}</p>
                </div>
                {one.fields.map(([label, value]) => (
                  <Field key={label} label={label} value={value} />
                ))}
                <Button tone="go" className="w-full">
                  {one.action}
                  <ArrowRight className="size-4" />
                </Button>
                {one.foot !== undefined && (
                  <p className="hint text-center">{one.foot}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Plate>

      <Plate
        title="Приглашение в команду"
        path="/join"
        why="Экран, на который приходят по ссылке от коллеги. Он должен объяснить, чем делятся, до того как спросит согласие."
      >
        <div className="relative grid place-items-center overflow-hidden rounded-[var(--radius-card)] border border-paper/9 bg-night px-5 py-12">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(120% 80% at 50% -10%, rgba(224,164,91,0.10), transparent 60%)' }}
          />
          <div className="relative flex w-full max-w-sm flex-col gap-4 text-center">
            <div>
              <span className="lbl">Вас зовут в команду</span>
              <h3 className="mt-2 text-2xl font-bold">Смена «Сова»</h3>
              <p className="hint mt-1">Днепр · 4 человека</p>
            </div>
            <p className="text-sm text-dim">
              Команда видит, кто и когда выходит. Заработок остаётся вашим — на общем графике
              его нет ни у кого.
            </p>
            <Field label="Как вас звать в графике" value="Аня" />
            <Button tone="go" className="w-full">Присоединиться</Button>
            <Button tone="quiet" className="w-full">
              <Eye className="size-4" />
              Сначала посмотреть
            </Button>
          </div>
        </div>
      </Plate>
    </Sheet>
  );
}

export const Route = createFileRoute('/account')({ component: Account });
