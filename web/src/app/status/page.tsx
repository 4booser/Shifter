'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/http';
import { useReveal } from '@/lib/fx';

interface Status {
  ok: boolean;
  checked_at: string;
  uptime_seconds: number;
  version: string;
  services: { name: string; ok: boolean; latency_ms: number }[];
}

const NAMES: Record<string, string> = {
  api: 'Приложение',
  'calendar-database': 'База календаря',
  'accounts-database': 'База аккаунтов',
};

/**
 * The public status page. It asks the service about itself and shows the
 * answer plainly — including a bad answer, because a status page that can
 * only say "fine" is decoration.
 */
export default function StatusPage() {
  const revealHost = useReveal<HTMLDivElement>();
  const [status, setStatus] = useState<Status | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const load = () =>
    void api<Status>('/shifter/v1/status')
      .then((value) => {
        setStatus(value);
        setUnreachable(false);
      })
      .catch(() => setUnreachable(true));

  useEffect(() => {
    load();

    // A status page that goes stale while you watch it is worse than none.
    const timer = setInterval(load, 30_000);

    return () => clearInterval(timer);
  }, []);

  const uptime = (seconds: number) => {
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days} дн. ${hours} ч`;
    if (hours > 0) return `${hours} ч ${minutes} мин`;

    return `${minutes} мин`;
  };

  const good = status?.ok === true && !unreachable;

  return (
    <div ref={revealHost} className="min-h-dvh bg-(--bg) text-ink">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-[1.05rem] font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-(--accent) text-white">S</span>
            Shifter
          </Link>
          <Link href="/roadmap" className="ml-auto text-[0.85rem] font-semibold text-(--accent)">
            Дорожная карта →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        <section className="reveal mb-8 text-center">
          <span
            className={`mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full text-[1.9rem] ${
              unreachable ? 'bg-(--danger-soft)' : good ? 'bg-(--good-soft)' : 'bg-(--warn-soft)'
            }`}
          >
            {unreachable ? '🔌' : good ? '✅' : '⚠️'}
          </span>
          <h1 className="text-balance text-[clamp(1.6rem,4vw,2.2rem)] font-extrabold tracking-tight">
            {unreachable ? 'Не отвечает' : good ? 'Всё работает' : 'Есть проблемы'}
          </h1>
          <p className="mt-1 text-muted">
            {unreachable
              ? 'Мы не смогли достучаться до сервиса из вашего браузера.'
              : 'Страница сама переспрашивает сервис каждые 30 секунд.'}
          </p>
        </section>

        {status !== null && (
          <>
            <section className="reveal mb-6 grid gap-2">
              {status.services.map((service) => (
                <div key={service.name} className="card flex items-center gap-3 p-3">
                  <span className={`h-2.5 w-2.5 flex-none rounded-full ${service.ok ? 'bg-good' : 'bg-danger'}`} />
                  <b className="text-[0.95rem]">{NAMES[service.name] ?? service.name}</b>
                  <span className="ml-auto text-[0.85rem] tabular text-muted">
                    {service.ok ? `${service.latency_ms} мс` : 'не отвечает'}
                  </span>
                </div>
              ))}
            </section>

            <section className="reveal grid grid-cols-2 gap-2 text-center">
              <div className="card p-3">
                <p className="text-[1.2rem] font-extrabold tabular">{uptime(status.uptime_seconds)}</p>
                <p className="field-hint">без перезапуска</p>
              </div>
              <div className="card p-3">
                <p className="text-[1.2rem] font-extrabold tabular">
                  {new Date(status.checked_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                <p className="field-hint">последняя проверка</p>
              </div>
            </section>
          </>
        )}

        <p className="reveal mt-8 text-center text-[0.85rem] text-muted">
          Бэкапы обеих баз снимаются каждую ночь с проверкой целостности и хранятся две недели.
        </p>
      </main>
    </div>
  );
}
