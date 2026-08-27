'use client';

import Link from 'next/link';

import { useMemo, useState } from 'react';

import { GIG_CATEGORIES } from '@/lib/api/gigs';
import { useReveal } from '@/lib/fx';
import { Icon } from '@/components/ui/icon';
import { CalendarDemo, GigsDemo, LiveShiftDemo, StretchWeekDemo, WhatIfDemo } from '@/components/landing/demos';

/**
 * The public face of the product: what Shifter is, shown with its own real
 * screens. Everything here wears the same tokens as the app behind the
 * door — the landing IS the first screenshot.
 */
const TRADE_RU: Record<string, string> = {
  managing: 'Управляющий', 'floor-manager': 'Менеджер зала', chef: 'Шеф-повар', 'sous-chef': 'Су-шеф',
  'shift-lead': 'Старший смены', bartender: 'Бармен', barback: 'Барбек', barista: 'Бариста',
  sommelier: 'Сомелье', waiter: 'Официант', runner: 'Раннер', host: 'Хостес', cashier: 'Кассир',
  busser: 'Сборщик столов', 'cook-hot': 'Повар горячего', 'cook-cold': 'Повар холодного',
  'cook-universal': 'Универсал', prep: 'Заготовщик', grill: 'Гриль', wok: 'Вок', pizzaiolo: 'Пиццайоло',
  sushi: 'Сушист', pastry: 'Кондитер', baker: 'Пекарь', dishwasher: 'Посудомойщик', cleaner: 'Уборщик',
  storekeeper: 'Кладовщик', courier: 'Курьер', catering: 'Кейтеринг',
};

const THEMES = [
  { id: 'cream', label: 'Крем', dot: '#4f46e5', vars: {} },
  {
    id: 'night',
    label: 'Ночь',
    dot: '#7b7ef5',
    vars: {
      '--bg': '#14131a', '--bg-veil': 'none', '--surface': '#1d1c25', '--surface-2': '#26242f',
      '--border': '#32303d', '--border-strong': '#4a4759', '--text': '#eceef2',
      '--muted': '#a3a1b0', '--faint': '#6f6d7d', '--accent': '#7b7ef5',
      '--accent-soft': 'rgb(123 126 245 / 16%)', '--good': '#4fc98d',
    },
  },
  {
    id: 'mint',
    label: 'Мята',
    dot: '#0d9488',
    vars: {
      '--bg': '#eef4f1', '--surface': '#fbfdfc', '--surface-2': '#e4eeea', '--border': '#d2e2db',
      '--border-strong': '#a9c6ba', '--accent': '#0d9488', '--accent-hover': '#12a898',
      '--accent-soft': 'rgb(13 148 136 / 12%)',
    },
  },
  {
    id: 'rose',
    label: 'Закат',
    dot: '#db2777',
    vars: {
      '--bg': '#f7f0ef', '--surface': '#fdfafa', '--surface-2': '#f3e8e7', '--border': '#e8d7d5',
      '--border-strong': '#d0b3af', '--accent': '#db2777', '--accent-hover': '#e5378a',
      '--accent-soft': 'rgb(219 39 119 / 12%)',
    },
  },
] as const;

