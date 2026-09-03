'use client';

import { useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { formatPeriod, todayKey } from '@/lib/calendar/calendar-date';
import { MARK_COLOURS, PAY_PERIODS, PayPeriodKind, WorkLocation } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { catalogueActions, useCalendar } from '@/lib/store/calendar';
import { Alert, SwatchRow } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { confirmDeleteLocation } from './location-delete';

const today = () => todayKey();

/**
 * The place manager: the list, the form, and every rule that lives on a place
 * — pay cycle, overtime, tip-out, meals, tax, holiday, currency, and the
 * separate commission cycle.
 */
export function LocationModal({
  open,
  editLocation,
  onClose,
}: {
  open: boolean;
  editLocation: WorkLocation | null;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const allLocations = useCalendar((state) => state.locations);
  const locations = allLocations.filter((location) => !location.archived);
  const archived = allLocations.filter((location) => location.archived);

  const [editing, setEditing] = useState<WorkLocation | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [colour, setColour] = useState('#1F3A5F');
  const [period, setPeriod] = useState<PayPeriodKind>('monthly');
  const [payDay, setPayDay] = useState(1);
  const [anchor, setAnchor] = useState(today());
  const [salesPeriod, setSalesPeriod] = useState<PayPeriodKind | ''>('');
  const [salesPayDay, setSalesPayDay] = useState(1);
  const [salesAnchor, setSalesAnchor] = useState(today());
  const [overtimeHours, setOvertimeHours] = useState(40);
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(1.5);
  const [nightMultiplier, setNightMultiplier] = useState(1);
  const [nightFrom, setNightFrom] = useState('22:00');
  const [nightTo, setNightTo] = useState('06:00');
  const [holidayMultiplier, setHolidayMultiplier] = useState(1);
  const [holidayCountry, setHolidayCountry] = useState('');
  const [tipOutTips, setTipOutTips] = useState(0);
  const [tipOutSales, setTipOutSales] = useState(0);
  const [mealDeduction, setMealDeduction] = useState(0);
  const [breakAfter, setBreakAfter] = useState(0);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [floor, setFloor] = useState(0);
  const [commuteMinutes, setCommuteMinutes] = useState(0);
  const [commuteCost, setCommuteCost] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [taxTips, setTaxTips] = useState(false);
  const [holidayPercent, setHolidayPercent] = useState(0);
  const [currency, setCurrency] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEditing(null);
    setName('');
    setAddress('');
    setCoords(null);
    setColour('#1F3A5F');
    setPeriod('monthly');
    setPayDay(1);
    setAnchor(today());
    setSalesPeriod('');
    setSalesPayDay(1);
    setSalesAnchor(today());
    setOvertimeHours(40);
    setOvertimeMultiplier(1.5);
    setTipOutTips(0);
    setTipOutSales(0);
    setMealDeduction(0);
    setBreakAfter(0);
    setBreakMinutes(0);
    setFloor(0);
    setTaxPercent(0);
    setTaxTips(false);
    setHolidayPercent(0);
    setCurrency('');
  };

  const edit = (location: WorkLocation) => {
    setEditing(location);
    setName(location.name);
    setAddress(location.address ?? '');
    setCity(location.city ?? '');
    setCoords(
      location.latitude !== null && location.longitude !== null
        ? { lat: location.latitude, lng: location.longitude }
        : null,
    );
    setColour(location.colour);
    setPeriod(location.pay_period);
    setPayDay(location.pay_day);
    setAnchor(location.pay_anchor);
    setSalesPeriod(location.sales_pay_period ?? '');
    setSalesPayDay(location.sales_pay_day ?? 1);
    setSalesAnchor(location.sales_pay_anchor ?? today());
    setOvertimeHours(location.overtime_weekly_hours);
    setOvertimeMultiplier(location.overtime_multiplier);
    setNightMultiplier(location.night_multiplier ?? 1);
    setNightFrom(location.night_from ?? '22:00');
    setNightTo(location.night_to ?? '06:00');
    setHolidayMultiplier(location.public_holiday_multiplier ?? 1);
    setHolidayCountry(location.holiday_country ?? '');
    setTipOutTips(location.tip_out_of_tips_percent);
    setTipOutSales(location.tip_out_of_sales_percent);
    setMealDeduction(location.meal_deduction);
    setBreakAfter(location.auto_break_after_hours);
    setBreakMinutes(location.auto_break_minutes);
    setFloor(location.minimum_hourly);
    setCommuteMinutes(location.commute_minutes ?? 0);
    setCommuteCost(location.commute_cost ?? 0);
    setTaxPercent(location.tax_percent);
    setTaxTips(location.tax_tips);
    setHolidayPercent(location.holiday_percent);
    setCurrency(location.currency);
  };

  useEffect(() => {
    if (!open) return;

    setError(null);

    if (editLocation === null) reset();
    else edit(editLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editLocation]);

  /** Only the rolling periods need a reference date; the rest use a day number. */
  const needsAnchor = period === 'biweekly' || period === 'weekly';
  const needsPayDay = period === 'monthly';
  const salesNeedsAnchor = salesPeriod === 'biweekly' || salesPeriod === 'weekly';
  const salesNeedsPayDay = salesPeriod === 'monthly';

  const submit = async () => {
    if (name.trim() === '') return;

    try {
      await catalogueActions.saveLocation(
        {
          name,
          address: address.trim() === '' ? null : address,
          city: city.trim(),
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          colour,
          pay_period: period,
          pay_day: needsPayDay ? payDay : 1,
          pay_anchor: needsAnchor && anchor !== '' ? anchor : null,
          overtime_weekly_hours: overtimeHours,
          overtime_multiplier: overtimeMultiplier,
          night_multiplier: nightMultiplier,
          night_from: nightFrom,
          night_to: nightTo,
          public_holiday_multiplier: holidayMultiplier,
          holiday_country: holidayCountry,
          tip_out_of_tips_percent: tipOutTips,
          tip_out_of_sales_percent: tipOutSales,
          meal_deduction: mealDeduction,
          auto_break_after_hours: breakAfter,
          auto_break_minutes: breakMinutes,
          minimum_hourly: floor,
          commute_minutes: commuteMinutes,
          commute_cost: commuteCost,
          tax_percent: taxPercent,
          tax_tips: taxTips,
          holiday_percent: holidayPercent,
          currency: currency.trim() === '' ? null : currency.trim().toUpperCase(),
          sales_pay_period: salesPeriod,
          sales_pay_day: salesNeedsPayDay ? salesPayDay : 1,
          sales_pay_anchor: salesNeedsAnchor && salesAnchor !== '' ? salesAnchor : null,
        },
        editing?.id ?? null,
      );
      reset();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  };

  const num = (setter: (value: number) => void) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setter(Number(event.target.value) || 0);

  return (
    <Modal open={open} title={t(editing === null ? 'Places of work' : 'Edit place')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {error && <Alert>{error}</Alert>}

        {locations.length > 0 && (
          <ul className="flex flex-col gap-1">
            {locations.map((location) => (
              <li key={location.id} className="flex items-center gap-2 rounded-(--radius) border border-border px-2.5 py-1.5">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: location.colour }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.88rem] font-medium" title={location.name}>{location.name}</span>
                  {/* «2026-09-01 – 2026-09-15» is how a database says it.
                      The payout list learned this months ago; this list, on
                      the same fact, had not. */}
                  <span className="field-hint tabular">
                    {formatPeriod(location.current_period_from, location.current_period_to, lang)}
                  </span>
                </span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => edit(location)} aria-label={t('Edit')}>
                  <Icon name="brush" size={13} />
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => void catalogueActions.archiveLocation(location.id, true)}
                  aria-label={t('Archive')}
                >
                  <Icon name="close" size={13} />
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm btn-danger"
                  onClick={() => confirmDeleteLocation(t, location)}
                  aria-label={t('Delete')}
                >
                  <Icon name="trash" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label>
          <span className="field-label">{t('Name')}</span>
          <input className="field-input" value={name} placeholder="Bar" onChange={(event) => setName(event.target.value)} />
        </label>

        <label>
          <span className="field-label">{t('City')}</span>
          <input
            className="field-input"
            value={city}
            placeholder={t('For comparing your seasons — optional')}
            onChange={(event) => setCity(event.target.value)}
          />
        </label>

        <label>
          <span className="field-label">{t('Address')}</span>
          <input className="field-input" value={address} onChange={(event) => setAddress(event.target.value)} />
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="btn btn-sm"
              disabled={locating}
              onClick={() => {
                setLocating(true);
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
                    setLocating(false);
                  },
                  () => setLocating(false),
                  { enableHighAccuracy: true, timeout: 10_000 },
                );
              }}
            >
              📍 {locating ? '…' : t(coords === null ? 'I am here now' : 'I am here — update')}
            </button>
            {coords !== null && (
              <>
                <span className="field-hint tabular">
                  {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                </span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setCoords(null)}>
                  {t('Clear')}
                </button>
              </>
            )}
          </span>
          <span className="field-hint">{t('With a pin, the app offers to start a shift when you open it at the place.')}</span>
        </label>

        <div>
          <span className="field-label">{t('Colour')}</span>
          <SwatchRow colours={MARK_COLOURS} saveable value={colour} onPick={setColour} />
        </div>

        <div>
          <span className="field-label">{t('Pays')}</span>
          <div className="seg flex-wrap">
            {PAY_PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`seg-btn ${period === option.value ? 'is-active' : ''}`}
                onClick={() => setPeriod(option.value)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </div>

        {needsPayDay && (
          <label>
            <span className="field-label">{t('Payday')}</span>
            <input type="number" min={1} max={28} className="field-input" value={payDay} onChange={num(setPayDay)} inputMode="decimal" />
            <span className="field-hint mt-1 block">{t('Day of the month a period starts. 1 gives plain calendar months.')}</span>
          </label>
        )}

        {needsAnchor && (
          <label>
            <span className="field-label">{t('A date the cycle passed through')}</span>
            <input type="date" className="field-input" value={anchor} onChange={(event) => setAnchor(event.target.value)} />
            <span className="field-hint mt-1 block">{t('Any past payday works; the cycle counts from it.')}</span>
          </label>
        )}

        <div>
          <span className="field-label">{t('Sales commission pays')}</span>
          <div className="seg flex-wrap">
            <button type="button" className={`seg-btn ${salesPeriod === '' ? 'is-active' : ''}`} onClick={() => setSalesPeriod('')}>
              {t('With the wage')}
            </button>
            {PAY_PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`seg-btn ${salesPeriod === option.value ? 'is-active' : ''}`}
                onClick={() => setSalesPeriod(option.value)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
          <span className="field-hint mt-1 block">{t('For a wage paid twice a month against a percentage paid once.')}</span>
        </div>

        {salesNeedsPayDay && (
          <label>
            <span className="field-label">{t('Commission payday')}</span>
            <input type="number" min={1} max={28} className="field-input" value={salesPayDay} onChange={num(setSalesPayDay)} inputMode="decimal" />
          </label>
        )}

        {salesNeedsAnchor && (
          <label>
            <span className="field-label">{t('A date the commission cycle passed through')}</span>
            <input type="date" className="field-input" value={salesAnchor} onChange={(event) => setSalesAnchor(event.target.value)} />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('Overtime after, hours a week')}</span>
            <input type="number" min={1} max={168} className="field-input" value={overtimeHours} onChange={num(setOvertimeHours)} inputMode="decimal" />
          </label>
          <label>
            <span className="field-label">{t('Paid at')}</span>
            <input type="number" min={1} max={5} step={0.1} className="field-input" value={overtimeMultiplier} onChange={num(setOvertimeMultiplier)} />
          </label>
        </div>

        {/* Night and holiday premiums: off until somebody turns them on, so
            a place that never agreed to them is priced exactly as before. */}
        <div className="rounded-(--radius) border border-border bg-surface-2/40 p-3">
          <span className="field-label">{t('Night and holiday premiums')}</span>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            <label>
              <span className="field-hint">{t('Night pays')}</span>
              <input type="number" min={1} max={3} step={0.05} className="field-input w-full" value={nightMultiplier} onChange={num(setNightMultiplier)} inputMode="decimal" />
            </label>
            <label>
              <span className="field-hint">{t('Night from')}</span>
              <input type="time" className="field-input w-full" value={nightFrom} onChange={(event) => setNightFrom(event.target.value)} />
            </label>
            <label>
              <span className="field-hint">{t('until')}</span>
              <input type="time" className="field-input w-full" value={nightTo} onChange={(event) => setNightTo(event.target.value)} />
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label>
              <span className="field-hint">{t('Public holiday pays')}</span>
              <input type="number" min={1} max={3} step={0.1} className="field-input w-full" value={holidayMultiplier} onChange={num(setHolidayMultiplier)} inputMode="decimal" />
            </label>
            <label>
              <span className="field-hint">{t('Holiday calendar')}</span>
              <select className="field-input w-full" value={holidayCountry} onChange={(event) => setHolidayCountry(event.target.value)}>
                <option value="">{t('none')}</option>
                {['UA', 'PL', 'DE', 'GB', 'US', 'CA'].map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="field-hint mt-1.5">
            {nightMultiplier <= 1 && holidayMultiplier <= 1
              ? t('Both at 1 — this place pays no premiums.')
              : t('A holiday shift takes the holiday rate on all its hours; the night rate applies to night hours only.')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('Tip-out, % of tips')}</span>
            <input type="number" min={0} max={100} step={0.5} className="field-input" value={tipOutTips} onChange={num(setTipOutTips)} inputMode="decimal" />
          </label>
          <label>
            <span className="field-label">{t('Tip-out, % of sales')}</span>
            <input type="number" min={0} max={100} step={0.5} className="field-input" value={tipOutSales} onChange={num(setTipOutSales)} />
          </label>
        </div>

        <label>
          <span className="field-label">{t('Staff meal, per day worked')}</span>
          <input type="number" min={0} step={10} className="field-input" value={mealDeduction} onChange={num(setMealDeduction)} inputMode="decimal" />
        </label>

        {/* A house rule nobody re-types per shift. Both halves or neither:
            a threshold with no minutes cannot fire. */}
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('Break after, h')}</span>
            <input type="number" min={0} max={24} step={0.5} className="field-input" value={breakAfter} onChange={num(setBreakAfter)} inputMode="decimal" />
          </label>
          <label>
            <span className="field-label">{t('Break length, min')}</span>
            <input type="number" min={0} max={480} step={5} className="field-input" value={breakMinutes} onChange={num(setBreakMinutes)} />
          </label>
        </div>
        {breakAfter > 0 && breakMinutes > 0 && (
          <p className="field-hint -mt-1">
            {t('A shift longer than this loses those minutes, unpaid, unless the template already books more.')}
          </p>
        )}

        <label>
          <span className="field-label">{t('Your floor, per hour')}</span>
          <input type="number" min={0} step={10} className="field-input" value={floor} onChange={num(setFloor)} inputMode="decimal" />
          <span className="field-hint mt-1 block">
            {t('Days here that pay less per hour get flagged. Your own line, not a legal one.')}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('Journey here, minutes one way')}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={600}
              step={5}
              className="field-input"
              value={commuteMinutes}
              onChange={num(setCommuteMinutes)}
            />
          </label>
          <label>
            <span className="field-label">{t('One trip costs')}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={5}
              className="field-input"
              value={commuteCost}
              onChange={num(setCommuteCost)}
            />
          </label>
        </div>
        <p className="field-hint -mt-1">
          {t('Used only to show what an hour here is really worth. Never added to what you earned.')}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('Tax withheld, %')}</span>
            <input type="number" min={0} max={100} step={0.5} className="field-input" value={taxPercent} onChange={num(setTaxPercent)} inputMode="decimal" />
          </label>
          <label>
            <span className="field-label">{t('Holiday pay accrual, %')}</span>
            <input type="number" min={0} max={100} step={0.5} className="field-input" value={holidayPercent} onChange={num(setHolidayPercent)} />
          </label>
        </div>

        <label className="flex items-center gap-2 text-[0.88rem]">
          <input type="checkbox" checked={taxTips} onChange={(event) => setTaxTips(event.target.checked)} />
          {t('Tips are taxed here too')}
        </label>

        <label>
          <span className="field-label">{t('Currency, three letters')}</span>
          <input className="field-input uppercase" maxLength={3} placeholder="EUR" value={currency} onChange={(event) => setCurrency(event.target.value)} />
          <span className="field-hint mt-1 block">{t('Leave empty to use the app currency.')}</span>
        </label>

        {archived.length > 0 && (
          <div>
            <span className="field-label">{t('Archived')}</span>
            <ul className="flex flex-col gap-1">
              {archived.map((location) => (
                <li key={location.id} className="flex items-center gap-2 rounded-(--radius) border border-border px-2.5 py-1.5 opacity-70">
                  <span className="min-w-0 flex-1 truncate text-[0.85rem]" title={location.name}>{location.name}</span>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => void catalogueActions.archiveLocation(location.id, false)}
                  >
                    {t('Restore')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('Close')}
          </button>
          <button type="button" className="btn btn-primary" disabled={name.trim() === ''} onClick={() => void submit()}>
            {t(editing === null ? 'Add place' : 'Save changes')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
