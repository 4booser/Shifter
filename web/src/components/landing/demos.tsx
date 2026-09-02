'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { GIG_CATEGORIES } from '@/lib/api/gigs';
import { whatIfProject } from '@/lib/calendar/whatif';
import { pluralWord } from '@/lib/i18n/plural';

const UAH = (value: number) => `₴${Math.round(value).toLocaleString('ru')}`;

/** Deterministic-enough randomness for demo data; reroll gives a new world. */
const roll = (seed: number) => {
  let state = seed;

  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;

    return state / 0x7fffffff;
  };
};

/**
 * The hero's toy: a shift that actually runs. Money grows by the wall
 * clock at a believable bar rate — the exact feeling the product sells,
 * playable before sign-up.
 */
export function LiveShiftDemo() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState<{ seconds: number; earned: number } | null>(null);
  const rate = 260;

  // The visitor should not have to press anything to feel the product:
  // the shift starts itself a beat after the page settles.
  useEffect(() => {
    const timer = setTimeout(() => {
      setStartedAt((current) => (current === null && done === null ? Date.now() : current));
      setNow(Date.now());
    }, 900);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (startedAt === null) return;

    const timer = setInterval(() => setNow(Date.now()), 100);

    return () => clearInterval(timer);
  }, [startedAt]);

  const seconds = startedAt === null ? 0 : Math.floor((now - startedAt) / 1000);
  // Demo time runs ×60: a minute of your visit is an hour behind the bar.
  const demoSeconds = seconds * 60;
  const earned = (demoSeconds / 3600) * rate;
  const pad = (value: number) => `${value}`.padStart(2, '0');

  return (
    <div className="card mx-auto w-full max-w-sm !p-5 text-left text-ink shadow-(--shadow-lg)">
      <p className="mb-1 flex items-center gap-2 text-[0.8rem] font-semibold text-muted">
        <span className={`h-2 w-2 rounded-full ${startedAt !== null ? 'animate-pulse bg-good' : 'bg-faint'}`} />
        {startedAt !== null ? 'Смена идёт · демо-время ×60' : done !== null ? 'Смена закрыта' : 'Попробуйте прямо тут'}
      </p>
      <p className="text-[2.6rem] font-extrabold leading-none tabular tracking-tight">
        {pad(Math.floor(demoSeconds / 3600))}:{pad(Math.floor((demoSeconds % 3600) / 60))}
        <span className="text-[1.4rem] text-faint">:{pad(demoSeconds % 60)}</span>
      </p>
      <p className="mt-1 text-[1.05rem] font-bold text-good tabular">
        {UAH(done?.earned ?? earned)} <span className="text-[0.8rem] font-semibold text-muted">уже ваши · {UAH(rate)}/ч</span>
      </p>
      {startedAt === null ? (
        <button
          type="button"
          className="btn btn-primary mt-3 w-full"
          onClick={() => {
            setDone(null);
            setNow(Date.now());
            setStartedAt(Date.now());
          }}
        >
          {done === null ? '▶ Начать смену' : '▶ Ещё одну'}
        </button>
      ) : (
        <button
          type="button"
          className="btn mt-3 w-full"
          onClick={() => {
            setDone({ seconds: demoSeconds, earned });
            setStartedAt(null);
          }}
        >
          ✓ Закончил — записать в день
        </button>
      )}
      {done !== null && (
        <p className="field-hint mt-2">
          В настоящем Shifter эти {UAH(done.earned)} и фактические часы уже лежали бы в календаре.
        </p>
      )}
    </div>
  );
}

/**
 * A month you build the way the app is built: pick a shift preset, paint
 * days with it. Presets are the product's real trick — a shift is described
 * once and then it is one tap per day — so the toy teaches the loop.
 */
const PRESETS = [
  { id: 0, emoji: '🍸', name: 'Бар', pay: 1350, colour: '#4f46e5' },
  { id: 1, emoji: '☕', name: 'Кофейня', pay: 950, colour: '#0d9488' },
  { id: 2, emoji: '🛵', name: 'Доставка', pay: 1600, colour: '#d97706' },
] as const;