export function Landing() {
  const revealHost = useReveal<HTMLDivElement>();
  const [theme, setTheme] = useState(0);

  return (
    <div
      id="top"
      ref={revealHost}
      className="min-h-dvh bg-(--bg) text-ink transition-colors duration-300"
      style={THEMES[theme].vars as React.CSSProperties}
    >
      {/* ==== Top bar ==== */}
      <header className="sticky top-0 z-40 border-b border-border bg-(--bg)/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-2 text-[1.05rem] font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-(--accent) text-white">S</span>
            Shifter
          </span>
          <span className="ml-3 hidden items-center gap-1.5 sm:flex" title="Примерьте тему — в приложении их ещё больше">
            {THEMES.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                aria-label={entry.label}
                className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${theme === index ? 'scale-110 border-ink/60' : 'border-transparent'}`}
                style={{ background: entry.dot }}
                onClick={() => setTheme(index)}
              />
            ))}
          </span>
          <nav className="ml-auto flex items-center gap-2">
            <Link href="/login" className="btn btn-quiet btn-sm">
              Войти
            </Link>
            <Link href="/login" className="btn btn-primary btn-sm">
              Начать бесплатно
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        {/* ==== Hero ==== */}
        <section className="pb-10 pt-14 text-center md:pt-20">
          <p className="reveal mb-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[0.78rem] font-semibold text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-good" />
            Для тех, кто работает сменами: бар, кухня, зал, доставка
          </p>
          <h1 className="reveal mx-auto max-w-3xl text-balance text-[clamp(2rem,6vw,3.4rem)] font-extrabold leading-[1.06] tracking-tight">
            Календарь, который знает, сколько вы заработали
          </h1>
          <p className="reveal mx-auto mt-4 max-w-xl text-balance text-[1.05rem] text-muted">
            Отмечаете смены одним касанием — Shifter считает часы, ставки, чаевые, переработки
            и говорит, когда придут деньги. Живая смена тикает, пока вы работаете.
          </p>

          <div className="reveal mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="btn btn-primary !px-6 !py-3 !text-[1rem]">
              Открыть в браузере — бесплатно
            </Link>
            <StoreBadge kind="apple" />
            <StoreBadge kind="play" />
          </div>

          <div className="reveal mx-auto mt-10">
            <LiveShiftDemo />
          </div>

          <div className="reveal mx-auto mt-10 max-w-5xl">
            <div className="card overflow-hidden !p-1.5 shadow-(--shadow-lg)">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/calendar.jpg" alt="Календарь Shifter: месяц со сменами и деньгами" className="w-full rounded-[calc(var(--radius)-2px)]" />
            </div>
          </div>
        </section>

        {/* ==== Platforms ==== */}
        <section className="reveal flex flex-wrap items-center justify-center gap-2 pb-12 text-[0.85rem]">
          {[
            { label: 'Web', note: 'уже работает', live: true },
            { label: 'iPhone', note: 'в разработке', live: false },
            { label: 'Android', note: 'в разработке', live: false },
            { label: 'Telegram-бот', note: 'уже работает', live: true },
          ].map((platform) => (
            <span key={platform.label} className="chip !px-3 !py-1.5">
              <b>{platform.label}</b>
              <span className={platform.live ? 'text-good' : 'text-muted'}> · {platform.note}</span>
            </span>
          ))}
        </section>

        {/* ==== Trade marquee ==== */}
        <section className="reveal relative -mx-4 mb-12 overflow-hidden border-y border-border bg-surface py-3">
          <div className="landing-marquee flex w-max gap-2 whitespace-nowrap">
            {[...GIG_CATEGORIES, ...GIG_CATEGORIES].map((trade, index) => (
              <span key={`${trade.id}-${index}`} className="chip !border-transparent !bg-transparent text-[0.85rem] text-muted">
                {trade.emoji} {TRADE_RU[trade.id] ?? trade.label}
              </span>
            ))}
          </div>
        </section>

        {/* ==== Numbers ==== */}
        <section className="reveal mb-12 grid grid-cols-2 gap-3 text-center md:grid-cols-4">
          {[
            { value: '29', label: 'ролей общепита на бирже' },
            { value: '×1', label: 'касание, чтобы отметить смену' },
            { value: '436', label: 'автотестов держат каждую цифру' },
            { value: '24/7', label: 'бэкапы и телеграм-бот на связи' },
          ].map((stat) => (
            <div key={stat.label} className="card !p-4">
              <p className="text-[1.7rem] font-extrabold tabular text-(--accent)">{stat.value}</p>
              <p className="text-[0.82rem] text-muted">{stat.label}</p>
            </div>
          ))}
        </section>

        <p className="reveal -mt-8 mb-12 text-center">
          <Link href="/roadmap" className="text-[0.88rem] font-semibold text-(--accent)">
            Открытая разработка: смотреть прогресс по задачам →
          </Link>
        </p>

        {/* ==== Features ==== */}
        <section className="grid gap-3 pb-14 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: 'clock', title: 'Живая смена', text: 'Нажали «начал» — таймер и заработок тикают на глазах. «Закончил» — фактические часы уже в календаре.' },
            { icon: 'chart', title: 'Статистика без таблиц', text: 'Откуда пришли деньги, форма вашей недели, лучший час, прогноз к концу месяца и «что-если» с ползунками.' },
            { icon: 'users', title: 'Команда и ротация', text: 'Общий график с коллегами без чужих денег, менеджерская доска с публикацией недели, подмены в два тапа.' },
            { icon: 'spark', title: 'Биржа подработок', text: 'Разовые смены и постоянка по всему общепиту: 29 ролей, фото заведений, «Я выйду» — и контакты у работодателя.' },
            { icon: 'wallet', title: 'Выплаты и сверка', text: 'Аванс и зарплата по правилам вашего заведения. Пришло меньше расчёта — Shifter покажет разницу.' },
            { icon: 'key', title: 'Ваши данные — ваши', text: 'Двухфакторный вход, экспорт всего в один клик, календарная подписка для Google и Apple Calendar.' },
          ].map((feature) => (
            <article key={feature.title} className="card lift reveal p-4">
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-(--radius) bg-(--accent-soft) text-(--accent)">
                <Icon name={feature.icon} size={18} />
              </span>
              <h2 className="mb-1 text-[1rem] font-bold">{feature.title}</h2>
              <p className="text-[0.9rem] text-muted">{feature.text}</p>
            </article>
          ))}
        </section>

        {/* ==== Playground ==== */}
        <section className="pb-14">
          <h2 className="reveal mb-1 text-center text-[1.6rem] font-extrabold tracking-tight">
            Не верьте скриншотам — потрогайте
          </h2>
          <p className="reveal mb-5 text-center text-muted">
            Три настоящих механики Shifter со случайными данными. Кликайте смело: это песочница.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <CalendarDemo />
            <StretchWeekDemo />
            <WhatIfDemo />
            <GigsDemo />
          </div>
        </section>

        {/* ==== Screens ==== */}
        <section className="grid gap-4 pb-14 md:grid-cols-2">
          {[
            { src: '/landing/stats.jpg', title: 'Статистика, которую хочется открывать', text: 'Прогноз, цель, «что-если» и месяц одним взглядом.' },
            { src: '/landing/gigs.jpg', title: 'Подработки календарём', text: 'Каждый день показывает, сколько смен ищут людей и сколько платят вместе.' },
          ].map((shot) => (
            <figure key={shot.src} className="reveal">
              <div className="card overflow-hidden !p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.src} alt={shot.title} className="w-full rounded-[calc(var(--radius)-2px)]" />
              </div>
              <figcaption className="mt-2 px-1">
                <b className="text-[0.95rem]">{shot.title}</b>
                <p className="text-[0.85rem] text-muted">{shot.text}</p>
              </figcaption>
            </figure>
          ))}
        </section>

        {/* ==== Mobile ==== */}
        <section className="reveal mb-14 overflow-hidden rounded-[calc(var(--radius)*1.6)] border border-border bg-surface">
          <div className="grid items-center gap-6 p-6 md:grid-cols-[1fr_auto] md:p-10">
            <div>
              <p className="mb-1 text-[0.78rem] font-bold uppercase tracking-wide text-(--accent)">iOS и Android</p>
              <h2 className="mb-2 text-balance text-[1.6rem] font-extrabold leading-tight">
                Приложение уже в разработке — полный паритет с вебом
              </h2>
              <p className="mb-4 max-w-md text-muted">
                Родное приложение на обеих платформах: виджеты на домашний экран, живая смена
                на локскрине, гео-напоминание начать смену и вход по Face ID.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <StoreBadge kind="apple" />
                <StoreBadge kind="play" />
              </div>
            </div>
            <div className="mx-auto w-[13.5rem] flex-none">
              <div className="rounded-[2.2rem] border-[6px] border-ink/85 bg-ink/85 shadow-(--shadow-lg)">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/landing/mobile.png" alt="Shifter на iPhone" className="w-full rounded-[1.85rem]" />
              </div>
            </div>
          </div>
        </section>

        {/* ==== What's new ==== */}
        <section className="reveal mb-14">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[1.4rem] font-extrabold tracking-tight">Что нового</h2>
            <Link href="/whats-new" className="text-[0.85rem] font-semibold text-(--accent)">
              вся история →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: '✨', date: 'август 2026', title: 'Биржа подработок 2.0', text: 'Фриланс и постоянка, 36 ролей, фото заведений, календарь вакансий и анкеты «я ищу».' },
              { icon: '🧵', date: 'август 2026', title: 'Аватар из вашего графика', text: 'Фото, значок роли — или узор, сотканный из ваших собственных смен.' },
              { icon: '🎚️', date: 'август 2026', title: 'Что-если калькулятор', text: 'Два ползунка превращают «ещё смену в неделю» в деньги и дату цели.' },
              { icon: '📱', date: 'в разработке', title: 'Приложение iOS и Android', text: 'Полный паритет, виджеты, живая смена на локскрине и вход по Face ID.' },
            ].map((item) => (
              <article key={item.title} className="card lift p-4">
                <p className="mb-1 flex items-center justify-between text-[0.72rem] font-bold uppercase tracking-wide text-faint">
                  <span className="text-[1.1rem]">{item.icon}</span>
                  {item.date}
                </p>
                <h3 className="mb-1 text-[0.95rem] font-bold">{item.title}</h3>
                <p className="text-[0.85rem] text-muted">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ==== FAQ ==== */}
        <section className="reveal mx-auto mb-14 max-w-2xl">
          <h2 className="mb-3 text-center text-[1.4rem] font-extrabold tracking-tight">Коротко о важном</h2>
          {[
            { q: 'Это бесплатно?', a: 'Да. Регистрация за минуту, карта не нужна, все функции открыты.' },
            { q: 'Команда увидит мои деньги?', a: 'Нет. В общем графике коллеги видят только кто и когда работает. Заработок виден лишь тем, кто сам включил «делиться».' },
            { q: 'А если у меня фото графика из рабочего чата?', a: 'Пришлите его в импорт — Shifter разберёт снимок и расставит смены по дням сам.' },
            { q: 'Смогу забрать свои данные?', a: 'В один клик: полный экспорт в ZIP (JSON + CSV) и календарная подписка для Google/Apple Calendar.' },
            { q: 'Как биржа передаёт мои контакты?', a: 'Только по вашему «Я выйду»: в отклик кладётся ровно то, что вы вписали в этот момент. Профиль остаётся закрытым.' },
            { q: 'У меня несколько работ с разными ставками', a: 'Каждая смена-шаблон несёт свою ставку, переработки и правила места. Календарь смешивает их корректно, статистика раскладывает по местам.' },
            { q: 'Переработки и ночные считаются?', a: 'Порог недельных часов и множитель настраиваются у места работы; фактические часы смен учитываются в оплате.' },
            { q: 'Это работает на телефоне?', a: 'Веб отлично живёт на телефоне уже сейчас (можно «Добавить на экран»), а родное приложение для iOS и Android — в разработке.' },
          ].map((item) => (
            <details key={item.q} className="card mb-2 !p-0">
              <summary className="cursor-pointer list-none px-4 py-3 text-[0.95rem] font-bold marker:hidden">
                {item.q}
              </summary>
              <p className="px-4 pb-3 text-[0.9rem] text-muted">{item.a}</p>
            </details>
          ))}
        </section>

        {/* ==== Final CTA ==== */}
        <section className="reveal mb-16 rounded-[calc(var(--radius)*1.6)] bg-(--accent) p-8 text-center text-white md:p-12">
          <h2 className="mx-auto max-w-xl text-balance text-[1.7rem] font-extrabold leading-tight">
            Первая смена в календаре — через минуту
          </h2>
          <p className="mx-auto mt-2 max-w-md text-white/85">
            Бесплатно. Без карты. Одна смена-шаблон — и дальше всё считается само.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-(--radius) bg-white px-7 py-3 font-bold text-(--accent) transition-transform hover:scale-[1.03]"
          >
            Создать аккаунт
          </Link>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-[0.8rem] text-muted">
        <p className="mb-2 flex flex-wrap items-center justify-center gap-4">
          <Link href="/login" className="font-semibold text-(--accent)">Войти</Link>
          <Link href="/whats-new" className="font-semibold text-(--accent)">Что нового</Link>
          <Link href="/roadmap" className="font-semibold text-(--accent)">Дорожная карта</Link>
          <a href="#top" className="font-semibold text-(--accent)">Наверх ↑</a>
        </p>
        <span className="font-bold text-ink">Shifter</span> · смены, деньги и команда — под контролем · www.shifter.ink
      </footer>
    </div>
  );
}

/**
 * Store badges in the native dark style. Honest ones: the apps are being
 * built, so the badge says "скоро" instead of pretending to link anywhere.
 */
function StoreBadge({ kind }: { kind: 'apple' | 'play' }) {
  return (
    <span
      className="inline-flex h-12 min-w-40 cursor-default select-none items-center gap-2.5 rounded-[12px] bg-ink px-4 text-left text-(--bg) opacity-90"
      title="В разработке"
    >
      {kind === 'apple' ? (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
          <path d="M17.05 12.54c-.03-2.89 2.36-4.27 2.47-4.34-1.35-1.97-3.44-2.24-4.18-2.27-1.78-.18-3.47 1.05-4.37 1.05-.9 0-2.29-1.02-3.77-1-1.94.03-3.72 1.13-4.72 2.86-2.01 3.49-.51 8.66 1.45 11.49.96 1.39 2.1 2.94 3.6 2.88 1.45-.06 1.99-.93 3.74-.93s2.24.93 3.77.9c1.56-.03 2.54-1.41 3.49-2.8 1.1-1.61 1.55-3.17 1.58-3.25-.04-.02-3.03-1.16-3.06-4.59zM14.16 4.06c.8-.97 1.34-2.32 1.19-3.66-1.15.05-2.55.77-3.38 1.74-.74.85-1.39 2.22-1.22 3.53 1.29.1 2.6-.65 3.41-1.61z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
          <path d="M3.6 1.8c-.36.38-.57.96-.57 1.72v17c0 .76.21 1.34.57 1.71l.09.08 9.53-9.52v-.22L3.69 1.72l-.09.08z" />
          <path d="M16.4 15.96l-3.18-3.18v-.22l3.18-3.18.07.04 3.77 2.14c1.08.61 1.08 1.61 0 2.22l-3.77 2.14-.07.04z" opacity=".8" />
          <path d="M16.47 15.92L13.22 12.67 3.6 22.3c.36.37 .94.42 1.6.05l11.27-6.43z" opacity=".6" />
          <path d="M16.47 8.42L5.2 1.99c-.66-.37-1.24-.32-1.6.05l9.62 9.63 3.25-3.25z" opacity=".7" />
        </svg>
      )}
      <span className="leading-tight">
        <span className="block text-[0.62rem] uppercase tracking-wide opacity-75">Скоро в</span>
        <span className="block text-[0.98rem] font-bold">{kind === 'apple' ? 'App Store' : 'Google Play'}</span>
      </span>
    </span>
  );
}
