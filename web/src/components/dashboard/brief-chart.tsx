'use client';

import { useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api/http';
import { todayKey } from '@/lib/calendar/calendar-date';
import { useCalendar } from '@/lib/store/calendar';
import { useMoney } from '@/lib/settings/money';
import { useI18n } from '@/lib/i18n';
import { ChartTip, CrossHair, useChartHover } from '@/components/charts/hover';
import { Money } from '@/components/ui/bits';

/**
 * The brief's numbers, drawn: the month as a climbing line.
 *
 * Everything here is what the assistant already said in words one card up —
 * заработано столько-то, таким темпом выйдет столько-то, лучший день был
 * такой-то. The solid line is the fact (the same days the brief reads); the
 * dashed tail is the brief's own projectedMonth, drawn as a projection
 * because that is what it is. Hover answers with the day and the figure.
 */
interface BriefFacts {
  monthEarned: number;
  projectedMonth: number | null;
  bestDayAmount: number | null;
  bestDayDate: string | null;
  daysToPayday: number | null;
  goal: number | null;
}

export function BriefChart() {
  const { t, lang } = useI18n();
  const { format } = useMoney();

  const days = useCalendar((state) => state.days);
  const month = useCalendar((state) => state.month);

  const [facts, setFacts] = useState<BriefFacts | null>(null);

  useEffect(() => {
    void api<BriefFacts>(`/shifter/v1/brief/facts?date=${todayKey()}`)
      .then(setFacts)
      .catch(() => setFacts(null));
  }, []);

  const { ref, hover, onMove, onLeave } = useChartHover<{
    day: string;
    value: number;
    projected: boolean;
  }>();

  const line = useMemo(() => {
    const today = todayKey();
    const monthKey = today.slice(0, 7);

    if (`${month.year}-${String(month.month).padStart(2, '0')}` !== monthKey) return null;

    const daysInMonth = new Date(month.year, month.month, 0).getDate();
    const todayDay = Number(today.slice(8));

    // The fact: cumulative earned per day, read from the same store the
    // calendar draws — which is the same source the brief's figures used.
    let running = 0;
    const fact: { day: string; value: number }[] = [];

    for (let dayNo = 1; dayNo <= todayDay; dayNo += 1) {
      const key = `${monthKey}-${String(dayNo).padStart(2, '0')}`;
      const dayData = days.get(key);

      running += dayData?.earned ?? 0;
      fact.push({ day: key, value: Math.round(running) });
    }

    if (fact.length < 2) return null;

    // The projection: a straight walk from today's total to the brief's own
    // month figure. Not our estimate — the assistant's, drawn as dashes.
    const projected: { day: string; value: number }[] = [];
    const target = facts?.projectedMonth ?? null;

    if (target !== null && target > running && todayDay < daysInMonth) {
      const left = daysInMonth - todayDay;

      for (let ahead = 1; ahead <= left; ahead += 1) {
        const key = `${monthKey}-${String(todayDay + ahead).padStart(2, '0')}`;

        projected.push({
          day: key,
          value: Math.round(running + ((target - running) * ahead) / left),
        });
      }
    }

    return { fact, projected, daysInMonth, todayDay };
  }, [days, month, facts]);

  if (line === null || facts === null) return null;

  const all = [...line.fact, ...line.projected];
  const peak = Math.max(1, facts.goal ?? 0, ...all.map((point) => point.value));
  const W = 720;
  const H = 130;
  const x = (index: number) => (index / Math.max(1, line.daysInMonth - 1)) * W;
  const y = (value: number) => H - (value / peak) * (H - 16) - 6;

  const factPath = line.fact
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(' ');
  const projPath = line.projected.length > 0
    ? `M${x(line.fact.length - 1).toFixed(1)},${y(line.fact.at(-1)!.value).toFixed(1)} ` +
      line.projected
        .map((point, index) => `L${x(line.fact.length + index).toFixed(1)},${y(point.value).toFixed(1)}`)
        .join(' ')
    : null;

  const bestIndex = facts.bestDayDate !== null
    ? line.fact.findIndex((point) => `${point.day.slice(8)}.${point.day.slice(5, 7)}` === facts.bestDayDate)
    : -1;

  const paydayIndex = facts.daysToPayday !== null && facts.daysToPayday >= 0
    ? line.todayDay - 1 + facts.daysToPayday
    : -1;

  return (
    <section className="card reveal p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[0.98rem] font-bold">{t('The month, as the brief sees it')}</h2>
        <span className="field-hint tabular">
          {format(facts.monthEarned)}
          {facts.projectedMonth !== null && (
            <> → ≈{format(facts.projectedMonth)} {t('by month’s end')}</>
          )}
        </span>
      </div>

      <div
        ref={ref}
        className="relative"
        onMouseMove={(event) => {
          const box = ref.current?.getBoundingClientRect();

          if (box === undefined) return;

          onMove(
            event,
            all.map((point, index) => ({
              x: (index / Math.max(1, line.daysInMonth - 1)) * box.width,
              datum: { day: point.day, value: point.value, projected: index >= line.fact.length },
            })),
          );
        }}
        onMouseLeave={onLeave}
      >
        {hover !== null && <CrossHair x={hover.x} />}
        {hover !== null && (
          <ChartTip x={hover.x}>
            <b>
              {new Date(`${hover.datum.day}T12:00:00`).toLocaleDateString(lang, {
                day: 'numeric',
                month: 'short',
              })}
            </b>
            <div className="tabular">
              {hover.datum.projected ? '≈' : ''}
              <Money value={hover.datum.value} />
            </div>
            {hover.datum.projected && (
              <div className="text-[0.7rem] text-muted">{t('the brief’s projection')}</div>
            )}
          </ChartTip>
        )}

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('The month, as the brief sees it')}>
          {facts.goal !== null && facts.goal <= peak && (
            <line
              x1="0"
              y1={y(facts.goal)}
              x2={W}
              y2={y(facts.goal)}
              stroke="var(--good)"
              strokeOpacity="0.5"
              strokeDasharray="2 5"
            />
          )}
          <path d={factPath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
          {projPath !== null && (
            <path d={projPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 6" opacity="0.7" />
          )}
          {bestIndex >= 0 && (
            <circle cx={x(bestIndex)} cy={y(line.fact[bestIndex].value)} r="4.5" fill="var(--good)" />
          )}
          {paydayIndex >= 0 && paydayIndex < line.daysInMonth && (
            <line
              x1={x(paydayIndex)}
              y1={H - 4}
              x2={x(paydayIndex)}
              y2={H - 16}
              stroke="var(--warn)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}
          <circle
            cx={x(line.fact.length - 1)}
            cy={y(line.fact.at(-1)!.value)}
            r="4"
            fill="var(--accent)"
          />
        </svg>
      </div>

      <p className="field-hint mt-1">
        {t('Solid is recorded; dashed is the brief’s own pace figure, drawn as the guess it is.')}
        {bestIndex >= 0 && facts.bestDayAmount !== null && (
          <> {t('The green dot is the best day')} — <Money value={facts.bestDayAmount} />.</>
        )}
        {paydayIndex >= 0 && paydayIndex < line.daysInMonth && (
          <> {t('The amber tick is payday.')}</>
        )}
      </p>
    </section>
  );
}
