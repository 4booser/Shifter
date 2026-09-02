'use client';

import { stagger } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
import { Shell } from '@/components/layout/shell';

export default function WhatsNewPage() {
  return (
    <Shell>
      <WhatsNew />
    </Shell>
  );
}

interface Release {
  date: string;
  icon: string;
  title: string;
  points: string[];
}

/** Newest first; hand-written because a changelog is an editorial act. */
const RELEASES: Release[] = [
  {
    date: '2026-08-30',
    icon: '🌙',
    title: 'The night of locks',
    points: [
      'Five wrong passwords shut the door for a quarter hour — on every door, not just the front one',
      'Two-factor sign-in, password change and «forgot password» now work from the phone',
      'Sign-in errors speak your language and say how long the lock lasts',
      'The reset form sends one letter per ten minutes — nobody can point it at your inbox',
    ],
  },
  {
    date: '2026-08-30',
    icon: '📱',
    title: 'The phone catches up',
    points: [
      'Hide amounts on the phone too: ₴••• everywhere, even in the wage push',
      'Sales get steppers in the day editor; the brief draws its month right under itself',
      'A forgotten running shift knocks on its own and closes at the plan, not at the timer',
      'Close a pay period — paid in full or written off — right from the payouts card',
    ],
  },
  {
    date: '2026-08-30',
    icon: '🟪',
    title: 'A year at a glance',
    points: [
      'A year of weeks as a heat strip on both platforms — an empty cell is not a zero',
      'One payday everywhere: the chart, the brief and the assistant finally agree',
      'Ask «когда придут деньги» — the assistant names the day and the figure',
      'The rain card and the calendar-subscription switch reached the pocket',
    ],
  },
  {
    date: '2026-08-26',
    icon: '🔐',
    title: 'Security and the bot',
    points: [
      'Two-factor sign-in with QR setup and backup codes',
      'A Telegram bot: «сегодня», «завтра», clock in and out from the chat',
      'Every day keeps a history of who wrote to it',
      'Download your whole account as one archive',
    ],
  },
  {
    date: '2026-08-26',
    icon: '📋',
    title: 'The manager’s board',
    points: [
      'Plan people × days, publish a week with one push per person',
      'Accepting places the shift with the person’s own rate',
      'Declines come back red with a replan badge',
      'Invite by link: shifter.ink/join?code=…',
    ],
  },
  {
    date: '2026-08-26',
    icon: '🎨',
    title: 'Statistics redrawn',
    points: [
      'Months as bars that read well with one month of data',
      'The money as one assembly bar with its cuts hanging under it',
      'The week as seven bands on a 24-hour track',
      'The clock as a ring; the hourly rate as a zoomed line with a verdict',
    ],
  },
  {
    date: '2026-08-25',
    icon: '📸',
    title: 'The rota, photographed',
    points: [
      'A photo of the wall schedule becomes days on the calendar',
      'Preview with conflicts flagged; one Cmd+Z takes it all back',
      'Real clock-in and clock-out times now price the shift',
      'Pauses bank unpaid minutes into the day’s break',
    ],
  },
  {
    date: '2026-08-25',
    icon: '⚡',
    title: 'The living calendar',
    points: [
      'Twenty steps of undo behind Cmd+Z, with redo',
      'Drag a shift between days; Alt copies it',
      'Cmd-click gathers days for bulk actions',
      'A flick turns the month on the phone',
    ],
  },
  {
    date: '2026-08-25',
    icon: '🔔',
    title: 'Push, properly',
    points: [
      'Tomorrow’s shift the evening before; unclosed days nudged',
      'Payday mornings and a Sunday digest',
      'A calendar-subscription feed for Google and Apple Calendar',
      'The monthly report: waterfall, ledger, print and XLSX',
    ],
  },
];

function WhatsNew() {
  const { t, lang } = useI18n();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-[1.3rem] font-bold tracking-tight">{t('What’s new')}</h1>

      <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
        {RELEASES.map((release, index) => (
          <li key={index} className="reveal relative" style={stagger(index)}>
            <span className="absolute -left-[27px] top-1 grid h-4 w-4 place-items-center rounded-full border border-border bg-surface text-[0.6rem]">
              {release.icon}
            </span>
            <section className="card lift p-4">
              <p className="field-hint mb-0.5 tabular">
                {new Date(`${release.date}T00:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long' })}
              </p>
              <h2 className="mb-1.5 text-[1rem] font-bold">
                {release.icon} {t(release.title)}
              </h2>
              <ul className="flex flex-col gap-1 text-[0.88rem] text-muted">
                {release.points.map((point) => (
                  <li key={point} className="flex gap-1.5">
                    <span className="text-(--accent-read)">·</span>
                    {t(point)}
                  </li>
                ))}
              </ul>
            </section>
          </li>
        ))}
      </ol>
    </div>
  );
}
