import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

import { Button, Field } from '@/components/ui/kit';

/**
 * Вход.
 *
 * Свет сверху и три поля: в два часа ночи это должно занимать четыре
 * секунды. Оболочки приложения здесь нет — до входа её и не существует.
 */
function Login() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(90% 60% at 50% -10%, rgba(224,164,91,0.13), transparent 60%)' }}
      />

      <section className="relative flex w-full max-w-sm flex-col gap-4">
        <div>
          <span className="text-lg font-extrabold tracking-[-0.04em]">
            Shifter<span className="text-brass">.</span>
          </span>
          <h1 className="mt-4 text-2xl font-bold">Смены, часы и деньги</h1>
          <p className="hint mt-1">Посчитанные честно, без чужих правил.</p>
        </div>

        <Field label="Логин" value="anya" />
        <Field label="Пароль" value="••••••••" />

        <Link to="/">
          <Button tone="go" className="w-full">
            Войти
            <ArrowRight className="size-4" />
          </Button>
        </Link>

        <div className="flex items-center justify-between">
          <span className="hint">Забыли пароль?</span>
          <span className="hint">Создать аккаунт</span>
        </div>

        <p className="hint mt-4 border-t border-paper/9 pt-4">
          Каркас интерфейса — <Link to="/kit" className="text-brass">дизайн-система</Link>.
        </p>
      </section>
    </main>
  );
}

export const Route = createFileRoute('/login')({ component: Login });
