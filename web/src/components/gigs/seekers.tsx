'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { GIG_CATEGORIES, GigCategory, Seeker, SeekerSave, categoryOf, seekerApi } from '@/lib/api/gigs';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { pushToast } from '@/lib/toast';
import { Alert, Segmented } from '@/components/ui/bits';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { TimeAgo } from '@/components/ui/time-ago';
import { Stars } from '@/components/gigs/reviews';

/**
 * The other half of the marketplace: people saying "I am looking", browsed
 * by whoever needs hands. A card carries only what its owner typed in —
 * publishing it is the consent.
 */
export function SeekersBoard({ city, category }: { city: string; category: GigCategory | null }) {
  const { t } = useI18n();
  const [employment, setEmployment] = useState<'any' | 'freelance' | 'permanent'>('any');
  const [seekers, setSeekers] = useState<Seeker[]>([]);
  const [mine, setMine] = useState<Seeker | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void seekerApi
      .list(category, city, employment)
      .then(setSeekers)
      .catch((caught) => setError(apiErrorMessage(caught)));
    void seekerApi.mine().then((card) => setMine('id' in card ? (card as Seeker) : null)).catch(() => setMine(null));
  }, [category, city, employment]);

  useEffect(refresh, [refresh]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={employment}
          options={[
            { value: 'any', label: t('Anyone') },
            { value: 'freelance', label: t('For covers') },
            { value: 'permanent', label: t('For a seat') },
          ]}
          onChange={setEmployment}
        />
        <span className="ml-auto">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>
            {mine === null ? t('I am looking too') : t('My card')}
            {mine !== null && !mine.is_active && ` · ${t('hidden')}`}
          </button>
        </span>
      </div>

      {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {seekers.length === 0 ? (
        <p className="field-hint py-6 text-center">
          {t('Nobody has raised a hand here yet. Post your card — venues do look.')}
        </p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {seekers.map((seeker) => (
            <SeekerCard key={seeker.id} seeker={seeker} />
          ))}
        </div>
      )}

      {editing && (
        <SeekerModal
          mine={mine}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            refresh();
            pushToast({ icon: '🙋', title: t('Saved') });
          }}
        />
      )}
    </div>
  );
}

