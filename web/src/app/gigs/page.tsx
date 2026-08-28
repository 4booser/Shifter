'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Gig, GigEmployment, GigReply, GigSave, GIG_CATEGORIES, GIG_GROUPS, categoryOf, gigApi, shrinkPhoto } from '@/lib/api/gigs';
import { accountApi } from '@/lib/api/auth';
import { fromKey, keysBetween, monthBounds, todayKey, weekBounds, keyOf } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { pushToast } from '@/lib/toast';
import { useReveal } from '@/lib/fx';
import { Shell } from '@/components/layout/shell';
import { Alert } from '@/components/ui/bits';
import { Empty } from '@/components/ui/empty';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { TimeAgo } from '@/components/ui/time-ago';
import { SeekersBoard } from '@/components/gigs/seekers';
import { PendingReviews, Stars } from '@/components/gigs/reviews';
import { CallBack } from '@/components/gigs/call-back';
import { Segmented } from '@/components/ui/bits';

type Span = 'week' | 'month' | 'year';
type View = 'board' | 'people' | 'mine' | 'replies';
type Look = 'list' | 'calendar';

export default function GigsPage() {
  return (
    <Shell>
      <Gigs />
    </Shell>
  );
}

/**
 * The freelance board: one-off hospitality shifts, posted by whoever needs
 * hands and answered with one tap. Contacts move only inside a reply the
 * person typed on purpose — the profile stays private.
 */
