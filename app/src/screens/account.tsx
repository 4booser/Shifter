import { ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accountApi, authApi } from '@/lib/api/auth';
import { ACCENT_PRESETS, THEME_PRESETS, Settings } from '@/lib/settings/settings';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

const CURRENCIES = ['₴', '€', '$', '£', 'zł', '₽', 'Kč', '₸'];

/**
 * Settings, in the order somebody actually reaches for them: how it looks
 * first, because that is what a person changes on the first evening, and the
 * account itself last, because that is what they change once.
 */
export function Account() {
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const navigate = useNavigate();
  const client = useQueryClient();

  const profile = useQuery({ queryKey: ['account'], queryFn: () => accountApi.get() });

  const [name, setName] = useState<string | null>(null);
  const shownName = name ?? profile.data?.first_name ?? '';

  const rename = useMutation({
    mutationFn: () => accountApi.update(shownName.trim(), profile.data?.last_name ?? null),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['account'] });
      setName(null);
      toast.success('Имя изменено');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pick = <Key extends keyof Settings>(key: Key) =>
    (value: Settings[Key]) =>
      update(key, value);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
        <p className="field-hint">
          Всё здесь меняет только вид — числа остаются теми же, какими их посчитал сервер.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Оформление" hint="Тема применяется сразу, на всех экранах.">
          <Choice
            label="Тема"
            options={THEME_PRESETS.map((preset) => ({
              value: preset.value,
              label: THEME_NAMES[preset.value] ?? preset.label,
            }))}
            value={settings.theme}
            onPick={pick('theme')}
          />

          <div className="flex flex-col gap-1.5">
            <span className="field-label">Акцент</span>
            <div className="flex flex-wrap gap-1.5">
              {ACCENT_PRESETS.slice(0, 15).map((preset, index) => (
                <button
                  key={`${preset.value}-${index}`}
                  type="button"
                  aria-label={preset.label}
                  title={preset.label}
                  style={{ background: preset.value }}
                  onClick={() => update('accent', preset.value)}
                  className={cn(
                    'size-6 rounded-full ring-offset-2 ring-offset-[var(--surface)] transition-all',
                    settings.accent.toUpperCase() === preset.value.toUpperCase()
                      ? 'ring-2 ring-ink'
                      : 'hover:scale-110',
                  )}
                />
              ))}
            </div>
          </div>

          <Choice
            label="Плотность"
            options={[
              { value: 'comfortable', label: 'просторно' },
              { value: 'compact', label: 'плотно' },
            ]}
            value={settings.density}
            onPick={pick('density')}
          />

          <Slide
            label="Скругления"
            value={settings.roundness}
            min={0}
            max={22}
            suffix="px"
            onPick={(value) => update('roundness', value)}
          />
          <Slide
            label="Размер текста"
            value={settings.fontScale}
            min={13}
            max={19}
            suffix="px"
            onPick={(value) => update('fontScale', value)}
          />

          <Toggle
            label="Меньше движения"
            hint="Переходы и появления становятся мгновенными."
            on={settings.reduceMotion}
            onPick={(value) => update('reduceMotion', value)}
          />
        </Section>

        <Section
          title="Деньги"
          hint={`Так будут выглядеть суммы: ${formatMoney(settings, 12345)}`}
        >
          <div className="flex flex-col gap-1.5">
            <span className="field-label">Знак</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {CURRENCIES.map((sign) => (
                <button
                  key={sign}
                  type="button"
                  onClick={() => update('currency', sign)}
                  className={cn(
                    'min-w-9 rounded-full border px-2.5 py-1 text-sm font-semibold transition-colors',
                    settings.currency === sign
                      ? 'border-transparent bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground hover:text-ink',
                  )}
                >
                  {sign}
                </button>
              ))}
              <Input
                className="w-20"
                value={settings.currency}
                maxLength={4}
                onChange={(event) => update('currency', event.target.value)}
              />
            </div>
          </div>

          <Choice
            label="Где знак"
            options={[
              { value: true, label: `${settings.currency}100` },
              { value: false, label: `100 ${settings.currency}` },
            ]}
            value={settings.currencyBefore}
            onPick={pick('currencyBefore')}
          />
          <Choice
            label="Копейки"
            options={[
              { value: 0 as const, label: 'без них' },
              { value: 2 as const, label: 'две цифры' },
            ]}
            value={settings.moneyDecimals}
            onPick={pick('moneyDecimals')}
          />
          <Toggle
            label="Разделять тысячи"
            on={settings.groupThousands}
            onPick={(value) => update('groupThousands', value)}
          />
          <label className="flex flex-col gap-1">
            <span className="field-label">Считать всё в</span>
            <span className="flex items-center gap-2">
              <Input
                className="w-24"
                value={settings.baseCurrency}
                maxLength={3}
                placeholder="UAH"
                onChange={(event) => update('baseCurrency', event.target.value.toUpperCase())}
              />
              <span className="field-hint">
                Код валюты, в которую пересчитываются периоды с разными валютами. Пусто —
                не пересчитывать.
              </span>
            </span>
          </label>

          <Toggle
            label="Прятать суммы"
            hint="Числа заменяются точками — для чужих глаз через плечо."
            on={settings.hideAmounts}
            onPick={(value) => update('hideAmounts', value)}
          />
        </Section>

        <Section title="Календарь" hint="Что видно в клетке и с какого дня начинается неделя.">
          <Choice
            label="Неделя начинается"
            options={[
              { value: true, label: 'с понедельника' },
              { value: false, label: 'с воскресенья' },
            ]}
            value={settings.mondayFirst}
            onPick={pick('mondayFirst')}
          />
          <Choice
            label="Время в клетке"
            options={[
              { value: 'none' as const, label: 'не показывать' },
              { value: 'start' as const, label: 'начало' },
              { value: 'range' as const, label: 'начало и конец' },
            ]}
            value={settings.cellTimes}
            onPick={pick('cellTimes')}
          />
          <Toggle
            label="Заработок в клетке"
            on={settings.showEarningsInCells}
            onPick={(value) => update('showEarningsInCells', value)}
          />
          <Toggle
            label="Названия смен в клетке"
            on={settings.showShiftNamesInCells}
            onPick={(value) => update('showShiftNamesInCells', value)}
          />
          <Toggle
            label="Выделять выходные"
            on={settings.highlightWeekends}
            onPick={(value) => update('highlightWeekends', value)}
          />
        </Section>

        <Section title="Аккаунт" hint={profile.data?.login ?? ' '}>
          <label className="flex flex-col gap-1">
            <span className="field-label">Как вас зовут</span>
            <span className="flex gap-2">
              <Input
                value={shownName}
                placeholder="Имя"
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                variant="outline"
                disabled={
                  rename.isPending ||
                  shownName.trim() === '' ||
                  shownName.trim() === (profile.data?.first_name ?? '')
                }
                onClick={() => rename.mutate()}
              >
                Сохранить
              </Button>
            </span>
          </label>

          <p className="field-hint">
            Пароль, вход по Google, второй фактор и удаление аккаунта пока живут в старой
            версии — там же, где привязка Telegram и подписка на календарь.
          </p>

          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              // The token is dropped locally first and told to the server
              // after: a sign-out that waits on the network is a sign-out
              // that fails on a train.
              authApi.logout();
              client.clear();
              void navigate({ to: '/sign-in' });
            }}
          >
            <LogOut className="size-4" />
            Выйти
          </Button>
        </Section>
      </div>
    </div>
  );
}