function SeekerCard({ seeker }: { seeker: Seeker }) {
  const { t } = useI18n();
  const { format } = useMoney();

  return (
    <article className={`card lift flex flex-col gap-2 p-3 ${seeker.is_me ? 'border-(--accent)/45' : ''}`}>
      <header className="flex items-center gap-2.5">
        <Avatar kind={seeker.avatar_kind} data={seeker.avatar_data} name={seeker.name} size={38} />
        <span className="min-w-0">
          <b className="block truncate text-[0.95rem] leading-tight">
            {seeker.name || t('Somebody')}
            {seeker.is_me && <span className="text-muted"> · {t('you')}</span>}
          </b>
          <span className="field-hint flex items-center gap-1.5">
            {seeker.city} · <TimeAgo iso={seeker.updated_at} />
            <Stars rating={seeker.worker_rating} count={seeker.worker_count} small />
          </span>
        </span>
        <span className="chip ml-auto flex-none">
          {seeker.employment === 'any' ? t('any work') : seeker.employment === 'freelance' ? t('covers') : t('a seat')}
        </span>
      </header>
      <p className="flex flex-wrap gap-1">
        {seeker.categories.map((id) => {
          const trade = categoryOf(id);

          return (
            <span key={id} className="chip">
              {trade.emoji} {t(trade.label)}
            </span>
          );
        })}
      </p>
      {seeker.about !== null && <p className="line-clamp-2 text-[0.85rem] text-muted">{seeker.about}</p>}
      <p className="field-hint">
        {seeker.availability !== null && <span>{seeker.availability}</span>}
        {seeker.pay_amount !== null && (
          <span>
            {seeker.availability !== null && ' · '}
            {t('from')} <b className="tabular text-ink">{format(seeker.pay_amount)}</b>
            {seeker.pay_period === 'hour' ? `/${t('hour')}` : seeker.pay_period === 'month' ? `/${t('month')}` : ` ${t('per shift')}`}
          </span>
        )}
      </p>
      <footer className="mt-auto flex items-center gap-2 pt-1 text-[0.85rem] tabular">
        {seeker.phone !== null && <a className="text-(--accent-read)" href={`tel:${seeker.phone}`}>{seeker.phone}</a>}
        {seeker.telegram !== null && (
          <a className="text-(--accent-read)" href={`https://t.me/${seeker.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">
            {seeker.telegram}
          </a>
        )}
      </footer>
    </article>
  );
}

function SeekerModal({ mine, onClose, onDone }: { mine: Seeker | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<SeekerSave>({
    categories: mine?.categories ?? [],
    employment: mine?.employment ?? 'any',
    city: mine?.city ?? '',
    about: mine?.about ?? null,
    availability: mine?.availability ?? null,
    pay_amount: mine?.pay_amount ?? null,
    pay_period: mine?.pay_period ?? 'shift',
    phone: mine?.phone ?? null,
    telegram: mine?.telegram ?? null,
    is_active: mine?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCategory = (id: string) =>
    setForm((current) => ({
      ...current,
      categories: current.categories.includes(id as GigCategory)
        ? current.categories.filter((entry) => entry !== id)
        : current.categories.length >= 3
          ? current.categories
          : [...current.categories, id],
    }));

  const save = async () => {
    setBusy(true);
    setError(null);

    try {
      await seekerApi.save({
        ...form,
        about: form.about?.trim() === '' ? null : form.about,
        availability: form.availability?.trim() === '' ? null : form.availability,
        phone: form.phone?.trim() === '' ? null : form.phone,
        telegram: form.telegram?.trim() === '' ? null : form.telegram,
      });
      onDone();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={t('My card on the board')} onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

        <div>
          <span className="field-label">{t('What I do')} · {form.categories.length}/3</span>
          <div className="mt-1 flex max-h-36 flex-wrap gap-1 overflow-y-auto">
            {GIG_CATEGORIES.map((trade) => (
              <button
                key={trade.id}
                type="button"
                className={`chip ${form.categories.includes(trade.id) ? 'chip-accent' : ''}`}
                onClick={() => toggleCategory(trade.id)}
              >
                {trade.emoji} {t(trade.label)}
              </button>
            ))}
          </div>
        </div>

        <Segmented
          value={form.employment}
          options={[
            { value: 'any' as const, label: t('Anything') },
            { value: 'freelance' as const, label: t('Covers') },
            { value: 'permanent' as const, label: t('A seat') },
          ]}
          onChange={(value) => setForm((current) => ({ ...current, employment: value }))}
        />

        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="field-label">{t('City')}</span>
            <input className="field-input w-full" maxLength={40} value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
          </label>
          <label>
            <span className="field-label">{t('When I can')}</span>
            <input className="field-input w-full" maxLength={120} placeholder={t('Fri–Sun evenings')} value={form.availability ?? ''} onChange={(event) => setForm((current) => ({ ...current, availability: event.target.value }))} />
          </label>
        </div>

        <label>
          <span className="field-label">{t('About me')}</span>
          <textarea className="field-input min-h-14 w-full" maxLength={300} placeholder={t('Three years behind the bar, my speed rail is fast…')} value={form.about ?? ''} onChange={(event) => setForm((current) => ({ ...current, about: event.target.value }))} />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="field-label">{t('Phone')}</span>
            <input className="field-input w-full" autoComplete="tel" inputMode="tel" placeholder="+380…" value={form.phone ?? ''} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label>
            <span className="field-label">Telegram</span>
            <input className="field-input w-full" placeholder="@nick" value={form.telegram ?? ''} onChange={(event) => setForm((current) => ({ ...current, telegram: event.target.value }))} />
          </label>
        </div>

        <label className="flex items-center gap-2 text-[0.9rem]">
          <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />
          {t('Show my card to venues')}
        </label>
        <p className="field-hint">{t('Contacts on the card are public to signed-in venues. Untick above to hide the whole card.')}</p>

        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={busy || form.categories.length === 0 || form.city.trim() === ''}
          onClick={() => void save()}
        >
          {t('Publish the card')}
        </button>
      </div>
    </Modal>
  );
}
