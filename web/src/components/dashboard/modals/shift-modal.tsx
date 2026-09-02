'use client';

import { useEffect, useState } from 'react';

import { api, apiErrorMessage } from '@/lib/api/http';
import {
  EMOJI_GROUPS,
  MARK_COLOURS,
  SALARY_PERIODS,
  SalaryPeriod,
  ShiftTemplate,
  TipSource,
} from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { catalogueActions, useCalendar } from '@/lib/store/calendar';
import { Alert, Segmented, SwatchRow } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

const PERIOD_HINTS: Record<SalaryPeriod, string> = {
  hour: 'Multiplied by the hours of every shift you work.',
  day: 'A flat amount for each day this shift is on.',
  week: 'Counted once per week, however many shifts fall in it.',
  month: 'Counted once per month, however many shifts fall in it.',
};

export function ShiftModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: ShiftTemplate | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const allLocations = useCalendar((state) => state.locations);
  const locations = allLocations.filter((location) => !location.archived);

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [period, setPeriod] = useState<SalaryPeriod>('hour');
  const [amount, setAmount] = useState<number | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  const [paintsDay, setPaintsDay] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [tipSource, setTipSource] = useState<TipSource>('personal');
  const [poolShare, setPoolShare] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The advert somebody is copying the terms out of. Only offered on a new
  // shift: pasting one over an existing template would overwrite terms that
  // have already been agreed with figures a regex read off a listing.
  const [advert, setAdvert] = useState('');
  const [reading, setReading] = useState(false);

  // Refills whenever the dialog opens, so a cancelled edit leaves nothing
  // behind for the next one.
  useEffect(() => {
    if (!open) return;

    setError(null);
    setName(editing?.name ?? '');
    setSymbol(editing?.symbol ?? '');
    setStart(editing?.start_time ?? '09:00');
    setEnd(editing?.end_time ?? '18:00');
    setPeriod(editing?.salary_period ?? 'hour');
    setAmount(editing?.salary_amount ?? null);
    setBreakMinutes(editing?.break_minutes ?? 0);
    setLocationId(editing?.location_id ?? null);
    setColour(editing?.colour ?? null);
    setPaintsDay(editing?.paints_day ?? false);
    setPercent(editing?.revenue_percent ?? null);
    setTipSource(editing?.tip_source ?? 'personal');
    setPoolShare(editing?.tip_pool_percent ?? null);
    setAdvert('');
  }, [open, editing]);

  /** What the calendar will actually draw, given the place currently chosen. */
  const preview = colour ?? locations.find((place) => place.id === locationId)?.colour ?? null;

  const submit = async () => {
    if (name.trim() === '') return;

    try {
      await catalogueActions.saveShift(
        {
          name: name.trim(),
          symbol: symbol === '' ? null : symbol,
          start_time: start,
          end_time: end,
          salary_period: period,
          salary_amount: amount,
          break_minutes: breakMinutes,
          location_id: locationId,
          colour,
          paints_day: paintsDay,
          revenue_percent: percent,
          tip_source: tipSource,
          tip_pool_percent: poolShare,
        },
        editing?.id ?? null,
      );
      onClose();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  };

  return (
    <Modal open={open} title={t(editing === null ? 'New shift' : 'Edit shift')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {error && <Alert>{error}</Alert>}

        {/* The terms are already written down in the advert. Copying them into
            this form by hand is work half of people skip, and then the shift
            is recorded at a rate nobody checked. */}
        {editing === null && (
          <details className="rounded-(--radius) border border-border p-2.5">
            <summary className="cursor-pointer text-[0.86rem] font-semibold">
              {t('Paste the advert and fill this in')}
            </summary>
            <textarea
              className="field-input mt-2 min-h-[5rem] !text-[0.82rem]"
              placeholder={t('Бармен, зміни 10:00–22:00, 250 грн/годину, 5% з бару')}
              value={advert}
              onChange={(event) => setAdvert(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm mt-2 w-full"
              disabled={reading || advert.trim() === ''}
              onClick={() => {
                setReading(true);

                void api<{
                  pay_amount: number | null;
                  pay_period: string | null;
                  percent: number | null;
                  start: string | null;
                  end: string | null;
                  break_minutes: number | null;
                }>('/shifter/v1/advert/read', { body: { text: advert } })
                  .then((read) => {
                    // Only what the advert actually said. Anything it was
                    // silent about keeps whatever is in the form, because a
                    // blank left blank is a question and a blank filled in
                    // with a guess is an answer.
                    if (read.pay_amount !== null) setAmount(read.pay_amount);
                    if (read.pay_period !== null) setPeriod(read.pay_period as SalaryPeriod);
                    if (read.percent !== null) setPercent(read.percent);
                    if (read.start !== null) setStart(read.start);
                    if (read.end !== null) setEnd(read.end);
                    if (read.break_minutes !== null) setBreakMinutes(read.break_minutes);
                  })
                  .catch(() => undefined)
                  .finally(() => setReading(false));
              }}
            >
              {t('Read the advert')}
            </button>
            <p className="field-hint mt-1.5">
              {t('It fills in only what the advert actually says, and everything it fills in is yours to correct.')}
            </p>
          </details>
        )}

        <div className="grid grid-cols-[1fr_5.5rem] gap-3">
          <label>
            <span className="field-label">{t('Name')}</span>
            <input className="field-input" maxLength={40} value={name} placeholder="Night" onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span className="field-label">{t('Badge')}</span>
            <input className="field-input text-center" maxLength={4} value={symbol} onChange={(event) => setSymbol(event.target.value)} />
          </label>
        </div>

        <div>
          <span className="field-label">{t('Or pick an icon')}</span>
          <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto rounded-(--radius) border border-border p-2">
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-wrap gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`grid h-7 w-7 place-items-center rounded text-[0.95rem] hover:bg-surface-2 ${
                      symbol === emoji ? 'bg-(--accent-soft) ring-1 ring-(--accent)' : ''
                    }`}
                    onClick={() => setSymbol(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {locations.length > 0 && (
          <label>
            <span className="field-label">{t('Place of work')}</span>
            <select
              className="field-input"
              value={locationId ?? ''}
              onChange={(event) => setLocationId(event.target.value === '' ? null : Number(event.target.value))}
            >
              <option value="">{t('No place')}</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div>
          <span className="field-label !flex items-center gap-2">
            {t('Colour')}
            {preview && <span className="h-3.5 w-3.5 rounded-full" style={{ background: preview }} />}
          </span>
          {/* Clicking the active colour again clears it — the template goes
              back to borrowing its place's. */}
          <SwatchRow
            colours={MARK_COLOURS}
            saveable
            value={colour}
            onPick={(value) => setColour((current) => (current === value ? null : value))}
          />
          <p className="field-hint mt-1">
            {t(
              colour === null
                ? 'Takes the colour of its place of work. Pick one to tell two shifts at the same place apart.'
                : 'Click the same colour again to go back to the place’s.',
            )}
          </p>

          {/* One switch instead of colouring thirty days by hand. A day
              painted by hand still wins — the person outranks the rule. */}
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={paintsDay}
              onChange={(event) => setPaintsDay(event.target.checked)}
            />
            <span>
              <span className="block text-[0.88rem] font-medium">{t('Paint the day in this colour')}</span>
              <span className="field-hint">
                {t('Every day this shift lands on takes it. A day you coloured by hand keeps yours.')}
              </span>
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('Starts')}</span>
            <input type="time" className="field-input" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>
            <span className="field-label">{t('Ends')}</span>
            <input type="time" className="field-input" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>

        <p className="field-hint">{t('An end before the start means the shift runs past midnight.')}</p>

        <label>
          <span className="field-label">{t('Unpaid break, minutes')}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={720}
            step={5}
            className="field-input"
            value={breakMinutes}
            onChange={(event) => setBreakMinutes(Number(event.target.value) || 0)}
          />
        </label>

        <div>
          <span className="field-label">{t('Paid per')}</span>
          <Segmented
            value={period}
            options={SALARY_PERIODS.map((option) => ({ value: option.value, label: t(option.label) }))}
            onChange={setPeriod}
          />
        </div>

        <label>
          <span className="field-label">{t('Amount')}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            className="field-input"
            value={amount ?? ''}
            onChange={(event) => setAmount(event.target.value === '' ? null : Number(event.target.value))}
          />
          <span className="field-hint mt-1 block">{t(PERIOD_HINTS[period])}</span>
        </label>

        {/* A rate and a percentage are two halves of one deal far more often
            than they are alternatives, so this sits beside the amount rather
            than replacing it. */}
        <label>
          <span className="field-label">{t('Plus a share of the takings')}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.5}
              className="field-input"
              placeholder={t('none')}
              value={percent ?? ''}
              onChange={(event) =>
                setPercent(event.target.value === '' ? null : Number(event.target.value))
              }
            />
            <span className="text-[0.95rem] font-semibold text-muted">%</span>
          </div>
          <span className="field-hint mt-1 block">
            {percent === null
              ? t('Leave empty for a rate alone. With a percentage, each day asks what the shift took.')
              : amount === null || amount === 0
                ? t('Percentage only: the pay is this share of what the shift takes.')
                : t('Paid on top of the rate, from what the shift takes that day.')}
          </span>
        </label>

        <div>
          <span className="field-label">{t('Tips')}</span>
          <Segmented
            value={tipSource}
            options={[
              { value: 'personal' as TipSource, label: t('Mine') },
              { value: 'pool' as TipSource, label: t('Share of the pool') },
            ]}
            onChange={setTipSource}
          />

          {tipSource === 'pool' ? (
            <label className="mt-2 block">
              <span className="field-label">{t('Your share of the pool')}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.5}
                  className="field-input"
                  value={poolShare ?? ''}
                  onChange={(event) =>
                    setPoolShare(event.target.value === '' ? null : Number(event.target.value))
                  }
                />
                <span className="text-[0.95rem] font-semibold text-muted">%</span>
              </div>
              <span className="field-hint mt-1 block">
                {t('Each day you enter what the room took; your cut is worked out from it.')}
              </span>
            </label>
          ) : (
            <span className="field-hint mt-1 block">
              {t('You enter what you were handed, and it is yours alone.')}
            </span>
          )}
        </div>

        {editing !== null && (
          <p className="field-hint">
            {t('Changing the rate also changes every day this shift is already on. To leave history alone, archive this one and create a replacement.')}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={name.trim() === ''} onClick={() => void submit()}>
            {t(editing === null ? 'Create shift' : 'Save changes')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
