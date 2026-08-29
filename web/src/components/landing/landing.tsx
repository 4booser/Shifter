'use client';

import Link from 'next/link';

import { useEffect, useRef, useState } from 'react';

import { GIG_CATEGORIES } from '@/lib/api/gigs';
import { useReveal } from '@/lib/fx';
import { Icon } from '@/components/ui/icon';
import { CalendarDemo, GigsDemo, LiveShiftDemo, StretchWeekDemo, WhatIfDemo } from '@/components/landing/demos';
import { BankForecastDemo, ReceiptDemo } from '@/components/landing/toys';

/**
 * The public face, staged as the thing the product is about: one shift.
 *
 * The page runs like a working night — dusk at the top (the hero commits to
 * dark whatever the theme, because shifts start when the light goes), then
 * the counting hours, then the morning the money lands, then the month, the
 * crew, the papers and the year. Every claim below the fold wears the app's
 * own tokens: the landing is still the first screenshot.
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

/**
 * The night sky of the hero: a fixed dark palette, deliberately NOT the
 * theme tokens — the hero is a scene, not a surface, and it must hold
 * whatever theme the rest of the page wears. Colours echo the app's own
 * night theme so the scene still smells like the product.
 */
const NIGHT = {
  bg: 'radial-gradient(120% 90% at 70% -10%, #232043 0%, #14121f 48%, #0d0c14 100%)',
  ink: '#f0eff7',
  muted: '#a7a5b8',
  faint: '#67657a',
  accent: '#8b8ef7',
  good: '#4fc98d',
  line: 'rgb(240 239 247 / 12%)',
} as const;

/** One chapter stamp: the hour badge that carries the shift-story spine. */
function Hour({ time, children }: { time: string; children: React.ReactNode }) {
  return (
    <div className="reveal mb-5 flex items-center gap-3">
      <span className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-[0.82rem] font-bold tabular text-(--accent)">
        {time}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
      <h2 className="text-right text-[1.5rem] font-extrabold tracking-tight md:text-[1.8rem]">{children}</h2>
    </div>
  );
}