function Gigs() {
  const revealHost = useReveal<HTMLDivElement>();
  const { t, lang, n } = useI18n();
  const { format } = useMoney();

  const [view, setView] = useState<View>('board');
  const [employment, setEmployment] = useState<GigEmployment>('freelance');
  const [look, setLook] = useState<Look>('list');
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const [span, setSpan] = useState<Span>('month');
  const [anchor, setAnchor] = useState(todayKey());
  const [category, setCategory] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [board, setBoard] = useState<Gig[]>([]);
  const [mine, setMine] = useState<{ gig: Gig; replies: GigReply[] }[]>([]);
  const [replies, setReplies] = useState<Gig[]>([]);
  const [responding, setResponding] = useState<Gig | null>(null);
  const [callingBack, setCallingBack] = useState<Gig | null>(null);
  const [editing, setEditing] = useState<GigSave & { id: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (span === 'week') return weekBounds(anchor);
    if (span === 'month') return monthBounds(anchor);

    const year = anchor.slice(0, 4);

    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }, [span, anchor]);

  const refresh = useCallback(() => {
    void gigApi
      .board(range.from, range.to, category, city, employment)
      .then(setBoard)
      .catch((caught) => setError(apiErrorMessage(caught)));
    void gigApi.mine().then(setMine).catch(() => setMine([]));
    void gigApi.myReplies().then(setReplies).catch(() => setReplies([]));
  }, [range, category, city, employment]);

  useEffect(refresh, [refresh]);

  const step = (delta: number) => {
    const date = new Date(`${anchor}T00:00:00`);

    if (span === 'week') date.setDate(date.getDate() + delta * 7);
    else if (span === 'month') date.setMonth(date.getMonth() + delta);
    else date.setFullYear(date.getFullYear() + delta);

    // Local, not UTC. Converting a local midnight to UTC lands on the previous
    // day east of Greenwich, so every step lost a day — and on the first of a
    // month the arrow did nothing at all.
    setAnchor(keyOf(date));
  };

  const rangeLabel =
    span === 'year'
      ? anchor.slice(0, 4)
      : span === 'month'
        ? new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(new Date(`${anchor}T00:00:00`))
        : `${range.from.slice(8)}–${range.to.slice(8)} ${new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(`${range.from}T00:00:00`))}`;

  // The board groups by date so a busy Friday reads as one block.
  const byDate = useMemo(() => {
    const map = new Map<string, Gig[]>();

    for (const gig of board) {
      const list = map.get(gig.date) ?? [];

      list.push(gig);
      map.set(gig.date, list);
    }

    return [...map.entries()];
  }, [board]);

  const blank = (): GigSave & { id: number | null } => ({
    id: null,
    venue: '',
    category: 'bartender',
    employment,
    photos: [],
    schedule: null,
    title: '',
    details: null,
    date: todayKey(),
    start: '18:00',
    end: '23:00',
    pay_amount: 0,
    pay_period: 'hour',
    pay_percent: null,
    city: '',
    slots: 1,
  });

  return (
    <div ref={revealHost} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[1.3rem] font-bold tracking-tight">{t('Gigs')}</h1>
        <Segmented
          value={view}
          options={[
            { value: 'board', label: t('Board') },
            { value: 'people', label: t('People') },
            { value: 'mine', label: `${t('My listings')}${mine.length > 0 ? ` · ${mine.length}` : ''}` },
            { value: 'replies', label: `${t('My replies')}${replies.length > 0 ? ` · ${replies.length}` : ''}` },
          ]}
          onChange={setView}
        />
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {view === 'board' && (
            <>
              <Segmented
                value={employment}
                options={[
                  { value: 'freelance', label: t('Freelance') },
                  { value: 'permanent', label: t('Full-time') },
                ]}
                onChange={(value) => {
                  setEmployment(value);
                  if (value === 'permanent') setLook('list');
                }}
              />
              {employment === 'freelance' && (
                <Segmented
                  value={look}
                  options={[
                    { value: 'list', label: t('List') },
                    { value: 'calendar', label: t('Calendar') },
                  ]}
                  onChange={(value) => {
                    setLook(value);
                    if (value === 'calendar') setSpan('month');
                  }}
                />
              )}
              <Segmented
                value={span}
                options={[
                  { value: 'week', label: t('Week') },
                  { value: 'month', label: t('Month') },
                  { value: 'year', label: t('Year') },
                ]}
                onChange={setSpan}
              />
              <button type="button" className="btn btn-sm px-2" aria-label={t('Previous')} onClick={() => step(-1)}>
                <Icon name="chevron-left" size={16} />
              </button>
              <strong className="min-w-28 text-center text-[0.9rem] capitalize tabular">{rangeLabel}</strong>
              <button type="button" className="btn btn-sm px-2" aria-label={t('Next')} onClick={() => step(1)}>
                <Icon name="chevron-right" size={16} />
              </button>
            </>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing(blank())}>
            <Icon name="plus" size={14} />
            {t('Post a gig')}
          </button>
        </span>
      </div>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      <PendingReviews onChanged={refresh} />

      {view === 'board' && (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={`chip ${category === null ? 'border-(--accent) bg-(--accent-soft) text-(--accent)' : ''}`}
                onClick={() => setCategory(null)}
              >
                {t('All trades')}
              </button>
              <input
                className="field-input ml-auto !w-36 !py-1 text-[0.85rem]"
                placeholder={t('City')}
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </div>
            {GIG_GROUPS.map((group) => (
              <div key={group} className="flex flex-wrap items-center gap-1.5">
                <span className="w-24 flex-none text-[0.68rem] font-semibold uppercase tracking-wide text-faint">
                  {t(group)}
                </span>
                {GIG_CATEGORIES.filter((entry) => entry.group === group).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`chip ${category === entry.id ? 'border-(--accent) bg-(--accent-soft) text-(--accent)' : ''}`}
                    onClick={() => setCategory(category === entry.id ? null : entry.id)}
                  >
                    {entry.emoji} {t(entry.label)}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {look === 'calendar' && employment === 'freelance' ? (
            <GigCalendar
              from={range.from}
              to={range.to}
              gigs={board}
              focusDay={focusDay}
              onFocus={setFocusDay}
              onRespond={setResponding}
              onWithdraw={(gig) => {
                void gigApi.withdraw(gig.id).then(refresh).catch((caught) => setError(apiErrorMessage(caught)));
              }}
            />
          ) : byDate.length === 0 ? (
            <div className="card reveal p-8 text-center">
              <p className="mb-1 text-[1.05rem] font-bold">{t('Quiet out there')}</p>
              <Empty icon="spark" title={t('No gigs in this window')}>
                {t('The board fills up closer to the weekend. Widen the dates, drop the category filter, or post the shift you need covered yourself.')}
              </Empty>
            </div>
          ) : (
            byDate.map(([date, gigs]) => (
              <section key={date} className="reveal">
                <h2 className="mb-1.5 text-[0.8rem] font-semibold uppercase tracking-wide text-faint">
                  {new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T00:00:00`))}
                </h2>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {gigs.map((gig) => (
                    <GigCard key={gig.id} gig={gig} onRespond={() => setResponding(gig)} onWithdraw={() => {
                      void gigApi.withdraw(gig.id).then(refresh).catch((caught) => setError(apiErrorMessage(caught)));
                    }} />
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}

      {view === 'people' && <SeekersBoard city={city} category={category as never} />}

      {view === 'mine' && (
        <MyListings
          rows={mine}
          onCallBack={setCallingBack}
          onEdit={(gig) => setEditing({ id: gig.id, venue: gig.venue, category: gig.category, employment: gig.employment, photos: gig.photos, schedule: gig.schedule, title: gig.title, details: gig.details, date: gig.date, start: gig.start, end: gig.end, pay_amount: gig.pay_amount, pay_period: gig.pay_period, pay_percent: gig.pay_percent, city: gig.city, slots: gig.slots })}
          onChanged={refresh}
          onError={setError}
        />
      )}

      {view === 'replies' && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {replies.length === 0 && (
            <p className="field-hint col-span-full">{t('Answer a gig on the board and it lands here.')}</p>
          )}
          {replies.map((gig) => (
            <GigCard key={gig.id} gig={gig} onRespond={() => setResponding(gig)} onWithdraw={() => {
              void gigApi.withdraw(gig.id).then(refresh).catch((caught) => setError(apiErrorMessage(caught)));
            }} />
          ))}
        </div>
      )}

      {callingBack !== null && <CallBack gig={callingBack} onClose={() => setCallingBack(null)} />}

      {responding !== null && (
        <RespondModal
          gig={responding}
          onClose={() => setResponding(null)}
          onDone={() => {
            setResponding(null);
            refresh();
            pushToast({ icon: '🙌', title: t('Sent'), text: t('The venue got your contacts. They will reach out.') });
          }}
        />
      )}

      {editing !== null && (
        <EditModal
          draft={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            setView('mine');
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** What one gig is worth for the day: hourly pay priced over its slot. */
function gigWorth(gig: Gig): number {
  if (gig.pay_period !== 'hour') return gig.pay_amount;

  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  let span = minutes(gig.end) - minutes(gig.start);

  if (span <= 0) span += 24 * 60;

  return (span / 60) * gig.pay_amount;
}

/**
 * The board as a month: each day says how many covers it needs and what
 * they add up to. A tap opens the day's cards right under the grid — the
 * same mental model as the person's own calendar, money in the cells.
 */
function GigCalendar({
  from,
  to,
  gigs,
  focusDay,
  onFocus,
  onRespond,
  onWithdraw,
}: {
  from: string;
  to: string;
  gigs: Gig[];
  focusDay: string | null;
  onFocus: (day: string | null) => void;
  onRespond: (gig: Gig) => void;
  onWithdraw: (gig: Gig) => void;
}) {
  const { t, lang, n } = useI18n();
  const { format } = useMoney();

  const keys = keysBetween(from, to);
  const byDay = new Map<string, Gig[]>();

  for (const gig of gigs) {
    const list = byDay.get(gig.date) ?? [];

    list.push(gig);
    byDay.set(gig.date, list);
  }

  const offset = (fromKey(keys[0]).getDay() + 6) % 7;
  const cells: (string | null)[] = [...new Array<null>(offset).fill(null), ...keys];
  const today = todayKey();
  const weekdays = Array.from({ length: 7 }, (_, day) =>
    new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(2024, 0, day + 1)),
  );
  const focused = focusDay !== null ? byDay.get(focusDay) ?? [] : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="card reveal p-3">
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((name) => (
            <span key={name} className="pb-0.5 text-center text-[0.62rem] font-semibold uppercase tracking-wide text-faint">
              {name}
            </span>
          ))}
          {cells.map((key, index) => {
            if (key === null) return <span key={`pad-${index}`} />;

            const dayGigs = byDay.get(key) ?? [];
            const worth = dayGigs.reduce((sum, gig) => sum + gigWorth(gig), 0);
            const active = focusDay === key;

            return (
              <button
                type="button"
                key={key}
                disabled={dayGigs.length === 0}
                className={`relative min-h-16 rounded-(--radius) border p-1 text-left transition-transform ${
                  dayGigs.length > 0
                    ? `bg-(--accent-soft) hover:scale-[1.04] ${active ? 'border-(--accent) ring-1 ring-(--accent)' : 'border-transparent'}`
                    : 'border-transparent bg-surface-2/50'
                } ${key === today ? 'outline outline-1 outline-(--accent)/40' : ''}`}
                onClick={() => onFocus(active ? null : key)}
              >
                <span className={`absolute left-1.5 top-1 text-[0.64rem] font-semibold tabular ${dayGigs.length > 0 ? 'text-ink/70' : 'text-faint'}`}>
                  {Number(key.slice(8))}
                </span>
                {dayGigs.length > 0 && (
                  <span className="mt-3.5 block px-0.5">
                    <span className="block text-[1.02rem] font-bold leading-tight tabular">{dayGigs.length}</span>
                    <span className="block truncate text-[0.66rem] font-semibold text-good tabular">
                      {format(Math.round(worth))}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="field-hint mt-2">
          {focusDay === null
            ? t('A day shows how many covers it needs and what they pay together. Tap one.')
            : `${new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${focusDay}T00:00:00`))} · ${n(focused.length, 'shifts')}`}
        </p>
      </div>

      {focusDay !== null && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {focused.map((gig) => (
            <GigCard key={gig.id} gig={gig} onRespond={() => onRespond(gig)} onWithdraw={() => onWithdraw(gig)} />
          ))}
        </div>
      )}
    </div>
  );
}

function payLine(format: (v: number) => string, t: (k: string) => string, gig: Gig) {
  const period =
    gig.pay_period === 'hour' ? t('per hour') : gig.pay_period === 'month' ? t('per month') : t('per shift');
  const base = gig.pay_amount > 0 ? `${format(gig.pay_amount)} ${period}` : null;
  const percent = gig.pay_percent !== null ? `${gig.pay_percent}% ${t('of sales')}` : null;

  return [base, percent].filter((part) => part !== null).join(' + ');
}

function GigCard({ gig, onRespond, onWithdraw }: { gig: Gig; onRespond: () => void; onWithdraw: () => void }) {
  const { t } = useI18n();
  const { format } = useMoney();
  const trade = categoryOf(gig.category);
  const past = gig.employment === 'freelance' && gig.date < todayKey();
  const dimmed = gig.status !== 'open' || past;

  const [photo, setPhoto] = useState(0);

  return (
    <article className={`card lift relative flex flex-col gap-1.5 overflow-hidden p-3 ${dimmed ? 'opacity-60' : ''}`}>
      {gig.photos.length > 0 && (
        <button
          type="button"
          className="relative -m-3 mb-0 block h-32 overflow-hidden"
          onClick={() => setPhoto((current) => (current + 1) % gig.photos.length)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gig.photos[photo]} alt="" className="h-full w-full object-cover" />
          {gig.photos.length > 1 && (
            <span className="absolute bottom-1.5 right-2 flex items-center gap-1">
              {gig.photos.map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 rounded-full transition-all ${index === photo ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
                />
              ))}
            </span>
          )}
        </button>
      )}
      <header className="mt-2 flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-[1.2rem]">{trade.emoji}</span>
          <span className="min-w-0">
            <strong className="block truncate text-[0.95rem] leading-tight">{gig.title}</strong>
            <span className="field-hint flex items-center gap-1.5 truncate">
              {gig.venue} · {gig.city} <Stars rating={gig.employer_rating} count={gig.employer_count} small />
            </span>
          </span>
        </span>
        <b className="whitespace-nowrap text-[0.95rem] tabular text-(--accent)">{payLine(format, t, gig)}</b>
      </header>
      <p className="text-[0.85rem] tabular text-muted">
        {gig.employment === 'permanent'
          ? `${gig.schedule ?? `${gig.start}–${gig.end}`} · ${t('from')} ${gig.date.slice(8)}.${gig.date.slice(5, 7)}`
          : `${gig.start}–${gig.end}`}
        {gig.slots > 1 && <span> · {gig.slots} {t('people needed')}</span>}
        {gig.responses > 0 && <span> · {gig.responses} 🙋</span>}
      </p>
      {gig.details !== null && <p className="line-clamp-2 text-[0.85rem] text-muted">{gig.details}</p>}

      {/* What the rate is worth to *this* reader. A board full of numbers tells
          nobody anything: 250 an hour is generous in one city and a pay cut in
          another, and the app already knows which. Not shown on your own
          listings — comparing a shift you are offering against your own wage
          would be answering a question nobody asked. */}
      {!gig.is_mine && gig.worth !== null && (
        <p
          className={`text-[0.82rem] ${
            gig.worth.difference_percent > 0
              ? 'text-good'
              : gig.worth.difference_percent < 0
                ? 'text-danger'
                : 'text-muted'
          }`}
        >
          {gig.worth.difference_percent === 0
            ? t('About your usual hour')
            : `${format(gig.worth.offered_per_hour)}${t('/hour')} — ${t(
                gig.worth.difference_percent > 0 ? 'above your usual by' : 'below your usual by',
              )} ${Math.abs(gig.worth.difference_percent)}%`}
        </p>
      )}
      <footer className="mt-auto flex items-center gap-2 pt-1 text-[0.78rem]">
        <TimeAgo iso={gig.created_at} />
        <ShareGig gig={gig} />
        {gig.status === 'filled' && <span className="chip border-good/40 bg-(--good-soft) text-good">{t('filled')}</span>}
        {gig.is_mine && <span className="chip">{t('Yours')}</span>}
        {!gig.is_mine && gig.my_response === null && gig.status === 'open' && !past && (
          <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={onRespond}>
            {t('I am in')}
          </button>
        )}
        {!gig.is_mine && gig.my_response !== null && (
          <span className="ml-auto flex items-center gap-2">
            <span className={`chip ${gig.my_response.accepted ? 'border-good/40 bg-(--good-soft) text-good' : ''}`}>
              {gig.my_response.accepted ? t('You are in 🙌') : t('Sent, waiting')}
            </span>
            {!gig.my_response.accepted && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={onWithdraw}>
                {t('Withdraw')}
              </button>
            )}
          </span>
        )}
      </footer>
    </article>
  );
}

/**
 * The link that travels: shifter.ink/g/42 unfurls in a work chat with the
 * venue, the trade, the pay and the first photo — because that is where
 * hospitality shifts are actually passed around.
 */
function ShareGig({ gig }: { gig: Gig }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  // Keyed on the slug rather than the id: a numeric link used to preview,
  // which meant counting from one walked the whole board without an account.
  const url =
    typeof window === 'undefined' ? '' : `${window.location.origin}/g/${gig.share_slug}`;

  const share = async () => {
    const text = `${gig.title} — ${gig.venue}`;

    // The native sheet where it exists (every phone), clipboard everywhere else.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: text, url });

        return;
      } catch {
        // Cancelled or unsupported — fall through to the copy.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      pushToast({ icon: '🔗', title: url });
    }
  };

  return (
    <button
      type="button"
      className="text-faint transition-colors hover:text-(--accent)"
      title={t('Copy a link for the work chat')}
      onClick={() => void share()}
    >
      {copied ? `✓ ${t('copied')}` : '🔗'}
    </button>
  );
}

function MyListings({
  rows,
  onEdit,
  onCallBack,
  onChanged,
  onError,
}: {
  rows: { gig: Gig; replies: GigReply[] }[];
  onEdit: (gig: Gig) => void;
  onCallBack: (gig: Gig) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const { format } = useMoney();

  if (rows.length === 0) {
    return <p className="field-hint">{t('Post a gig and the replies gather here, contacts included.')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map(({ gig, replies }) => (
        <section key={gig.id} className="card reveal p-3">
          <header className="flex flex-wrap items-center gap-2">
            <span className="text-[1.1rem]">{categoryOf(gig.category).emoji}</span>
            <strong className="text-[0.95rem]">{gig.title}</strong>
            <span className="field-hint">{gig.date.slice(8)}.{gig.date.slice(5, 7)} · {gig.start}–{gig.end} · {payLine(format, t, gig)}</span>
            <TimeAgo iso={gig.created_at} />
            <span className={`chip ${gig.status === 'open' ? 'border-(--accent)/40 text-(--accent)' : gig.status === 'filled' ? 'border-good/40 text-good' : ''}`}>
              {t(gig.status)}
            </span>
            <span className="ml-auto flex gap-1.5">
              {gig.status === 'open' && (
                <button type="button" className="btn btn-sm" onClick={() => onCallBack(gig)}>
                  👋 {t('Call somebody back')}
                </button>
              )}
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => onEdit(gig)}>{t('Edit')}</button>
              {gig.status !== 'closed' ? (
                <button type="button" className="btn btn-quiet btn-sm text-danger" onClick={() => void gigApi.setStatus(gig.id, 'closed').then(onChanged).catch((c) => onError(apiErrorMessage(c)))}>
                  {t('Close')}
                </button>
              ) : (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => void gigApi.setStatus(gig.id, 'open').then(onChanged).catch((c) => onError(apiErrorMessage(c)))}>
                  {t('Reopen')}
                </button>
              )}
            </span>
          </header>
          {replies.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5 border-t border-border/60 pt-2">
              {replies.map((reply) => (
                <li key={reply.id} className="flex flex-wrap items-center gap-2 text-[0.88rem]">
                  <b>{reply.name || t('Somebody')}</b>
                  <Stars rating={reply.worker_rating} count={reply.worker_count} small />
                  {reply.message !== null && <span className="text-muted">«{reply.message}»</span>}
                  <span className="ml-auto flex items-center gap-2 tabular">
                    {reply.phone !== null && <a className="text-(--accent)" href={`tel:${reply.phone}`}>{reply.phone}</a>}
                    {reply.telegram !== null && (
                      <a className="text-(--accent)" href={`https://t.me/${reply.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">
                        {reply.telegram}
                      </a>
                    )}
                    {reply.accepted ? (
                      <span className="chip border-good/40 bg-(--good-soft) text-good">{t('Taken')}</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => void gigApi.accept(gig.id, reply.id).then(onChanged).catch((c) => onError(apiErrorMessage(c)))}
                      >
                        {t('Take them')}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** The consent moment: exactly what leaves your profile, shown before it does. */
function RespondModal({ gig, onClose, onDone }: { gig: Gig; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { format } = useMoney();
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the profile so a second reply is one tap, not a form.
  useEffect(() => {
    void accountApi.get().then((profile) => {
      setPhone(profile.contact_phone ?? '');
      setTelegram(profile.contact_telegram ?? '');
    }).catch(() => undefined);
  }, []);

  const send = async () => {
    setBusy(true);
    setError(null);

    try {
      await gigApi.respond(gig.id, {
        message: message.trim() === '' ? null : message.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
        telegram: telegram.trim() === '' ? null : telegram.trim(),
      });
      onDone();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`${t('I am in')} — ${gig.title}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="field-hint">
          {gig.venue} · {gig.date.slice(8)}.{gig.date.slice(5, 7)} · {gig.start}–{gig.end} · {payLine(format, t, gig)}
        </p>
        {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
        <label>
          <span className="field-label">{t('A line about you')}</span>
          <textarea
            className="field-input min-h-16 w-full"
            maxLength={300}
            placeholder={t('Three years behind the bar, my speed rail is fast…')}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="field-label">{t('Phone')}</span>
            <input className="field-input w-full" inputMode="tel" placeholder="+380…" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label>
            <span className="field-label">Telegram</span>
            <input className="field-input w-full" placeholder="@nick" value={telegram} onChange={(event) => setTelegram(event.target.value)} />
          </label>
        </div>
        <p className="field-hint">{t('Only what you filled in here reaches the venue — nothing else ever does.')}</p>
        <button type="button" className="btn btn-primary w-full" disabled={busy || (phone.trim() === '' && telegram.trim() === '')} onClick={() => void send()}>
          {t('Send and share contacts')}
        </button>
      </div>
    </Modal>
  );
}

function EditModal({
  draft,
  onClose,
  onDone,
}: {
  draft: GigSave & { id: number | null };
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { format } = useMoney();
  const [form, setForm] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [shrinking, setShrinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError(null);

    try {
      const body: GigSave = {
        ...form,
        details: form.details?.trim() === '' ? null : form.details,
        schedule: form.employment === 'permanent' ? (form.schedule?.trim() === '' ? null : form.schedule) : null,
        pay_period: form.employment === 'freelance' && form.pay_period === 'month' ? 'shift' : form.pay_period,
      };

      if (form.id === null) await gigApi.create(body);
      else await gigApi.update(form.id, body);
      onDone();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={form.id === null ? t('Post a gig') : t('Edit the gig')} onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

        <Segmented
          value={form.employment}
          options={[
            { value: 'freelance' as const, label: t('One-off shift') },
            { value: 'permanent' as const, label: t('Full-time role') },
          ]}
          onChange={(value) => set('employment', value)}
        />

        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="field-label">{t('Venue')}</span>
            <input className="field-input w-full" maxLength={60} placeholder="Bar Dym" value={form.venue} onChange={(event) => set('venue', event.target.value)} />
          </label>
          <label>
            <span className="field-label">{t('City')}</span>
            <input className="field-input w-full" maxLength={40} placeholder={t('Kyiv')} value={form.city} onChange={(event) => set('city', event.target.value)} />
          </label>
        </div>
        <div>
          <span className="field-label">
            {t('Photos of the venue')} · {form.photos.length}/3+
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {form.photos.map((photo, index) => (
              <span key={index} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="" className="h-16 w-16 rounded-(--radius) object-cover" />
                <button
                  type="button"
                  aria-label={t('Remove')}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-danger text-[0.7rem] text-white"
                  onClick={() => set('photos', form.photos.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </span>
            ))}
            {form.photos.length < 6 && (
              <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-(--radius) border border-dashed border-border-strong text-[1.3rem] text-faint hover:border-(--accent) hover:text-(--accent)">
                {shrinking ? '…' : '+'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = [...(event.target.files ?? [])].slice(0, 6 - form.photos.length);

                    event.target.value = '';

                    if (files.length === 0) return;

                    setShrinking(true);
                    void Promise.all(files.map(shrinkPhoto))
                      .then((shrunk) => setForm((current) => ({ ...current, photos: [...current.photos, ...shrunk] })))
                      .catch(() => setError(t('Could not read a photo.')))
                      .finally(() => setShrinking(false));
                  }}
                />
              </label>
            )}
          </div>
          <p className="field-hint mt-1">{t('At least three — people answer the venues they can see. Shrunk in the browser.')}</p>
        </div>

        <label>
          <span className="field-label">{t('Trade')}</span>
          <select className="field-input w-full" value={form.category} onChange={(event) => set('category', event.target.value as typeof form.category)}>
            {GIG_CATEGORIES.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.emoji} {t(entry.label)}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">{t('Title')}</span>
          <input className="field-input w-full" maxLength={80} placeholder={t('Bartender for the close')} value={form.title} onChange={(event) => set('title', event.target.value)} />
        </label>
        <label>
          <span className="field-label">{t('Details')}</span>
          <textarea className="field-input min-h-14 w-full" maxLength={600} placeholder={t('Classics plus shots, own till, tips are yours')} value={form.details ?? ''} onChange={(event) => set('details', event.target.value)} />
        </label>
        {form.employment === 'permanent' && (
          <label>
            <span className="field-label">{t('Schedule, in your words')}</span>
            <input
              className="field-input w-full"
              maxLength={80}
              placeholder={t('2/2 from 10:00, pay twice a month')}
              value={form.schedule ?? ''}
              onChange={(event) => set('schedule', event.target.value)}
            />
          </label>
        )}
        <div className="grid grid-cols-3 gap-2">
          <label>
            <span className="field-label">{form.employment === 'permanent' ? t('Starting') : t('Date')}</span>
            <input type="date" className="field-input w-full" value={form.date} min={todayKey()} onChange={(event) => set('date', event.target.value)} />
          </label>
          <label>
            <span className="field-label">{t('From')}</span>
            <input type="time" className="field-input w-full" value={form.start} onChange={(event) => set('start', event.target.value)} />
          </label>
          <label>
            <span className="field-label">{t('To')}</span>
            <input type="time" className="field-input w-full" value={form.end} onChange={(event) => set('end', event.target.value)} />
          </label>
        </div>
        <div className="rounded-(--radius) border border-border bg-surface-2/40 p-3">
          <span className="field-label">{t('Pay — stack it how the venue really pays')}</span>
          <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="field-input w-full"
              value={form.pay_amount === 0 ? '' : form.pay_amount}
              placeholder={form.pay_percent !== null ? t('0 — percent only') : '250'}
              onChange={(event) => set('pay_amount', Number(event.target.value) || 0)}
            />
            <Segmented
              value={form.pay_period}
              options={[
                { value: 'hour' as const, label: t('per hour') },
                { value: 'shift' as const, label: t('per shift') },
                ...(form.employment === 'permanent' ? [{ value: 'month' as const, label: t('per month') }] : []),
              ]}
              onChange={(value) => set('pay_period', value)}
            />
          </div>

          {form.pay_percent === null ? (
            <button
              type="button"
              className="btn btn-quiet btn-sm mt-2"
              onClick={() => set('pay_percent', 5)}
            >
              + {t('percent of sales')}
            </button>
          ) : (
            <div className="mt-2.5">
              <span className="field-hint flex items-center justify-between">
                <span>{t('Percent of sales')}</span>
                <span className="flex items-center gap-1.5">
                  <b className="tabular text-ink">{form.pay_percent}%</b>
                  <button
                    type="button"
                    aria-label={t('Remove')}
                    className="grid h-5 w-5 place-items-center rounded-full bg-surface-2 text-[0.7rem] text-muted hover:text-danger"
                    onClick={() => set('pay_percent', null)}
                  >
                    ×
                  </button>
                </span>
              </span>
              <input
                type="range"
                min={0.5}
                max={30}
                step={0.5}
                className="w-full"
                value={form.pay_percent}
                onChange={(event) => set('pay_percent', Number(event.target.value))}
              />
            </div>
          )}

          {(form.pay_amount > 0 || form.pay_percent !== null) && (
            <p className="mt-2 rounded-(--radius) bg-(--accent-soft) px-2.5 py-1.5 text-[0.85rem] font-semibold text-(--accent)">
              {t('The card will say')}:{' '}
              {[
                form.pay_amount > 0
                  ? `${format(form.pay_amount)} ${form.pay_period === 'hour' ? t('per hour') : form.pay_period === 'month' ? t('per month') : t('per shift')}`
                  : null,
                form.pay_percent !== null ? `${form.pay_percent}% ${t('of sales')}` : null,
              ]
                .filter(Boolean)
                .join(' + ')}
            </p>
          )}
        </div>

        <label>
          <span className="field-label">{t('People')}</span>
          <input type="number" min={1} max={20} className="field-input w-full" value={form.slots} onChange={(event) => set('slots', Math.max(1, Number(event.target.value) || 1))} />
        </label>
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={busy || shrinking || form.photos.length < 3 || form.title.trim() === '' || form.venue.trim() === '' || form.city.trim() === '' || (form.pay_amount <= 0 && form.pay_percent === null)}
          onClick={() => void save()}
        >
          {form.id === null ? t('Publish on the board') : t('Save')}
        </button>
      </div>
    </Modal>
  );
}
