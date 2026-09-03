'use client';

import { useEffect, useMemo, useState } from 'react';

import { Rota } from '@/lib/api/team';
import { shiftDays, todayKey } from '@/lib/calendar/calendar-date';
import { onShiftNow, spell } from '@/lib/calendar/on-shift';
import { useI18n } from '@/lib/i18n';

/**
 * Who is on the floor at this moment.
 *
 * The simplest question a crew asks, and the one currently answered by a group
 * chat: somebody types "кто сегодня?", three people answer and two of them are
 * wrong. The rota has known all along; it is only that nobody has read it at
 * the one moment it matters.
 *
 * Nothing is entered. It lives entirely off the published rota, which is what
 * makes it true — a board somebody has to keep up to date is a board that goes
 * stale in a fortnight.
 */
export function OnShiftNow({ rota }: { rota: Rota | null }) {
  const { t } = useI18n();

  // The clock, ticking, because "on now" stops being true while you look at
  // it. A minute is close enough — a second hand on a rota is a fidget.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const handle = setInterval(() => setNow(new Date()), 60_000);

    return () => clearInterval(handle);
  }, []);

  const today = todayKey();
  const minutes = now.getHours() * 60 + now.getMinutes();

  const state = useMemo(() => {
    if (rota === null) return null;

    // Yesterday too: a close that began at four is still a close at one in the
    // morning, and that is exactly the hour somebody asks.
    const yesterday = shiftDays(today, -1);
    const relevant = rota.entries.filter(
      (entry) => entry.date === today || entry.date === yesterday,
    );

    return onShiftNow(relevant, today, minutes);
  }, [rota, today, minutes]);

  if (state === null || rota === null) return null;

  const name = (memberId: number) =>
    rota.members.find((member) => member.member_id === memberId)?.display_name ?? '—';

  const colour = (memberId: number) =>
    rota.members.find((member) => member.member_id === memberId)?.colour ?? 'var(--muted)';

  const said = (count: number) => {
    const { hours, minutes: rest } = spell(count);

    return hours > 0 ? `${hours} ${t('h')} ${rest} ${t('min')}` : `${rest} ${t('min')}`;
  };

  return (
    <section className="card reveal p-4">
      <h2 className="mb-2 text-[0.98rem] font-bold">{t('On the floor now')}</h2>

      {state.on.length === 0 ? (
        <p className="field-hint">
          {state.soon.length === 0
            ? t('Nobody is on, and nobody is due today.')
            : `${t('Nobody yet. First in')} ${said(state.soon[0].minutes)}.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {state.on.map((row) => (
            <li key={row.entry.day_shift_id} className="flex items-center gap-2 text-[0.9rem]">
              <span
                className="h-2.5 w-2.5 flex-none rounded-full"
                style={{ background: colour(row.entry.member_id) }}
              />
              <strong className="min-w-0 truncate" title={name(row.entry.member_id)}>{name(row.entry.member_id)}</strong>
              <span className="field-hint truncate">
                {row.entry.shift_name} · {row.entry.start_time}–{row.entry.end_time}
              </span>
              <span className="field-hint ml-auto flex-none tabular">
                {t('on for')} {said(row.minutes)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {state.soon.length > 0 && state.on.length > 0 && (
        <p className="field-hint mt-2">
          {t('Next in')} {said(state.soon[0].minutes)}: {name(state.soon[0].entry.member_id)}
          {state.soon.length > 1 && ` (+${state.soon.length - 1})`}
        </p>
      )}
    </section>
  );
}
