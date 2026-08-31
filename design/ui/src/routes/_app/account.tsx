import { createFileRoute } from '@tanstack/react-router';
import { KeyRound, LogOut, Monitor, ShieldCheck, Smartphone } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Field, Pills, Switch } from '@/components/ui/kit';

function Account() {
  return (
    <>
      <Head
        said="anya"
        title="Настройки"
        hint="Всё здесь меняет только вид — числа остаются теми же, какими их посчитал сервер."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Оформление" hint="Тема применяется сразу, на всех экранах.">
          <div className="flex flex-col gap-4">
            <div>
              <span className="lbl">Тема</span>
              <Pills className="mt-2" options={['как в системе', 'ночь', 'латунь', 'пепел', 'бумага']} value="ночь" />
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

        <Card title="Аккаунт">
          <div className="flex flex-col gap-3">
            <Field label="Как вас зовут" value="Аня" />
            <Field label="Почта" value="anya@example.com" />
            <Button tone="line"><LogOut className="size-4" />Выйти</Button>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Пароль" right={<KeyRound className="size-4 text-faint" />}>
          <Button tone="line">Изменить пароль</Button>
        </Card>

        <Card
          title="Вход по коду"
          hint="Пароля мало, если его узнали. Код меняется каждые полминуты."
          right={<ShieldCheck className="size-4 text-faint" />}
        >
          <Button tone="line">Включить</Button>
        </Card>

        <Card
          title="Где вы вошли"
          hint="Каждая строка — устройство, у которого сейчас есть ключ."
          right={<Monitor className="size-4 text-faint" />}
        >
          <div className="flex flex-col">
            {[
              { name: 'Chrome · Mac', when: 'вошли 31 августа', phone: false },
              { name: 'Приложение на телефоне', when: 'вошли 12 августа', phone: true },
            ].map((one) => (
              <span key={one.name} className="flex items-center gap-2.5 border-b border-paper/9 py-2.5 last:border-0">
                {one.phone
                  ? <Smartphone className="size-4 flex-none text-faint" />
                  : <Monitor className="size-4 flex-none text-faint" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{one.name}</span>
                  <span className="hint">{one.when}</span>
                </span>
              </span>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/account')({ component: Account });
