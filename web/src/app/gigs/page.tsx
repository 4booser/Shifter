'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Gig, GigReply, GigSave, GIG_CATEGORIES, categoryOf, gigApi } from '@/lib/api/gigs';
import { accountApi } from '@/lib/api/auth';
import { keysBetween, monthBounds, todayKey, weekBounds } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { pushToast } from '@/lib/toast';
import { useReveal } from '@/lib/fx';
import { Shell } from '@/components/layout/shell';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { Segmented } from '@/components/ui/bits';

type Span = 'week' | 'month' | 'year';
type View = 'board' | 'mine' | 'replies';

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
  const [span, setSpan] = useState<Span>('month');
  const [anchor, setAnchor] = useState(todayKey());
  const [category, setCategory] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [board, setBoard] = useState<Gig[]>([]);
  const [mine, setMine] = useState<{ gig: Gig; replies: GigReply[] }[]>([]);
  const [replies, setReplies] = useState<Gig[]>([]);
  const [responding, setResponding] = useState<Gig | null>(null);
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
      .board(range.from, range.to, category, city)
      .then(setBoard)
      .catch((caught) => setError(apiErrorMessage(caught)));
    void gigApi.mine().then(setMine).catch(() => setMine([]));
    void gigApi.myReplies().then(setReplies).catch(() => setReplies([]));
  }, [range, category, city]);

  useEffect(refresh, [refresh]);

  const step = (delta: number) => {
    const date = new Date(`${anchor}T00:00:00`);

    if (span === 'week') date.setDate(date.getDate() + delta * 7);
    else if (span === 'month') date.setMonth(date.getMonth() + delta);
    else date.setFullYear(date.getFullYear() + delta);

    setAnchor(date.toISOString().slice(0, 10));
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
    title: '',
    details: null,
    date: todayKey(),
    start: '18:00',
    end: '23:00',
    pay_amount: 0,
    pay_period: 'hour',
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
            { value: 'mine', label: `${t('My listings')}${mine.length > 0 ? ` · ${mine.length}` : ''}` },
            { value: 'replies', label: `${t('My replies')}${replies.length > 0 ? ` · ${replies.length}` : ''}` },
          ]}
          onChange={setView}
        />
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {view === 'board' && (
            <>
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

      {view === 'board' && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={`chip ${category === null ? 'border-(--accent) bg-(--accent-soft) text-(--accent)' : ''}`}
              onClick={() => setCategory(null)}
            >
              {t('All trades')}
            </button>
            {GIG_CATEGORIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`chip ${category === entry.id ? 'border-(--accent) bg-(--accent-soft) text-(--accent)' : ''}`}
                onClick={() => setCategory(category === entry.id ? null : entry.id)}
              >
                {entry.emoji} {t(entry.label)}
              </button>
            ))}
            <input
              className="field-input ml-auto !w-36 !py-1 text-[0.85rem]"
              placeholder={t('City')}
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </div>

          {byDate.length === 0 ? (
            <div className="card reveal p-8 text-center">
              <p className="mb-1 text-[1.05rem] font-bold">{t('Quiet out there')}</p>
              <p className="field-hint">{t('No gigs in this window yet. Post one — or widen the range.')}</p>
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

      {view === 'mine' && (
        <MyListings
          rows={mine}
          onEdit={(gig) => setEditing({ id: gig.id, venue: gig.venue, category: gig.category, title: gig.title, details: gig.details, date: gig.date, start: gig.start, end: gig.end, pay_amount: gig.pay_amount, pay_period: gig.pay_period, city: gig.city, slots: gig.slots })}
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

function payLine(format: (v: number) => string, t: (k: string) => string, gig: Gig) {
  return `${format(gig.pay_amount)} ${gig.pay_period === 'hour' ? t('per hour') : t('per shift')}`;
}

function GigCard({ gig, onRespond, onWithdraw }: { gig: Gig; onRespond: () => void; onWithdraw: () => void }) {
  const { t } = useI18n();
  const { format } = useMoney();
  const trade = categoryOf(gig.category);
  const past = gig.date < todayKey();
  const dimmed = gig.status !== 'open' || past;

  return (
    <article className={`card lift relative flex flex-col gap-1.5 p-3 ${dimmed ? 'opacity-60' : ''}`}>
      <header className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-[1.2rem]">{trade.emoji}</span>
          <span className="min-w-0">
            <strong className="block truncate text-[0.95rem] leading-tight">{gig.title}</strong>
            <span className="field-hint truncate">{gig.venue} · {gig.city}</span>
          </span>
        </span>
        <b className="whitespace-nowrap text-[0.95rem] tabular text-(--accent)">{payLine(format, t, gig)}</b>
      </header>
      <p className="text-[0.85rem] tabular text-muted">
        {gig.start}–{gig.end}
        {gig.slots > 1 && <span> · {gig.slots} {t('people needed')}</span>}
        {gig.responses > 0 && <span> · {gig.responses} 🙋</span>}
      </p>
      {gig.details !== null && <p className="line-clamp-2 text-[0.85rem] text-muted">{gig.details}</p>}
      <footer className="mt-auto flex items-center gap-2 pt-1">
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

function MyListings({
  rows,
  onEdit,
  onChanged,
  onError,
}: {
  rows: { gig: Gig; replies: GigReply[] }[];
  onEdit: (gig: Gig) => void;
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
            <span className={`chip ${gig.status === 'open' ? 'border-(--accent)/40 text-(--accent)' : gig.status === 'filled' ? 'border-good/40 text-good' : ''}`}>
              {t(gig.status)}
            </span>
            <span className="ml-auto flex gap-1.5">
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
  const [form, setForm] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError(null);

    try {
      const body: GigSave = { ...form, details: form.details?.trim() === '' ? null : form.details };

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
        <div className="grid grid-cols-3 gap-2">
          <label>
            <span className="field-label">{t('Date')}</span>
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
        <div className="grid grid-cols-3 gap-2">
          <label>
            <span className="field-label">{t('Pay')}</span>
            <input type="number" inputMode="numeric" min={0} className="field-input w-full" value={form.pay_amount === 0 ? '' : form.pay_amount} placeholder="250" onChange={(event) => set('pay_amount', Number(event.target.value) || 0)} />
          </label>
          <label>
            <span className="field-label">{t('Per')}</span>
            <select className="field-input w-full" value={form.pay_period} onChange={(event) => set('pay_period', event.target.value as 'hour' | 'shift')}>
              <option value="hour">{t('hour')}</option>
              <option value="shift">{t('shift')}</option>
            </select>
          </label>
          <label>
            <span className="field-label">{t('People')}</span>
            <input type="number" min={1} max={20} className="field-input w-full" value={form.slots} onChange={(event) => set('slots', Math.max(1, Number(event.target.value) || 1))} />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={busy || form.title.trim() === '' || form.venue.trim() === '' || form.city.trim() === '' || form.pay_amount <= 0}
          onClick={() => void save()}
        >
          {form.id === null ? t('Publish on the board') : t('Save')}
        </button>
      </div>
    </Modal>
  );
}
