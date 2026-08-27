'use client';

import { useCallback, useEffect, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { PayslipCheck, PayslipLine } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { Alert, Money } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

/**
 * The payslip, line against line.
 *
 * The payouts page already says whether a period came up short. That is an
 * argument: two totals that disagree, and no way to tell which of them is
 * wrong. This says *where* — every line carries the arithmetic that produced
 * it, in the units a payslip is written in, so "the night hours are missing:
 * 6 ч × 200 × 0,2" replaces "they owe me ₴1 440".
 *
 * A report is read; a checklist is walked. The difference is whether it ends
 * in a conversation with a manager.
 */
const LABEL: Record<PayslipLine['kind'], string> = {
  base: 'Hours at the rate',
  extras: 'Salary, overtime and premiums',
  revenue: 'Percentage of takings',
  tips: 'Tips',
  tip_out: 'Handed on',
  meals: 'Staff meals',
  fines: 'Fines and shortfalls',
  tax: 'Withheld',
};

export function PayslipCheckModal({
  open,
  locationId,
  on,
  onClose,
}: {
  open: boolean;
  locationId: number | null;
  on: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { formatIn } = useMoney();

  const [check, setCheck] = useState<PayslipCheck | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!open || locationId === null) return;

    setError(null);
    setSaid({});

    void calendarApi
      .payslipCheck(locationId, on)
      .then(setCheck)
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, [open, locationId, on]);

  useEffect(load, [load]);

  const amount = (value: number) => formatIn(check?.currency ?? null, value);

  /**
   * Only the lines somebody has actually typed a figure into, and only where
   * it differs. A blank field is not a claim of zero — that distinction is the
   * whole reason this asks rather than assumes.
   */
  const gaps = (check?.lines ?? [])
    .map((line, index) => {
      const typed = said[`${index}`];

      if (typed === undefined || typed.trim() === '') return null;

      const paper = Number(typed.replace(',', '.'));

      if (!Number.isFinite(paper)) return null;

      const difference = Math.round((paper - line.amount) * 100) / 100;

      return difference === 0 ? null : { line, paper, difference };
    })
    .filter((entry) => entry !== null);

  const summary = gaps
    .map(
      (gap) =>
        `${t(LABEL[gap.line.kind])}: ${amount(gap.line.amount)} (${gap.line.formula})` +
        ` → ${amount(gap.paper)}, ${gap.difference < 0 ? t('short by') : t('over by')} ${amount(
          Math.abs(gap.difference),
        )}`,
    )
    .join('\n');

  return (
    <Modal open={open} title={t('Check the payslip')} onClose={onClose} wide>
      <div className="flex flex-col gap-3.5">
        {error && <Alert>{error}</Alert>}

        {check === null ? (
          <p className="field-hint">{t('Loading…')}</p>
        ) : (
          <>
            <p className="field-hint">
              {check.location_name} · {check.period_from} — {check.period_to} ·{' '}
              {Math.round(check.hours)} {t('hours')} · {check.days_worked} {t('shifts')}
            </p>

            <p className="field-hint">
              {t('What the app worked out is on the left. Put what the payslip says on the right — only where they differ.')}
            </p>

            <div className="table-scroll overflow-x-auto">
              <table className="w-full text-[0.86rem]">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">{t('Line')}</th>
                    <th className="px-2 py-1.5 font-medium">{t('How it is worked out')}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t('The app')}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t('The payslip')}</th>
                  </tr>
                </thead>
                <tbody>
                  {check.lines.map((line, index) => (
                    <tr key={`${line.kind}-${index}`} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        {t(LABEL[line.kind])}
                        {line.deducted && <span className="chip ml-1.5 text-muted">−</span>}
                      </td>
                      <td className="px-2 py-1.5 tabular text-muted">{line.formula}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular">
                        {amount(line.amount)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          className="field-input w-28 text-right"
                          aria-label={`${t(LABEL[line.kind])} — ${t('The payslip')}`}
                          value={said[`${index}`] ?? ''}
                          onChange={(event) =>
                            setSaid((was) => ({ ...was, [`${index}`]: event.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-bold">
                    <td className="px-2 py-1.5">{t('Take-home')}</td>
                    <td className="px-2 py-1.5 text-muted">
                      {t('everything above, added and taken off')}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular">{amount(check.net)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            {check.holiday_accrued > 0 && (
              <p className="field-hint">
                {t('Holiday accrued over this period:')} <Money value={check.holiday_accrued} currency={check.currency} />.{' '}
                {t('Owed later, and never part of the figure above.')}
              </p>
            )}

            {gaps.length > 0 && (
              <div className="rounded-(--radius) border border-danger/40 bg-(--danger-soft) p-3">
                <p className="mb-1.5 text-[0.9rem] font-bold text-danger">
                  {t('What does not match')}
                </p>
                <ul className="flex flex-col gap-1 text-[0.85rem]">
                  {gaps.map((gap, index) => (
                    <li key={index}>
                      <b>{t(LABEL[gap.line.kind])}</b> — {gap.line.formula} ={' '}
                      {amount(gap.line.amount)}, {t('the payslip says')} {amount(gap.paper)}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-sm mt-2.5"
                  onClick={() => void navigator.clipboard.writeText(summary)}
                >
                  {t('Copy this to send')}
                </button>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
