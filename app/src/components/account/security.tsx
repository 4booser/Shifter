import { ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Monitor, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accountApi, authApi, Profile } from '@/lib/api/auth';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * The parts of an account nobody changes twice: the password, the second
 * factor, the devices holding a key, and the door out.
 *
 * Each is a card that stays shut until asked, because a settings page where
 * every dangerous thing is already open is a settings page people scroll
 * past quickly.
 */
export function Security({ profile }: { profile: Profile | undefined }) {
  return (
    <>
      <PasswordCard needsOne={profile !== undefined && !profile.has_password} />
      <TwoFactorCard on={profile?.two_factor === true} />
      <SessionsCard />
    </>
  );
}

function Card({
  title,
  icon: Icon,
  hint,
  children,
}: {
  title: string;
  icon: typeof KeyRound;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div>
        <h2 className="flex items-center gap-1.5 font-bold">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </h2>
        {hint !== undefined && <p className="field-hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function PasswordCard({ needsOne }: { needsOne: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');

  const save = useMutation({
    mutationFn: () => accountApi.changePassword(needsOne ? null : current, next),
    onSuccess: () => {
      toast.success('Пароль изменён');
      setOpen(false);
      setCurrent('');
      setNext('');
      setAgain('');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const matches = next !== '' && next === again;

  return (
    <Card
      title={needsOne ? 'Задать пароль' : 'Пароль'}
      icon={KeyRound}
      hint={
        needsOne
          ? 'Вход пока только через Google. Пароль добавит второй способ войти.'
          : undefined
      }
    >
      {open ? (
        <div className="flex flex-col gap-2">
          {!needsOne && (
            <Input
              type="password"
              autoComplete="current-password"
              placeholder={t('Current password')}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          )}
          <Input
            type="password"
            autoComplete="new-password"
            placeholder={t('New password')}
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Ещё раз"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />
          {again !== '' && !matches && (
            <p className="field-hint" style={{ color: 'var(--danger)' }}>
              Пароли не совпадают.
            </p>
          )}
          <span className="flex gap-2">
            <Button disabled={!matches || save.isPending} onClick={() => save.mutate()}>
              Сохранить
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </span>
        </div>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
          {needsOne ? 'Задать пароль' : 'Изменить пароль'}
        </Button>
      )}
    </Card>
  );
}

function TwoFactorCard({ on }: { on: boolean }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState<string[] | null>(null);
  const [offering, setOffering] = useState(false);

  const done = () => {
    void client.invalidateQueries({ queryKey: ['account'] });
    setSecret(null);
    setCode('');
    setOffering(false);
  };

  const begin = useMutation({
    mutationFn: () => authApi.twoFactorSetup(),
    onSuccess: (answer) => setSecret(answer.secret),
    onError: (error: Error) => toast.error(error.message),
  });

  const enable = useMutation({
    mutationFn: () => authApi.twoFactorEnable(code.trim()),
    onSuccess: (answer) => {
      // Shown once and never again — the server keeps only their hashes.
      setBackup(answer.backup_codes);
      done();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disable = useMutation({
    mutationFn: () => authApi.twoFactorDisable(code.trim()),
    onSuccess: () => {
      toast.success('Второй фактор выключен');
      done();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card
      title="Вход по коду"
      icon={ShieldCheck}
      hint={
        on
          ? 'Включён: после пароля приложение спросит шесть цифр.'
          : 'Пароля мало, если его узнали. Код меняется каждые полминуты.'
      }
    >
      {backup !== null && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3">
          <p className="text-sm font-semibold">Запасные коды — сохраните их сейчас</p>
          <p className="field-hint">
            Каждый работает один раз. Второй раз их показать нельзя: на сервере лежат только
            их отпечатки.
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm tabular">
            {backup.map((one) => (
              <li key={one}>{one}</li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="self-start" onClick={() => setBackup(null)}>
            Записал
          </Button>
        </div>
      )}

      {secret !== null ? (
        <div className="flex flex-col gap-2">
          <p className="field-hint">Введите этот ключ в приложение-аутентификатор:</p>
          <code className="select-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm">
            {secret}
          </code>
          <Input
            inputMode="numeric"
            placeholder={t('Two-factor code')}
            maxLength={9}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <span className="flex gap-2">
            <Button disabled={code.trim() === '' || enable.isPending} onClick={() => enable.mutate()}>
              Включить
            </Button>
            <Button variant="ghost" onClick={done}>
              Отмена
            </Button>
          </span>
        </div>
      ) : on ? (
        offering ? (
          <div className="flex flex-col gap-2">
            <Input
              inputMode="numeric"
              placeholder="Код, чтобы подтвердить"
              maxLength={9}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <span className="flex gap-2">
              <Button
                variant="outline"
                disabled={code.trim() === '' || disable.isPending}
                onClick={() => disable.mutate()}
              >
                Выключить
              </Button>
              <Button variant="ghost" onClick={done}>
                Отмена
              </Button>
            </span>
          </div>
        ) : (
          <Button variant="outline" className="self-start" onClick={() => setOffering(true)}>
            Выключить
          </Button>
        )
      ) : (
        <Button
          variant="outline"
          className="self-start"
          disabled={begin.isPending}
          onClick={() => begin.mutate()}
        >
          Включить
        </Button>
      )}
    </Card>
  );
}

function SessionsCard() {
  const client = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => authApi.sessions() });

  const revoke = useMutation({
    mutationFn: (id: number) => authApi.revokeSession(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['sessions'] }),
    onError: () => toast.error('Не вышло — попробуйте ещё раз.'),
  });

  const rows = sessions.data?.sessions ?? [];

  if (rows.length === 0) return null;

  return (
    <Card
      title="Где вы вошли"
      icon={Monitor}
      hint="Каждая строка — устройство, у которого сейчас есть ключ."
    >
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const phone = /iPhone|Android|Mobile|Expo/i.test(row.user_agent ?? '');

          return (
            <li key={row.id} className="flex items-center gap-2">
              {phone ? (
                <Smartphone className="size-4 flex-none text-muted-foreground" />
              ) : (
                <Monitor className="size-4 flex-none text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{describe(row.user_agent)}</span>
                <span className="field-hint">
                  вошли {new Date(row.created_at).toLocaleDateString('ru', {
                    day: 'numeric',
                    month: 'long',
                  })}
                </span>
              </span>
              <button
                type="button"
                aria-label="Выкинуть это устройство"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(row.id)}
                className={cn(
                  'text-muted-foreground transition-colors hover:text-danger',
                  revoke.isPending && 'opacity-50',
                )}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** A user agent is not something to show a person; this is the gist of one. */
function describe(agent: string | null): string {
  if (agent === null || agent.trim() === '') return 'Неизвестное устройство';
  if (/Expo|okhttp|CFNetwork/i.test(agent)) return 'Приложение на телефоне';

  const browser = /Firefox/i.test(agent)
    ? 'Firefox'
    : /Edg/i.test(agent)
      ? 'Edge'
      : /Chrome|Chromium/i.test(agent)
        ? 'Chrome'
        : /Safari/i.test(agent)
          ? 'Safari'
          : 'Браузер';

  const system = /iPhone|iPad/i.test(agent)
    ? 'iPhone'
    : /Android/i.test(agent)
      ? 'Android'
      : /Mac OS/i.test(agent)
        ? 'Mac'
        : /Windows/i.test(agent)
          ? 'Windows'
          : /Linux/i.test(agent)
            ? 'Linux'
            : null;

  return system === null ? browser : `${browser} · ${system}`;
}
