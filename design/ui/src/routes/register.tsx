import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

import { Button, Field } from '@/components/ui/kit';

/** Регистрация: три поля, потому что четвёртое никто не заполнит. */
function Register() {
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
          <h1 className="mt-4 text-2xl font-bold">Завести аккаунт</h1>
          <p className="hint mt-1">Смены останутся вашими: их не видит ни один работодатель.</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Имя" value="Аня" />
          <Field label="Фамилия" value="Проба" />
        </div>
        <Field label="Логин" value="anya" />
        <Field label="Пароль" value="••••••••" />

        <Link to="/"><Button tone="go" className="w-full">Создать<ArrowRight className="size-4" /></Button></Link>
        <Link to="/login"><Button tone="quiet" className="w-full">У меня уже есть аккаунт</Button></Link>
      </section>
    </main>
  );
}

export const Route = createFileRoute('/register')({ component: Register });