/** Drifting dust in the hero — cheap ambience, killed for reduced motion. */
function NightDust() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;

    if (node === null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const context = node.getContext('2d');

    if (context === null) return;

    let width = (node.width = node.offsetWidth);
    let height = (node.height = node.offsetHeight);

    const motes = Array.from({ length: 42 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.6 + Math.random() * 1.6,
      vx: -0.08 + Math.random() * 0.16,
      vy: -0.28 - Math.random() * 0.3,
      a: 0.12 + Math.random() * 0.4,
    }));

    let frame = 0;

    const draw = () => {
      context.clearRect(0, 0, width, height);

      for (const mote of motes) {
        mote.x += mote.vx;
        mote.y += mote.vy;

        if (mote.y < -4) {
          mote.y = height + 4;
          mote.x = Math.random() * width;
        }

        context.beginPath();
        context.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2);
        context.fillStyle = `rgb(139 142 247 / ${mote.a})`;
        context.fill();
      }

      frame = requestAnimationFrame(draw);
    };

    const resize = () => {
      width = node.width = node.offsetWidth;
      height = node.height = node.offsetHeight;
    };

    window.addEventListener('resize', resize);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}

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

      {/* ==== 16:00 · The night scene ==== */}
      <section
        className="relative overflow-hidden"
        style={{ background: NIGHT.bg, color: NIGHT.ink }}
      >
        <NightDust />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 md:pt-24">
          <p
            className="reveal mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[0.78rem] font-bold tabular"
            style={{ borderColor: NIGHT.line, color: NIGHT.muted }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: NIGHT.good }} />
            16:00 · смена начинается
          </p>

          <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
            <div>
              <h1 className="reveal max-w-2xl text-balance text-[clamp(2.4rem,6.5vw,4.3rem)] font-extrabold leading-[1.02] tracking-[-0.02em]">
                Вы работаете смену.
                <br />
                <span style={{ color: NIGHT.accent }}>Он считает деньги.</span>
              </h1>
              <p className="reveal mt-5 max-w-xl text-balance text-[1.08rem]" style={{ color: NIGHT.muted }}>
                Shifter — календарь для тех, кто живёт сменами: бар, кухня, зал, доставка.
                Часы, ставки, чаевые, ночные и переработки считаются сами, пока вы работаете.
                А потом он сверяет, что вам заплатили столько, сколько должны.
              </p>

              <div className="reveal mt-8 flex flex-wrap items-center gap-3">
                <Link href="/login" className="btn btn-primary !px-6 !py-3 !text-[1rem]">
                  Открыть в браузере — бесплатно
                </Link>
                <a href="#shift" className="btn !border-0 !px-5 !py-3 !text-[0.95rem]" style={{ background: 'rgb(240 239 247 / 9%)', color: NIGHT.ink }}>
                  Прожить смену за минуту ↓
                </a>
              </div>

              <p className="reveal mt-6 font-mono text-[0.78rem]" style={{ color: NIGHT.faint }}>
                бесплатно · без карты · веб уже работает · iOS и Android в разработке
              </p>
            </div>

            <div className="reveal">
              <LiveShiftDemo />
              <p className="mt-2 text-center font-mono text-[0.72rem]" style={{ color: NIGHT.faint }}>
                это не видео — таймер настоящий, нажмите
              </p>
            </div>
          </div>
        </div>

        {/* the dawn edge: night dissolves into whatever theme the page wears */}
        <div className="h-24 w-full" style={{ background: 'linear-gradient(rgb(13 12 20 / 0%), var(--bg))' }} aria-hidden />
      </section>

      {/* ==== Trades marquee ==== */}
      <section className="reveal -mt-6 mb-14 overflow-hidden border-y border-border bg-surface py-3">
        <div className="landing-marquee flex w-max gap-2 whitespace-nowrap">
          {[...GIG_CATEGORIES, ...GIG_CATEGORIES].map((trade, index) => (
            <span key={`${trade.id}-${index}`} className="chip !border-transparent !bg-transparent text-[0.85rem] text-muted">
              {trade.emoji} {TRADE_RU[trade.id] ?? trade.label}
            </span>
          ))}
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4">
        {/* ==== 19:30 · The counting hours ==== */}
        <section id="shift" className="pb-16">
          <Hour time="19:30">Пока вы в запаре — он считает</Hour>
          <p className="reveal -mt-2 mb-6 max-w-2xl text-muted">
            Одна смена описывается один раз — часы, ставка, процент, ночные. Дальше всё
            в одно касание, а считает сервер: у клиента нет собственной арифметики, поэтому
            телефон, веб и виджет никогда не спорят о цифре.
          </p>

          <div className="grid gap-3 md:grid-cols-6">
            {[
              { icon: 'clock', title: 'Живая смена', text: 'Нажали «начал» — тикают часы и деньги: на экране, на локскрине, в виджете. Можно назначить час — смена стартует сама.', span: 'md:col-span-3' },
              { icon: 'calendar', title: 'Календарь одним касанием', text: 'Шаблоны смен красят дни как кисть. Фото графика из рабочего чата? Импорт разберёт снимок и расставит смены сам.', span: 'md:col-span-3' },
              { icon: 'wallet', title: 'Ночные, переработки, праздники', text: 'Порог недельных часов, множители ночи и праздников — правила вашего заведения, посчитанные без калькулятора.', span: 'md:col-span-2' },
              { icon: 'chart', title: 'Чаевые и продажи', text: 'Налички и безнал отдельно, процент с продаж по позициям, tip-out персоналу — и всё это видно в статистике.', span: 'md:col-span-2' },
              { icon: 'mic', title: 'Голосом с планшета', text: '«Тридцать четыре тысячи выручка, чай две» — диктовка на телефоне разберёт и разложит по полям.', span: 'md:col-span-2' },
            ].map((cell) => (
              <article key={cell.title} className={`card lift reveal p-4 ${cell.span}`}>
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-(--radius) bg-(--accent-soft) text-(--accent)">
                  <Icon name={cell.icon} size={18} />
                </span>
                <h3 className="mb-1 text-[1rem] font-bold">{cell.title}</h3>
                <p className="text-[0.9rem] text-muted">{cell.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ==== 02:00 · Closing the day ==== */}
        <section className="pb-16">
          <Hour time="02:00">Закрыли смену — день уже посчитан</Hour>
          <p className="reveal -mt-2 mb-6 max-w-2xl text-muted">
            Не верьте скриншотам — потрогайте. Это настоящие механики Shifter со случайными
            данными: песочница, кликайте смело.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <CalendarDemo />
            <StretchWeekDemo />
            <WhatIfDemo />
            <GigsDemo />
          </div>
        </section>

        {/* ==== 10:00 · The morning the money lands ==== */}
        <section className="pb-16">
          <Hour time="10:00">Утро, когда приходят деньги</Hour>
          <p className="reveal -mt-2 mb-6 max-w-2xl text-muted">
            Аванс и зарплата по правилам каждого места. Пришло меньше расчёта — Shifter покажет
            разницу и с какого периода она тянется. А вкладка «Банк» видит выписку и говорит,
            дотянете ли вы до следующих денег.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <BankForecastDemo />
            <ReceiptDemo />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[
              { icon: 'wallet', title: 'Сверка выплат', text: 'Каждый период: ожидалось, пришло, разница. Недоплату видно сразу, а не в конце месяца.' },
              { icon: 'shield', title: 'Банк без сервера', text: 'Выписка monobank подтягивается прямо в браузер. Токен не покидает устройство — серверу он не отправляется вовсе.' },
              { icon: 'doc', title: 'Бумаги за минуту', text: 'Справка о доходе PDF, CSV бухгалтеру, полный экспорт аккаунта — из тех же записей, что и календарь.' },
            ].map((cell) => (
              <article key={cell.title} className="card lift reveal p-4">
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-(--radius) bg-(--accent-soft) text-(--accent)">
                  <Icon name={cell.icon} size={18} />
                </span>
                <h3 className="mb-1 text-[1rem] font-bold">{cell.title}</h3>
                <p className="text-[0.9rem] text-muted">{cell.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ==== Понедельник · The crew ==== */}
        <section className="pb-16">
          <Hour time="ПН">Вся смена, не только вы</Hour>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { icon: 'users', title: 'Общий график без чужих денег', text: 'Коллеги видят, кто когда работает. Заработок — только у тех, кто сам включил «делиться». Приватность не настройка, а конструкция.' },
              { icon: 'swap', title: 'Подмены в два тапа', text: '«Нужна подмена» — и предложение уходит команде. Менеджерская доска публикует неделю целиком.' },
              { icon: 'spark', title: 'Биржа подработок', text: '29 ролей общепита, разовые смены и постоянка, фото заведений. «Я выйду» — и работодатель получает ровно те контакты, что вы вписали.' },
            ].map((cell) => (
              <article key={cell.title} className="card lift reveal p-4">
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-(--radius) bg-(--accent-soft) text-(--accent)">
                  <Icon name={cell.icon} size={18} />
                </span>
                <h3 className="mb-1 text-[1rem] font-bold">{cell.title}</h3>
                <p className="text-[0.9rem] text-muted">{cell.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ==== Год · The long game ==== */}
        <section className="pb-16">
          <Hour time="ГОД">Работа складывается в историю</Hour>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: 'chart', title: 'Статистика без таблиц', text: 'Форма недели, лучший час, сезоны и «что-если» с ползунками — сколько добавит ещё одна смена.' },
              { icon: 'trophy', title: 'Твой год', text: 'Годовая история как wrapped: серии, рекорды, места — можно поделиться карточкой без сумм.' },
              { icon: 'doc', title: 'Послужной список', text: 'CV из настоящих смен — то, что можно показать тому, у кого нет причин вам верить. И приватная хроника — только для вас.' },
              { icon: 'sun', title: 'Погода и сезоны', text: 'Дождливые пятницы против солнечных, толстые и тонкие месяцы — и сколько откладывать в жирный, чтобы выровнять тощий.' },
            ].map((cell) => (
              <article key={cell.title} className="card lift reveal p-4">
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-(--radius) bg-(--accent-soft) text-(--accent)">
                  <Icon name={cell.icon} size={18} />
                </span>
                <h3 className="mb-1 text-[0.98rem] font-bold">{cell.title}</h3>
                <p className="text-[0.88rem] text-muted">{cell.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ==== Principles ticket ==== */}
        <section className="reveal mx-auto mb-16 max-w-2xl">
          <div className="card !p-0 shadow-(--shadow-lg)">
            <div className="border-b border-border px-5 py-4">
              <p className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-faint">Правила смены · зашиты в код</p>
              <h2 className="text-[1.3rem] font-extrabold tracking-tight">Почему цифрам можно верить</h2>
            </div>
            <ol className="px-5 py-4 [counter-reset:rule]">
              {[
                ['Считает сервер', 'у приложения нет «своей» арифметики на клиенте, поэтому телефон и веб не спорят о цифре.'],
                ['Оценка не смешивается с фактом', 'прогноз всегда нарисован пунктиром и подписан «обычно». Что случилось — сплошным.'],
                ['Ноль — это ответ', '«ноль чаевых» и «не сказали» — разные вещи, и приложение их не путает.'],
                ['Прошлое не переписывается', 'изменение ставки действует вперёд; август, каким он был, остаётся августом.'],
                ['Приватность по конструкции', 'зарплата не попадает коллегам, банковский токен не попадает серверу, приватная заметка не попадает в CV.'],
                ['Всё можно забрать', 'полный экспорт в один клик: JSON, CSV, zip. Что нельзя унести — тем не владеешь.'],
              ].map(([title, text]) => (
                <li key={title} className="flex gap-3 border-b border-border py-3 last:border-0 [counter-increment:rule]">
                  <span className="font-mono text-[0.85rem] font-bold tabular text-(--accent) before:content-[counter(rule,decimal-leading-zero)]" />
                  <p className="text-[0.92rem]">
                    <b>{title}</b> <span className="text-muted">— {text}</span>
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ==== Numbers ==== */}
        <section className="reveal mb-16 grid grid-cols-2 gap-3 text-center md:grid-cols-4">
          {[
            { value: '1 400+', label: 'автотестов держат каждую цифру' },
            { value: '×1', label: 'касание, чтобы отметить смену' },
            { value: '29', label: 'ролей общепита на бирже' },
            { value: '3', label: 'языка: русский, українська, English' },
          ].map((stat) => (
            <div key={stat.label} className="card !p-4">
              <p className="text-[1.7rem] font-extrabold tabular text-(--accent)">{stat.value}</p>
              <p className="text-[0.82rem] text-muted">{stat.label}</p>
            </div>
          ))}
        </section>

        <p className="reveal -mt-10 mb-16 text-center">
          <Link href="/roadmap" className="text-[0.88rem] font-semibold text-(--accent)">
            Открытая разработка: смотреть прогресс по задачам →
          </Link>
        </p>

        {/* ==== Screens ==== */}
        <section className="grid gap-4 pb-16 md:grid-cols-2">
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
        <section className="reveal mb-16 overflow-hidden rounded-[calc(var(--radius)*1.6)] border border-border bg-surface">
          <div className="grid items-center gap-6 p-6 md:grid-cols-[1fr_auto] md:p-10">
            <div>
              <p className="mb-1 text-[0.78rem] font-bold uppercase tracking-wide text-(--accent)">iOS и Android</p>
              <h2 className="mb-2 text-balance text-[1.6rem] font-extrabold leading-tight">
                Приложение уже в разработке — полный паритет с вебом
              </h2>
              <p className="mb-4 max-w-md text-muted">
                Виджеты на домашний экран, живая смена на локскрине, автозапуск по расписанию,
                диктовка выручки голосом и вход по Face ID.
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
        <section className="reveal mb-16">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[1.4rem] font-extrabold tracking-tight">Что нового</h2>
            <Link href="/whats-new" className="text-[0.85rem] font-semibold text-(--accent)">
              вся история →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: '🏦', date: 'август 2026', title: 'Вкладка «Банк»', text: 'Выписка monobank прямо в браузере, прогноз «до следующих денег», зарплата находит себя в выписке сама.' },
              { icon: '📄', date: 'август 2026', title: 'Бумаги', text: 'Справка о доходе PDF, CSV бухгалтеру, приватная хроника мест и полный zip всего аккаунта.' },
              { icon: '⏰', date: 'август 2026', title: 'Смена стартует сама', text: 'Назначьте час — живая смена начнётся без вас. Или жмите вручную, как раньше.' },
              { icon: '🧹', date: 'август 2026', title: 'Реестр выплат', text: 'Любую выплату можно поправить или убрать, а весь реестр — стереть и заполнить заново.' },
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
        <section className="reveal mx-auto mb-16 max-w-2xl">
          <h2 className="mb-3 text-center text-[1.4rem] font-extrabold tracking-tight">Коротко о важном</h2>
          {[
            { q: 'Это бесплатно?', a: 'Да. Регистрация за минуту, карта не нужна, все функции открыты.' },
            { q: 'Команда увидит мои деньги?', a: 'Нет. В общем графике коллеги видят только кто и когда работает. Заработок виден лишь тем, кто сам включил «делиться».' },
            { q: 'Банк видит мой токен?', a: 'Выписка ходит из вашего браузера прямо в monobank. Токен хранится только на устройстве — серверу Shifter он не отправляется вовсе.' },
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
        <section className="reveal mb-6 rounded-[calc(var(--radius)*1.6)] bg-(--accent) p-8 text-center text-white md:p-12">
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

        {/* ==== Contacts ==== */}
        <section id="contacts" className="reveal mb-16">
          <div
            className="overflow-hidden rounded-[calc(var(--radius)*1.6)] p-6 md:p-10"
            style={{ background: NIGHT.bg, color: NIGHT.ink }}
          >
            <p className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em]" style={{ color: NIGHT.faint }}>
              После смены · связаться
            </p>
            <h2 className="mt-1 text-[1.5rem] font-extrabold tracking-tight">Мы на связи, как бар после закрытия</h2>
            <p className="mt-1 max-w-lg text-[0.92rem]" style={{ color: NIGHT.muted }}>
              Вопрос, баг, идея или «а сделайте для нашей кухни» — пишите любым способом, отвечаем живьём.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {CONTACTS.map((entry) => (
                <ContactCard key={entry.label} entry={entry} />
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-[0.8rem] text-muted">
        <p className="mb-2 flex flex-wrap items-center justify-center gap-4">
          <Link href="/login" className="font-semibold text-(--accent)">Войти</Link>
          <Link href="/whats-new" className="font-semibold text-(--accent)">Что нового</Link>
          <Link href="/roadmap" className="font-semibold text-(--accent)">Дорожная карта</Link>
          <Link href="/status" className="font-semibold text-(--accent)">Статус</Link>
          <a href="#contacts" className="font-semibold text-(--accent)">Контакты</a>
          <a href="#top" className="font-semibold text-(--accent)">Наверх ↑</a>
        </p>
        <span className="font-bold text-ink">Shifter</span> · смены, деньги и команда — под контролем · www.shifter.ink
      </footer>
    </div>
  );
}

/**
 * The contact rows. `value: null` renders an honest «скоро» chip instead of
 * a dead link — the addresses get filled in when they exist, and the section
 * never pretends otherwise.
 */
const CONTACTS: { icon: string; label: string; hint: string; value: string | null; href: string | null }[] = [
  { icon: '✉️', label: 'Почта', hint: 'на длинные вопросы', value: null, href: null },
  { icon: '📨', label: 'Telegram', hint: 'быстрее всего', value: null, href: null },
  { icon: '📸', label: 'Instagram', hint: 'новости и закулисье', value: null, href: null },
];

function ContactCard({ entry }: { entry: (typeof CONTACTS)[number] }) {
  const body = (
    <>
      <span className="text-[1.4rem]" aria-hidden>{entry.icon}</span>
      <span className="min-w-0">
        <span className="block text-[0.95rem] font-bold">{entry.label}</span>
        <span className="block truncate text-[0.8rem]" style={{ color: NIGHT.muted }}>
          {entry.value ?? entry.hint}
        </span>
      </span>
      {entry.value === null && (
        <span
          className="ml-auto rounded-full px-2 py-0.5 font-mono text-[0.68rem] font-bold uppercase"
          style={{ background: 'rgb(240 239 247 / 10%)', color: NIGHT.muted }}
        >
          скоро
        </span>
      )}
    </>
  );

  const className = 'flex items-center gap-3 rounded-(--radius) border p-4 transition-colors';
  const style = { borderColor: NIGHT.line, background: 'rgb(240 239 247 / 4%)' } as React.CSSProperties;

  return entry.href !== null ? (
    <a href={entry.href} className={`${className} hover:bg-white/10`} style={style}>
      {body}
    </a>
  ) : (
    <div className={className} style={style}>
      {body}
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
