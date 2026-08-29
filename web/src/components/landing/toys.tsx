'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const UAH = (value: number) => `₴${Math.round(value).toLocaleString('ru')}`;

/**
 * The bank tab's forecast, as a toy: a balance line that has already
 * happened, then the dashed guess of where it goes — with rent day marked.
 * The dashes are the point: the app draws what it knows solid and what it
 * guesses dashed, and the toy teaches that distinction in one glance.
 */
export function BankForecastDemo() {
  const [salaryDay, setSalaryDay] = useState(10);
  const [rent, setRent] = useState(9000);

  const { past, future, rentAt, thinnest, crosses } = useMemo(() => {
    // Fourteen days behind us, sixteen ahead. The past wiggles like real
    // spending; the future is usual-per-day spending, minus rent on its day,
    // plus payday on its.
    const start = 12400;
    const wobble = [0, -420, -180, -640, -90, -380, -720, -150, -410, -260, -580, -120, -350, -290];
    const pastPoints: number[] = [];
    let level = start;

    for (const w of wobble) {
      level += w;
      pastPoints.push(level);
    }

    const usual = 340;
    const futurePoints: number[] = [level];
    let f = level;
    let thin = level;
    let thinAt = 0;

    for (let day = 1; day <= 16; day += 1) {
      f -= usual;

      if (day === 4) f -= rent;
      if (day === salaryDay) f += 14800;

      futurePoints.push(f);

      if (f < thin) {
        thin = f;
        thinAt = day;
      }
    }

    return {
      past: pastPoints,
      future: futurePoints,
      rentAt: 4,
      thinnest: { value: thin, at: thinAt },
      crosses: thin < 0,
    };
  }, [salaryDay, rent]);

  const all = [...past, ...future.slice(1)];
  const min = Math.min(...all, 0);
  const max = Math.max(...all);
  const W = 560;
  const H = 150;
  const x = (i: number) => (i / (all.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * (H - 16) - 8;

  const pastPath = past.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const futurePath = future
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(past.length - 1 + i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');

  return (
    <div className="card !p-5 text-left">
      <p className="mb-1 text-[0.8rem] font-bold uppercase tracking-wider text-faint">Вкладка «Банк» · демо</p>
      <h3 className="mb-1 text-[1.05rem] font-bold">До следующих денег</h3>
      <p className="mb-3 text-[0.85rem] text-muted">
        Сплошная линия уже случилась. Пунктир — прогноз, и он нарисован как прогноз.
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="График остатка: прошлое сплошной линией, прогноз пунктиром">
        {/* the zero line only matters when threatened */}
        {crosses && (
          <line x1="0" y1={y(0)} x2={W} y2={y(0)} stroke="var(--danger)" strokeOpacity="0.5" strokeDasharray="2 4" />
        )}
        <path d={pastPath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        <path d={futurePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" opacity="0.75" />
        {/* rent: a warning dot; payday: a good one */}
        <circle cx={x(past.length - 1 + rentAt)} cy={y(future[rentAt])} r="4.5" fill="var(--warn)" />
        <circle cx={x(past.length - 1 + salaryDay)} cy={y(future[salaryDay])} r="4.5" fill="var(--good)" />
        <circle cx={x(past.length - 1)} cy={y(past[past.length - 1])} r="4" fill="var(--accent)" />
      </svg>

      <p className={`mt-2 text-[0.9rem] font-semibold tabular ${crosses ? 'text-danger' : ''}`}>
        {crosses
          ? `Так не дотянуть: минимум ${UAH(thinnest.value)} — подвиньте зарплату ближе`
          : `Самое тонкое место — ${UAH(thinnest.value)}, дотягиваете`}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[0.8rem] font-semibold text-muted">
          Зарплата через {salaryDay} дн.
          <input
            type="range"
            min={2}
            max={16}
            value={salaryDay}
            className="mt-1 w-full accent-(--accent)"
            onChange={(event) => setSalaryDay(Number(event.target.value))}
          />
        </label>
        <label className="text-[0.8rem] font-semibold text-muted">
          Аренда {UAH(rent)}
          <input
            type="range"
            min={4000}
            max={13000}
            step={500}
            value={rent}
            className="mt-1 w-full accent-(--accent)"
            onChange={(event) => setRent(Number(event.target.value))}
          />
        </label>
      </div>

      <p className="field-hint mt-2">
        В настоящей вкладке всё это — из выписки monobank. Токен не покидает ваш браузер: серверу он не отправляется вовсе.
      </p>
    </div>
  );
}

/**
 * The papers desk, as a receipt that prints itself line by line. Thermal
 * tickets are the trade's own vernacular — every bar closes the night over
 * one — so the income statement gets to look like the thing it summarises.
 */
export function ReceiptDemo() {
  const LINES = [
    ['SHIFTER · СПРАВКА О ДОХОДЕ', ''],
    ['составлено по записям владельца', ''],
    ['--------------------------------', ''],
    ['июнь · 14 смен · 118 ч', '21 360'],
    ['июль · 16 смен · 134 ч', '24 180'],
    ['август · 15 смен · 126 ч', '23 940'],
    ['--------------------------------', ''],
    ['ИТОГО НАЧИСЛЕНО', '69 480'],
    ['из них чаевые', '11 220'],
    ['поступило на счёт', '58 260'],
    ['--------------------------------', ''],
    ['PDF · CSV бухгалтеру · весь zip', ''],
  ] as const;

  const [printed, setPrinted] = useState(0);
  const [run, setRun] = useState(0);
  const host = useRef<HTMLDivElement>(null);

  // Prints when it scrolls into view, one line at a time — and can be
  // reprinted, because a receipt that only prints once is a screenshot.
  useEffect(() => {
    const node = host.current;

    if (node === null) return;

    const seen = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setRun((r) => (r === 0 ? 1 : r));
        seen.disconnect();
      }
    }, { threshold: 0.4 });

    seen.observe(node);

    return () => seen.disconnect();
  }, []);

  useEffect(() => {
    if (run === 0) return;

    setPrinted(0);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setPrinted(LINES.length);

      return;
    }

    const timer = setInterval(
      () => setPrinted((count) => (count >= LINES.length ? count : count + 1)),
      170,
    );

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return (
    <div ref={host} className="card !p-5 text-left">
      <p className="mb-1 text-[0.8rem] font-bold uppercase tracking-wider text-faint">Бумаги · демо</p>
      <h3 className="mb-1 text-[1.05rem] font-bold">Справка печатается из ваших смен</h3>
      <p className="mb-3 text-[0.85rem] text-muted">
        PDF для банка, CSV для бухгалтера, zip со всем аккаунтом — из тех же записей, что и календарь.
      </p>

      <div className="mx-auto max-w-xs rounded-[4px] border border-border bg-surface px-4 pb-5 pt-4 font-mono text-[0.74rem] leading-relaxed shadow-(--shadow-lg) [mask-image:linear-gradient(black_calc(100%-8px),transparent)]">
        {LINES.slice(0, printed).map(([left, right], index) => (
          <p key={index} className="flex justify-between gap-3 whitespace-nowrap">
            <span className={index === 0 ? 'font-bold' : index === 1 ? 'text-muted' : ''}>{left}</span>
            {right !== '' && <span className="font-bold tabular">{right}</span>}
          </p>
        ))}
        {printed < LINES.length && <p className="animate-pulse text-faint">▌</p>}
      </div>

      <button
        type="button"
        className="btn btn-quiet btn-sm mt-3"
        onClick={() => setRun((r) => r + 1)}
      >
        ⎙ Напечатать ещё раз
      </button>

      <p className="field-hint mt-2">
        Первая строка настоящей справки — честная: «составлено по записям владельца». Бумага, которая делает вид, что это не так, стоит меньше.
      </p>
    </div>
  );
}
