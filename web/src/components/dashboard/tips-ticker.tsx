'use client';

import { useMemo } from 'react';

import { useI18n } from '@/lib/i18n';

/**
 * A slow ribbon of things worth knowing, riding between the tiles and the
 * insights. Product tips first — the features people miss for months —
 * shuffled per mount so the ribbon never opens on the same advice twice.
 */
const TIPS = [
  ['⌘K', 'The palette opens with Cmd+K — every page and action is three keystrokes away.'],
  ['📸', 'A photo of the wall schedule imports itself: Import from photo on the calendar.'],
  ['🔁', 'A whole week repeats in one tap: Repeat last week, on the calendar sidebar.'],
  ['🎨', 'Colour schemes paint the month by rule — shifts, weekends, holidays.'],
  ['📆', 'Your shifts can appear in Google or Apple Calendar: Account → Calendar feed.'],
  ['🔐', 'Two-factor sign-in lives in Account — codes from any authenticator app.'],
  ['🤖', 'The Telegram bot answers «сегодня», «неделя» and clocks you in with «начал».'],
  ['👥', 'A crew rota shows who works when — money stays private unless someone shares.'],
  ['✨', 'The gig board takes one-night covers and permanent seats — 36 trades.'],
  ['🙋', 'Looking for work? Post your card under Gigs → People — venues browse it.'],
  ['↩️', 'Cmd+Z undoes up to twenty calendar steps, including bulk paints.'],
  ['🖱️', 'Drag a shift chip between days; hold Alt to copy it instead.'],
  ['⌨️', 'Arrow keys walk the grid, Enter opens a day, digits 1–9 drop the n-th template.'],
  ['⏱️', 'A running shift keeps ticking even if you close the tab — the clock is the wall clock.'],
  ['💸', 'Record what the venue actually paid on Payouts — the difference is shown, not hidden.'],
  ['📊', 'The what-if sliders on Statistics turn «one more shift a week» into money and a date.'],
  ['🏝️', 'The year report at the trophy icon tells your whole year as a story.'],
  ['🎯', 'Set a goal on Statistics and a push congratulates you the day you cross it.'],
  ['🧵', 'Your avatar can be woven from your own last four weeks — Account → Your face here.'],
  ['📤', 'Everything you ever entered exports as ZIP in one click — it is your data.'],
  ['🌙', 'Themes, corner rounding and text size live under the eye icon in the header.'],
  ['📱', 'The iOS and Android app is in the works — full parity with the web.'],
] as const;

export function TipsTicker() {
  const { t } = useI18n();

  // A stable shuffle per mount: rotate by a random offset, cheap and enough.
  const tips = useMemo(() => {
    const offset = Math.floor(Math.random() * TIPS.length);

    return [...TIPS.slice(offset), ...TIPS.slice(0, offset)];
  }, []);

  return (
    <section className="reveal relative overflow-hidden rounded-(--radius) border border-border bg-surface py-2" aria-label={t('Tips')}>
      <div className="landing-marquee flex w-max gap-6 whitespace-nowrap px-4">
        {[...tips, ...tips].map(([icon, text], index) => (
          <span key={index} className="flex items-center gap-2 text-[0.82rem] text-muted">
            <span aria-hidden>{icon}</span>
            {t(text)}
          </span>
        ))}
      </div>
    </section>
  );
}
