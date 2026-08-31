import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth';
import { apiErrorMessage } from '@/lib/api/http';

/**
 * The door.
 *
 * A working person opens this on a phone, in a corridor, one-handed and in a
 * hurry — so the card is the whole screen's business: two fields, one button,
 * and a ground that says which product this is before a word is read. The
 * ambience is two soft lights behind glass, not a photograph: it costs
 * nothing to paint and never competes with the form.
 */
/**
 * Where signing in lands.
 *
 * Back to whatever the expired session interrupted, and to the calendar
 * otherwise. Only a same-site path is honoured — a returnUrl is a string a
 * stranger can put in a link, and an absolute one would make this form an
 * open redirect.
 */
function landing(): string {
  const asked = new URLSearchParams(window.location.search).get('returnUrl');

  if (asked == null || !asked.startsWith('/') || asked.startsWith('//')) return '/';
  if (asked.startsWith('/sign-in')) return '/';

  return asked;
}

export function SignIn() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [peeking, setPeeking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await authApi.login({ login: login.trim(), password });
      window.location.assign(landing());
    } catch (caught) {
      setError(apiErrorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      {/* Two lights and a grain: the ground is chosen, not defaulted. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 size-[36rem] rounded-full opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, var(--accent-soft), transparent)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-32 size-[32rem] rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, var(--good-soft), transparent)' }}
      />

      <section className="card relative w-full max-w-sm p-7">
        <header className="mb-6 flex items-center gap-3">
          <span
            className="grid size-11 place-items-center rounded-2xl text-lg font-black"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            S
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Shifter</h1>
            <p className="field-hint">Смены, часы и деньги — посчитанные честно.</p>
          </div>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login">Логин</Label>
            <Input
              id="login"
              autoComplete="username"
              autoFocus
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Пароль</Label>
            <div className="relative">
              <Input
                id="password"
                type={peeking ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-10"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {password !== '' && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={peeking ? 'Скрыть пароль' : 'Показать пароль'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-ink"
                  onClick={() => setPeeking((was) => !was)}
                >
                  {peeking ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              )}
            </div>
          </div>

          {error !== null && (
            <p
              role="alert"
              className="rounded-[var(--radius-field)] px-3 py-2 text-sm"
              style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              {error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={busy || login === '' || password === ''} className="group">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Войти
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </form>
      </section>
    </main>
  );
}
