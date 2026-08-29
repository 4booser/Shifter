'use client';

import { catalogueActions, useCalendar } from '@/lib/store/calendar';
import { DaySave } from '@/lib/calendar/models';
import { useMoney } from '@/lib/settings/money';
import { useI18n } from '@/lib/i18n';
import { Modal } from '@/components/ui/modal';

/**
 * Two devices edited one day; a person decides which evening survives.
 *
 * Both versions are shown whole and neither is merged: a silent merge of
 * money is the worst outcome there is, so the app refuses to be clever
 * exactly here. «Их» version is already on screen behind this modal — the
 * store reloaded it on refusal; «моё» waits in the store until chosen or
 * dropped.
 */
export function ConflictModal() {
  const { t } = useI18n();
  const { format } = useMoney();

  const conflict = useCalendar((state) => state.conflict);
  const theirs = useCalendar((state) =>
    state.conflict === null ? undefined : state.days.get(state.conflict.date),
  );

  if (conflict === null) return null;

  const mineSummary = summarise(conflict.mine);

  return (
    <Modal open title={t('This day was changed on another device')} onClose={() => catalogueActions.dropConflict()}>
      <div className="flex flex-col gap-3.5">
        <p className="field-hint">
          {t('Both versions are here, whole. Nothing is merged — you decide which one is the day.')}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <p className="mb-1 text-[0.78rem] font-bold uppercase tracking-wide text-faint">
              {t('On the other device')}
            </p>
            <p className="text-[0.9rem]">
              {theirs === undefined
                ? t('An empty day')
                : `${theirs.shifts.length} ${t('shift(s)')} · ${t('tips')} ${
                    theirs.tips === null ? t('unsaid') : format(theirs.tips)
                  }${theirs.note !== null ? ` · «${theirs.note}»` : ''}`}
            </p>
          </div>
          <div className="rounded-lg border border-(--accent) p-3">
            <p className="mb-1 text-[0.78rem] font-bold uppercase tracking-wide text-(--accent)">
              {t('Typed here')}
            </p>
            <p className="text-[0.9rem]">
              {`${mineSummary.shifts} ${t('shift(s)')} · ${t('tips')} ${
                mineSummary.tips === null ? t('unsaid') : format(mineSummary.tips)
              }${mineSummary.note !== null ? ` · «${mineSummary.note}»` : ''}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={() => catalogueActions.dropConflict()}>
            {t('Keep theirs')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void catalogueActions.overwriteConflict()}
          >
            {t('Write mine over it')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function summarise(mine: DaySave): { shifts: number; tips: number | null; note: string | null } {
  return { shifts: mine.shifts.length, tips: mine.tips, note: mine.note };
}
