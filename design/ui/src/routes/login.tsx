import { useState } from 'react';
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
  const [second, setSecond] = useState(false);
  const [shown, setShown] = useState(false);

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

        {second ? (
          /* Второй шаг отдельным экраном, а не полем внизу того же: пока код
             ищут в телефоне, страница входа не должна показывать пароль. */
          <>
            <Field label="Код из приложения" placeholder="000000" />
            <p className="hint">
              Шесть цифр из аутентификатора. Нет телефона под рукой — подойдёт любой из запасных
              кодов.
            </p>
            <Link to="/">
              <Button tone="go" className="w-full">
                Подтвердить
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <button type="button" onClick={() => setSecond(false)}>
              <Button tone="quiet" className="w-full">Назад</Button>
            </button>
          </>
        ) : (
          <>
            <Field label="Логин" value="anya" />
            <div className="relative">
              <Field label="Пароль" value={shown ? 'ночная-смена' : '••••••••'} />
              <button
                type="button"
                onClick={() => setShown((was) => !was)}
                className="absolute top-0 right-0 text-2xs tracking-[0.1em] text-faint uppercase hover:text-paper"
              >
                {shown ? 'скрыть' : 'показать'}
              </button>
            </div>

            <button type="button" onClick={() => setSecond(true)}>
              <Button tone="go" className="w-full">
                Войти
                <ArrowRight className="size-4" />
              </Button>
            </button>

            <Button tone="line" className="w-full">Войти через Google</Button>

            <div className="flex items-center justify-between">
              <Link to="/reset" className="hint hover:text-paper">Забыли пароль?</Link>
              <Link to="/register" className="hint hover:text-paper">Создать аккаунт</Link>
            </div>
          </>
        )}

        <p className="hint mt-4 border-t border-paper/9 pt-4">
          Каркас интерфейса — <Link to="/kit" className="text-brass">дизайн-система</Link>.
        </p>
      </section>
    </main>
  );
}

export const Route = createFileRoute('/login')({ component: Login });