const THEME_NAMES: Record<string, string> = {
  system: 'как в системе',
  light: 'светлая',
  grey: 'серая',
  sand: 'песок',
  mint: 'мята',
  dark: 'тёмная',
  night: 'ночь',
  ocean: 'океан',
  plum: 'слива',
  gradient: 'градиент',
};

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-4 p-4">
      <div>
        <h2 className="font-bold">{title}</h2>
        {hint !== undefined && <p className="field-hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** One row of pills, because a select hides the choices it is offering. */
function Choice<Value extends string | number | boolean>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: Value; label: string }[];
  value: Value;
  onPick: (value: Value) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="field-label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={`${option.value}`}
            type="button"
            onClick={() => onPick(option.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
              value === option.value
                ? 'border-transparent bg-accent text-accent-foreground'
                : 'border-border text-muted-foreground hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onPick,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onPick: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onPick(!on)}
      className="flex items-center justify-between gap-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint !== undefined && <span className="field-hint">{hint}</span>}
      </span>
      <span
        className={cn(
          'relative h-6 w-10 flex-none rounded-full transition-colors',
          on ? 'bg-[var(--accent)]' : 'bg-surface-2 ring-1 ring-border',
        )}
      >
        <span
          className={cn(
            'absolute top-1 size-4 rounded-full bg-surface shadow-sm transition-all',
            on ? 'left-5' : 'left-1',
          )}
        />
      </span>
    </button>
  );
}

function Slide({
  label,
  value,
  min,
  max,
  suffix,
  onPick,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onPick: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span className="field-label">{label}</span>
        <span className="field-hint tabular">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onPick(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-[var(--accent)]"
      />
    </label>
  );
}
