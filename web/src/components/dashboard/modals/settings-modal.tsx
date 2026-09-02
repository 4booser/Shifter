'use client';

import { useEffect, useState } from 'react';

import { holidaysCountries } from './holiday-countries';
import { PushState, pushState, syncPush, testPush } from '@/lib/push';
import { useI18n, LANGS } from '@/lib/i18n';
import {
  ACCENT_PRESETS,
  CURRENCY_PRESETS,
  STATS_PERIODS,
  THEME_PRESETS,
} from '@/lib/settings/settings';
import { useSettings } from '@/lib/settings/store';
import { Segmented, Toggle } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

/** Every appearance and behaviour choice, in one sheet, grouped by question. */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const reset = useSettings((state) => state.reset);

  const [push, setPush] = useState<PushState>('off');
  const [tested, setTested] = useState(false);

  // Every change to the notification trio re-syncs the server's copy; the
  // state that comes back is what the hint under the toggles reports.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void pushState(settings).then((state) => !cancelled && setPush(state));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void syncPush(settings).then((state) => !cancelled && setPush(state));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.notifyTomorrow, settings.notifyUnclosed, settings.notifyPayday, settings.notifyDigest, settings.notifyOvertime, settings.notifyAt, settings.language]);

  return (
    <Modal open={open} title={t('Settings')} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {/* Language */}
        <section>
          <span className="field-label">{t('Language')}</span>
          <Segmented
            value={settings.language}
            options={LANGS.map((lang) => ({ value: lang.value, label: lang.label }))}
            onChange={(value) => update('language', value)}
          />
        </section>

        {/* Theme */}
        <section>
          <span className="field-label">{t('Theme')}</span>
          <div className="grid grid-cols-5 gap-1.5">
            {THEME_PRESETS.map((theme) => (
              <button
                key={theme.value}
                type="button"
                className={`rounded-(--radius) border p-1.5 text-[0.72rem] font-medium capitalize transition-colors ${
                  settings.theme === theme.value ? 'border-(--accent) ring-1 ring-(--ring)' : 'border-border hover:border-border-strong'
                }`}
                onClick={() => update('theme', theme.value)}
              >
                <span
                  className="mb-1 block h-6 rounded border border-border"
                  style={{
                    background:
                      theme.value === 'system'
                        ? 'linear-gradient(105deg,#f4f2ed 50%,#17181c 50%)'
                        : theme.value === 'light'
                          ? '#f4f2ed'
                          : theme.value === 'grey'
                            ? '#eef0f2'
                            : theme.value === 'sand'
                              ? '#f3ead9'
                              : theme.value === 'mint'
                                ? '#e9f1ec'
                                : theme.value === 'dark'
                                  ? '#1f2126'
                                  : theme.value === 'night'
                                    ? '#0b0c10'
                                    : theme.value === 'ocean'
                                      ? '#0a1420'
                                      : theme.value === 'plum'
                                        ? '#150f1d'
                                        : 'linear-gradient(135deg,#3b2b66,#0b0c10 70%)',
                  }}
                />
                {t(theme.label)}
              </button>
            ))}
          </div>
        </section>

        {/* Accent */}
        <section>
          <span className="field-label">{t('Accent')}</span>
          <div className="flex flex-wrap gap-1.5">
            {ACCENT_PRESETS.map((accent, index) => (
              <button
                key={index}
                type="button"
                className={`swatch ${settings.accent === accent.value ? 'is-active' : ''}`}
                style={{ background: accent.value }}
                title={accent.label}
                onClick={() => update('accent', accent.value)}
              />
            ))}
            <input
              type="color"
              className="swatch cursor-pointer border !border-border"
              value={settings.accent}
              onChange={(event) => update('accent', event.target.value)}
              aria-label={t('Custom colour')}
            />
          </div>
        </section>

        {/* Money */}
        <section className="flex flex-col gap-2.5">
          <span className="field-label">{t('Money')}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {CURRENCY_PRESETS.map((currency) => (
              <button
                key={currency}
                type="button"
                className={`btn btn-sm ${settings.currency === currency ? 'btn-primary' : ''}`}
                onClick={() => update('currency', currency)}
              >
                {currency}
              </button>
            ))}
            <input
              className="field-input !w-16"
              maxLength={4}
              value={settings.currency}
              onChange={(event) => update('currency', event.target.value)}
              aria-label={t('Currency')}
            />
          </div>
          <Toggle on={settings.currencyBefore} onChange={(value) => update('currencyBefore', value)} label={t('Symbol before the amount')} />

          {/* Separate from the symbol above, which is only how money is
              printed. This is the currency two jobs in two countries get
              added up in, and it has to be a code the bank quotes. */}
          <label className="block">
            <span className="field-label">{t('Add different currencies up in')}</span>
            <div className="flex flex-wrap gap-1.5">
              {['UAH', 'PLN', 'EUR', 'USD', 'CZK', 'GBP'].map((code) => (
                <button
                  key={code}
                  type="button"
                  className={`btn btn-sm ${settings.baseCurrency === code ? 'btn-primary' : ''}`}
                  onClick={() => update('baseCurrency', code)}
                >
                  {code}
                </button>
              ))}
              <button
                type="button"
                className={`btn btn-sm ${settings.baseCurrency === '' ? 'btn-primary' : ''}`}
                onClick={() => update('baseCurrency', '')}
              >
                {t('Do not')}
              </button>
            </div>
            <span className="field-hint mt-1 block">
              {t('Only matters if you work somewhere paid in another currency. Converted at the National Bank’s rate, which is shown beside the figure.')}
            </span>
          </label>
          <Segmented
            value={settings.moneyDecimals}
            options={[
              { value: 0 as const, label: t('Whole numbers') },
              { value: 2 as const, label: t('To the cent') },
            ]}
            onChange={(value) => update('moneyDecimals', value)}
          />
          <Toggle on={settings.groupThousands} onChange={(value) => update('groupThousands', value)} label={t('Group thousands')} />
        </section>

        {/* Calendar */}
        <section className="flex flex-col gap-2.5">
          <span className="field-label">{t('Calendar')}</span>
          <Toggle on={settings.mondayFirst} onChange={(value) => update('mondayFirst', value)} label={t('Week starts on Monday')} />
          <Toggle on={settings.highlightWeekends} onChange={(value) => update('highlightWeekends', value)} label={t('Highlight weekends')} />
          <Toggle on={settings.showShiftNamesInCells} onChange={(value) => update('showShiftNamesInCells', value)} label={t('Shift names in cells')} />
          <Toggle on={settings.showEarningsInCells} onChange={(value) => update('showEarningsInCells', value)} label={t('Earnings in cells')} />
          <Toggle on={settings.confirmBulk} onChange={(value) => update('confirmBulk', value)} label={t('Confirm before painting many days')} />

          <div>
            <span className="field-hint">{t('Times in cells')}</span>
            <Segmented
              value={settings.cellTimes}
              options={[
                { value: 'none' as const, label: t('None') },
                { value: 'start' as const, label: t('Start') },
                { value: 'range' as const, label: t('Start and end') },
              ]}
              onChange={(value) => update('cellTimes', value)}
            />
          </div>

          <div>
            <span className="field-hint">{t('How a coloured day is drawn')}</span>
            <div className="seg flex-wrap">
              {(['outline', 'corner', 'underline', 'edge', 'wash', 'full'] as const).map((fill) => (
                <button
                  key={fill}
                  type="button"
                  className={`seg-btn ${settings.dayFill === fill ? 'is-active' : ''}`}
                  onClick={() => update('dayFill', fill)}
                >
                  {t(fill.charAt(0).toUpperCase() + fill.slice(1))}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="field-hint">{t('How a shift is drawn')}</span>
            <Segmented
              value={settings.shiftLook}
              options={[
                { value: 'dot' as const, label: t('Dot') },
                { value: 'mark' as const, label: t('Emoji') },
                { value: 'chip' as const, label: t('Chip') },
                { value: 'bar' as const, label: t('Solid') },
              ]}
              onChange={(value) => update('shiftLook', value)}
            />
          </div>

          <label>
            <span className="field-hint">{t('Public holidays')}</span>
            <select
              className="field-input"
              value={settings.holidayCountry}
              onChange={(event) => update('holidayCountry', event.target.value)}
            >
              <option value="">{t('None')}</option>
              {holidaysCountries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Notifications */}
        <section className="flex flex-col gap-2.5">
          <span className="field-label">{t('Notifications')}</span>
          <Toggle
            on={settings.notifyTomorrow}
            onChange={(value) => update('notifyTomorrow', value)}
            label={t('Remind about tomorrow’s shift')}
            hint={t('The evening before, on this device.')}
          />
          <Toggle
            on={settings.notifyUnclosed}
            onChange={(value) => update('notifyUnclosed', value)}
            label={t('Nudge about days left open')}
            hint={t('A worked day with no tips or sales on it.')}
          />
          <Toggle
            on={settings.notifyPayday}
            onChange={(value) => update('notifyPayday', value)}
            label={t('Payday heads-up')}
            hint={t('Mid-morning, when a pay period lands.')}
          />
          <Toggle
            on={settings.clockOutChime}
            onChange={(value) => update('clockOutChime', value)}
            label={t('Chime when a shift lands')}
            hint={t('A short sound and a buzz at clock-out.')}
          />
          <Toggle
            on={settings.notifyDigest}
            onChange={(value) => update('notifyDigest', value)}
            label={t('Weekly digest')}
            hint={t('Sunday evening: shifts, hours, money, trend.')}
          />
          <Toggle
            on={settings.notifyOvertime}
            onChange={(value) => update('notifyOvertime', value)}
            label={t('Overtime guard')}
            hint={t('«38 of 40 hours» — while the week can still be changed.')}
          />
          {(settings.notifyTomorrow || settings.notifyUnclosed || settings.notifyPayday || settings.notifyDigest || settings.notifyOvertime) && (
            <>
              <label>
                <span className="field-hint">{t('Send at')}</span>
                <input
                  type="time"
                  className="field-input !w-28"
                  value={settings.notifyAt}
                  onChange={(event) => event.target.value && update('notifyAt', event.target.value)}
                />
              </label>
              <p className="field-hint">
                {push === 'denied' && t('The browser has blocked notifications for this site.')}
                {push === 'unsupported' && t('This browser cannot show push notifications.')}
                {push === 'on' && t('This device is subscribed.')}
              </p>
              {push === 'on' && (
                <button
                  type="button"
                  className="btn btn-sm self-start"
                  disabled={tested}
                  onClick={() => {
                    setTested(true);
                    void testPush().finally(() => setTimeout(() => setTested(false), 4000));
                  }}
                >
                  {tested ? t('Sent — check the notification') : t('Send a test')}
                </button>
              )}
            </>
          )}
        </section>

        {/* Interface */}
        <section className="flex flex-col gap-2.5">
          <span className="field-label">{t('Interface')}</span>
          <Segmented
            value={settings.density}
            options={[
              { value: 'comfortable' as const, label: t('Comfortable') },
              { value: 'compact' as const, label: t('Compact') },
            ]}
            onChange={(value) => update('density', value)}
          />
          <span className="field-hint">
            {t('Compact fits a whole month on a laptop screen without scrolling.')}
          </span>
          <label>
            <span className="field-hint">
              {t('Corner rounding')}: {settings.roundness}px
            </span>
            <input
              type="range"
              min={0}
              max={22}
              className="w-full"
              value={settings.roundness}
              onChange={(event) => update('roundness', Number(event.target.value))}
            />
          </label>
          <label>
            <span className="field-hint">
              {t('Text size')}: {settings.fontScale}px
            </span>
            <input
              type="range"
              min={13}
              max={18}
              className="w-full"
              value={settings.fontScale}
              onChange={(event) => update('fontScale', Number(event.target.value))}
            />
          </label>
          <Toggle on={settings.glass} onChange={(value) => update('glass', value)} label={t('Glass surfaces')} />
          <Toggle on={settings.reduceMotion} onChange={(value) => update('reduceMotion', value)} label={t('Reduce motion')} />
          <Toggle on={settings.remindUnclosed} onChange={(value) => update('remindUnclosed', value)} label={t('Banner about open days on the calendar')} />
        </section>

        {/* Statistics */}
        <section>
          <span className="field-label">{t('Statistics opens on')}</span>
          <div className="seg flex-wrap">
            {STATS_PERIODS.map((period) => (
              <button
                key={period.value}
                type="button"
                className={`seg-btn ${settings.statsPeriod === period.value ? 'is-active' : ''}`}
                onClick={() => update('statsPeriod', period.value)}
              >
                {t(period.label)}
              </button>
            ))}
          </div>
        </section>

        <div className="flex justify-between">
          <button type="button" className="btn btn-quiet !text-danger" onClick={reset}>
            {t('Reset to defaults')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('Done')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