export function CalendarDemo() {
  const [seed, setSeed] = useState(7);
  const [brush, setBrush] = useState(0);
  const [overrides, setOverrides] = useState<Map<number, number | null>>(new Map());

  const base = useMemo(() => {
    const random = roll(seed);
    const days = new Map<number, number | null>();

    for (let day = 1; day <= 31; day++) {
      const dice = random();

      days.set(day, dice < 0.32 ? 0 : dice < 0.42 ? 1 : dice < 0.5 ? 2 : null);
    }

    return days;
  }, [seed]);

  const shiftOf = (day: number) => (overrides.has(day) ? overrides.get(day)! : base.get(day) ?? null);
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  const worked = days.filter((day) => shiftOf(day) !== null);
  const total = worked.reduce((sum, day) => sum + PRESETS[shiftOf(day)!].pay, 0);

  return (
    <div className="card reveal flex h-full flex-col !p-4">
      <header className="mb-2 flex items-baseline justify-between">
        <b className="text-[0.95rem]">Смена описывается один раз</b>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          title="Другой случайный месяц"
          onClick={() => {
            setOverrides(new Map());
            setSeed((value) => value + 1);
          }}
        >
          🎲
        </button>
      </header>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="chip !py-1 transition-all"
            style={
              brush === preset.id
                ? { borderColor: preset.colour, background: `${preset.colour}1a`, color: preset.colour, fontWeight: 700 }
                : undefined
            }
            onClick={() => setBrush(preset.id)}
          >
            {preset.emoji} {preset.name} · {UAH(preset.pay)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const shift = shiftOf(day);

          return (
            <button
              key={day}
              type="button"
              className="grid aspect-square place-items-center rounded-[8px] text-[0.7rem] font-semibold tabular transition-all hover:scale-[1.08]"
              style={
                shift !== null
                  ? { background: PRESETS[shift].colour, color: '#fff' }
                  : { background: 'var(--surface-2)', color: 'var(--faint)' }
              }
              title={shift !== null ? `${PRESETS[shift].name} · ${UAH(PRESETS[shift].pay)}` : 'Поставить смену'}
              onClick={() =>
                setOverrides((current) => {
                  const next = new Map(current);

                  next.set(day, shift === brush ? null : brush);

                  return next;
                })
              }
            >
              {shift !== null ? PRESETS[shift].emoji : day}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[0.92rem]">
        <b className="text-[1.15rem] tabular">{UAH(total)}</b>{' '}
        <span className="text-muted">
          · {worked.length} {pluralWord('ru', 'shifts', worked.length)} · {worked.length * 8}{' '}
          {pluralWord('ru', 'hours', worked.length * 8)}
        </span>
      </p>
      <p className="field-hint mt-auto pt-1">Выберите пресет и накидайте смен по дням — как в настоящем календаре.</p>
    </div>
  );
}

/** The what-if card, verbatim product maths behind a landing toy. */
export function WhatIfDemo() {
  const [shiftsPerWeek, setShiftsPerWeek] = useState(3);
  const [perShift, setPerShift] = useState(1400);
  const target = 40_000;
  const result = whatIfProject(perShift, shiftsPerWeek, target, 0);

  return (
    <div className="card reveal flex h-full flex-col gap-3 !p-4">
      <b className="text-[0.95rem]">«А если брать больше смен?»</b>
      <label className="block">
        <span className="field-hint flex justify-between">
          <span>Смен в неделю</span>
          <b className="tabular text-ink">{shiftsPerWeek}</b>
        </span>
        <input
          type="range"
          min={1}
          max={7}
          step={0.5}
          className="w-full"
          value={shiftsPerWeek}
          onChange={(event) => setShiftsPerWeek(Number(event.target.value))}
        />
      </label>
      <label className="block">
        <span className="field-hint flex justify-between">
          <span>Смена приносит</span>
          <b className="tabular text-ink">{UAH(perShift)}</b>
        </span>
        <input
          type="range"
          min={400}
          max={3600}
          step={100}
          className="w-full"
          value={perShift}
          onChange={(event) => setPerShift(Number(event.target.value))}
        />
      </label>
      <div className="rounded-(--radius) bg-surface-2/70 p-3 text-center">
        <p className="text-[1.5rem] font-extrabold tabular leading-tight">
          {UAH(result.monthly)}
          <span className="text-[0.8rem] font-semibold text-muted"> / месяц</span>
        </p>
        {result.extraShifts !== null && (
          <p className="field-hint">
            {UAH(target)} — это ещё {result.extraShifts} {pluralWord('ru', 'shifts', result.extraShifts)}
          </p>
        )}
      </div>
      <p className="field-hint mt-auto">Та же математика, что и в приложении, — до копейки.</p>
    </div>
  );
}

const DEMO_GIGS = [
  { category: 'bartender', title: 'Бармен на закрытие', venue: 'Bar Dym', pay: '₴250/ч', slot: 'сб · 20:00–04:00' },
  { category: 'barista', title: 'Бариста на утро', venue: 'Кофейня Свит', pay: '₴200/ч', slot: 'пт · 08:00–14:00' },
  { category: 'grill', title: 'Мангальщик', venue: 'Двор на Подоле', pay: '₴1 800/смена', slot: 'сб · 16:00–23:00' },
] as const;

/** Three gig cards you can actually answer. Nothing is sent anywhere. */
export function GigsDemo() {
  const [sent, setSent] = useState<Set<number>>(new Set());

  return (
    <div className="card reveal flex h-full flex-col gap-2 !p-4">
      <b className="text-[0.95rem]">Биржа: «Я выйду» в один тап</b>
      {DEMO_GIGS.map((gig, index) => {
        const trade = GIG_CATEGORIES.find((entry) => entry.id === gig.category);
        const isSent = sent.has(index);

        return (
          <div key={gig.title} className="flex items-center gap-2.5 rounded-(--radius) border border-border bg-surface p-2.5">
            <span className="text-[1.3rem]">{trade?.emoji}</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[0.88rem] leading-tight">{gig.title}</b>
              <span className="field-hint block truncate">{gig.venue} · {gig.slot}</span>
            </span>
            <b className="whitespace-nowrap text-[0.85rem] tabular text-(--accent-read)">{gig.pay}</b>
            <button
              type="button"
              className={`btn btn-sm whitespace-nowrap ${isSent ? '!border-good !text-good' : 'btn-primary'}`}
              onClick={() =>
                setSent((current) => {
                  const next = new Set(current);

                  if (isSent) next.delete(index);
                  else next.add(index);

                  return next;
                })
              }
            >
              {isSent ? '✓ Отправлено' : 'Я выйду'}
            </button>
          </div>
        );
      })}
      <p className="field-hint mt-auto">Работодатель получает ваши контакты только после этого тапа.</p>
    </div>
  );
}


const STRETCH_DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/**
 * A week whose shifts you stretch. Drag a bar's edge (or just drag on the
 * bar) and the hours follow, the money follows the hours — the exact
 * feeling of pulling a shift's actual clock in the day panel.
 */
export function StretchWeekDemo() {
  const rate = 240;
  const [hours, setHours] = useState<number[]>([8, 0, 6, 8, 10, 12, 0]);
  const drag = useRef<{ day: number; startY: number; startHours: number } | null>(null);

  const total = hours.reduce((sum, value) => sum + value, 0);
  const MAX = 14;

  const onMove = (clientY: number) => {
    if (drag.current === null) return;

    const delta = (drag.current.startY - clientY) / 12;
    const next = Math.round(Math.min(MAX, Math.max(0, drag.current.startHours + delta)) * 2) / 2;

    setHours((current) => current.map((value, index) => (index === drag.current!.day ? next : value)));
  };

  return (
    <div
      className="card reveal flex h-full flex-col !p-4"
      onPointerMove={(event) => onMove(event.clientY)}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      <b className="mb-1 text-[0.95rem]">Неделя, которую тянут</b>
      <p className="field-hint mb-2">Потяните столбик вверх или вниз — часы и деньги идут за рукой.</p>
      <div className="flex flex-1 items-end justify-between gap-1.5 pt-2" style={{ minHeight: '9rem' }}>
        {hours.map((value, day) => (
          <div key={day} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[0.68rem] font-bold tabular text-muted">{value > 0 ? `${value}ч` : '·'}</span>
            <div
              className="w-full cursor-ns-resize touch-none rounded-t-[8px] transition-[height] duration-75"
              style={{
                height: `${Math.max(6, (value / MAX) * 120)}px`,
                background: value > 0 ? 'var(--accent)' : 'var(--surface-2)',
                opacity: value > 0 ? 0.55 + (value / MAX) * 0.45 : 1,
              }}
              onPointerDown={(event) => {
                (event.target as HTMLElement).setPointerCapture(event.pointerId);
                drag.current = { day, startY: event.clientY, startHours: hours[day] };
              }}
            />
            <span className="text-[0.7rem] font-semibold uppercase text-faint">{STRETCH_DAYS[day]}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.92rem]">
        <b className="text-[1.15rem] tabular">{UAH(total * rate)}</b>{' '}
        <span className="text-muted">· {total} {pluralWord('ru', 'hours', total)} · {UAH(rate)}/ч</span>
      </p>
      <p className="field-hint mt-auto pt-1">В приложении так же тянутся фактические часы смены.</p>
    </div>
  );
}
