'use client';

import Link from 'next/link';

import { useReveal } from '@/lib/fx';

/**
 * Open development, as a page: what shipped, what is being built, what is
 * queued — with the honest score up top. Hand-updated with each release
 * wave; the counts are the plan's real counts, not marketing.
 */
const SHIPPED: { icon: string; title: string; note: string }[] = [
  { icon: '📅', title: 'Календарь смен с деньгами', note: 'шаблоны, undo-стек, drag&drop, мультивыбор, клавиатура' },
  { icon: '⏱️', title: 'Живая смена', note: 'фактические часы, перерывы, автозавершение, гео-подсказка' },
  { icon: '📸', title: 'Импорт графика с фото', note: 'снимок из рабочего чата → месяц в календаре' },
  { icon: '📊', title: 'Статистика и «что-если»', note: 'прогнозы, цель, поток денег, календарь дней, ползунки темпа' },
  { icon: '💸', title: 'Выплаты и сверка', note: 'аванс/зарплата по правилам места, разница с расчётом' },
  { icon: '👥', title: 'Команды', note: 'общая рота, подмены, менеджерская доска с публикацией недели' },
  { icon: '✨', title: 'Биржа подработок', note: 'фриланс и постоянка, 36 ролей, фото заведений, анкеты «я ищу»' },
  { icon: '⭐', title: 'Отзывы в обе стороны', note: 'работник ⇄ заведение после состоявшейся смены' },
  { icon: '🔔', title: 'Уведомления', note: 'web push: зарплата, дайджест недели, цель достигнута, команда' },
  { icon: '🤖', title: 'Телеграм-бот', note: '«сегодня», «неделя», клок-ин из чата' },
  { icon: '🔐', title: 'Безопасность', note: '2FA, сессии устройств, экспорт всего, аудит дней' },
  { icon: '🗓️', title: 'Календарная подписка', note: 'смены в Google и Apple Calendar по личной ссылке' },
  { icon: '🏆', title: 'Годовой отчёт-постер', note: 'весь год как история с бейджем' },
  { icon: '🧵', title: 'Аватары', note: 'фото, значок роли или узор из собственного графика' },
  { icon: '🤝', title: 'Обмен сменами', note: 'два «да» — и обе смены меняются местами' },
  { icon: '🌙', title: 'Ночные и праздничные', note: 'надбавки по правилам места, календарь праздников' },
  { icon: '📱', title: 'Сторис-карточка', note: 'месяц в формате 9:16 для соцсетей' },
  { icon: '💡', title: 'Сводка дня', note: 'что важно сегодня, словами — на дашборде' },
  { icon: '🔑', title: 'Восстановление пароля', note: 'письмо со ссылкой, одноразовой и на час' },
  { icon: '📊', title: 'Страница статуса', note: 'публичный аптайм и здоровье баз' },
];

const BUILDING: { icon: string; title: string; note: string }[] = [
  { icon: '📱', title: 'Приложение iOS и Android', note: 'M0–M1 готовы: вход, календарь, редактор дня, живая смена' },
  { icon: '⭐', title: 'Рейтинги глубже', note: 'отзывы в анкетах и профилях, «позвать снова»' },
];

const QUEUED: string[] = [
  'Сброс пароля по почте',
  'Обмен сменами внутри команды',
  'Ночные и праздничные надбавки',
  'Виджеты и живая смена на локскрине',
  'Сторис-карточка недели 9:16',
  'Типы нерабочих дней: отпуск и больничный',
  'Овертайм-страж',
  'Двухвалютность для заробитчан',
  'Табель месяца для менеджера',
];

export default function RoadmapPage() {
  const revealHost = useReveal<HTMLDivElement>();
  const total = SHIPPED.length + BUILDING.length + QUEUED.length;
  const percent = Math.round((SHIPPED.length / total) * 100);

  return (
    <div ref={revealHost} className="min-h-dvh bg-(--bg) text-ink">
      <header className="app-chrome sticky top-0 z-40 border-b border-border bg-(--bg)/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-[1.05rem] font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-(--accent) text-white">S</span>
            Shifter
          </Link>
          <nav className="ml-auto flex items-center gap-2">
            <Link href="/login" className="btn btn-primary btn-sm">
              Открыть приложение
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-16">
        <section className="reveal pb-8 pt-12 text-center">
          <h1 className="text-balance text-[clamp(1.8rem,5vw,2.6rem)] font-extrabold leading-tight tracking-tight">
            Дорожная карта, вслух
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-muted">
            Shifter строится открыто. Вот честный счёт по задачам плана: что уже на проде,
            что собирается прямо сейчас и что стоит в очереди.
          </p>

          <div className="mx-auto mt-6 max-w-md">
            <div className="mb-1.5 flex items-baseline justify-between text-[0.85rem] font-semibold">
              <span>{SHIPPED.length} из {total} задач на проде</span>
              <span className="tabular text-(--accent-read)">{percent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-(--accent) transition-[width] duration-700"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="field-hint mt-1.5">
              {BUILDING.length} в работе · {QUEUED.length} в очереди
            </p>
          </div>
        </section>

        <section className="reveal mb-10">
          <h2 className="mb-3 text-[1.2rem] font-extrabold tracking-tight">
            <span className="mr-1.5 text-good">✓</span>На проде
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {SHIPPED.map((item) => (
              <article key={item.title} className="card lift flex items-start gap-2.5 p-3">
                <span className="text-[1.2rem]" aria-hidden>{item.icon}</span>
                <span className="min-w-0">
                  <b className="block text-[0.92rem] leading-tight">{item.title}</b>
                  <span className="field-hint">{item.note}</span>
                </span>
                <span className="chip ml-auto flex-none chip-good">✓</span>
              </article>
            ))}
          </div>
        </section>

        <section className="reveal mb-10">
          <h2 className="mb-3 text-[1.2rem] font-extrabold tracking-tight">
            <span className="mr-1.5 text-(--accent-read)">◐</span>Собирается сейчас
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {BUILDING.map((item) => (
              <article key={item.title} className="card flex items-start gap-2.5 !border-(--accent)/40 p-3">
                <span className="text-[1.2rem]" aria-hidden>{item.icon}</span>
                <span className="min-w-0">
                  <b className="block text-[0.92rem] leading-tight">{item.title}</b>
                  <span className="field-hint">{item.note}</span>
                </span>
                <span className="chip ml-auto flex-none animate-pulse chip-accent">•••</span>
              </article>
            ))}
          </div>
        </section>

        <section className="reveal mb-12">
          <h2 className="mb-3 text-[1.2rem] font-extrabold tracking-tight">
            <span className="mr-1.5 text-faint">○</span>В очереди
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {QUEUED.map((title) => (
              <span key={title} className="chip !py-1.5 text-muted">{title}</span>
            ))}
          </div>
        </section>

        <section className="reveal rounded-[calc(var(--radius)*1.6)] bg-(--accent) p-7 text-center text-white">
          <h2 className="text-[1.3rem] font-extrabold">Чего-то не хватает?</h2>
          <p className="mx-auto mt-1 max-w-sm text-white/85">
            План растёт из настоящих болей смены. Напишите нам — и пункт появится здесь.
          </p>
          <Link href="/login" className="mt-4 inline-block rounded-(--radius) bg-white px-6 py-2.5 font-bold text-(--accent-read)">
            Попробовать Shifter
          </Link>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-[0.8rem] text-muted">
        <Link href="/" className="font-semibold text-(--accent-read)">← на главную</Link> · обновлено 27.08.2026
      </footer>
    </div>
  );
}
