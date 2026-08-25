'use client';

import { useEffect, useMemo, useState } from 'react';

import { todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/lib/settings/store';
import {
  calendarActions,
  loadCatalogues,
  reload,
  undo,
  useCalendar,
} from '@/lib/store/calendar';
import { Shell } from '@/components/layout/shell';
import { DayPanel } from '@/components/dashboard/day-panel';
import { MonthGrid } from '@/components/dashboard/month-grid';
import { Sidebar } from '@/components/dashboard/sidebar';
import { InsightsPanel } from '@/components/dashboard/insights-panel';
import { TileStrip } from '@/components/dashboard/tiles';
import { PALETTE_EVENT } from '@/components/command/palette';
import { useReveal } from '@/lib/fx';
import { SearchModal } from '@/components/dashboard/modals/search-modal';
import { SettingsModal } from '@/components/dashboard/modals/settings-modal';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

export default function DashboardPage() {
  return (
    <Shell>
      <Dashboard />
    </Shell>
  );
}

function Dashboard() {
  const { t } = useI18n();
  const revealHost = useReveal<HTMLDivElement>();
  const state = useCalendar();
  const settings = useSettings((sel) => sel.settings);
  const view = useSettings((sel) => sel.settings.view);
  const mondayFirst = useSettings((sel) => sel.settings.mondayFirst);

  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  useEffect(() => {
    void loadCatalogues();
    reload();
  }, []);

  // The grid spills into neighbouring months and follows the view setting.
  useEffect(() => {
    reload();
  }, [view, mondayFirst]);

  // The command palette owns Cmd+K and forwards page actions over an event.
  useEffect(() => {
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;

      if (detail === 'search') setSearchOpen(true);
      if (detail === 'settings') setSettingsOpen(true);
      if (detail === 'today') calendarActions.today();
    };

    addEventListener(PALETTE_EVENT, onCommand);

    return () => removeEventListener(PALETTE_EVENT, onCommand);
  }, []);

  /**
   * Past days with a worked shift and nothing else recorded. Tips and sales
   * are entered at the end of a shift and are the easiest thing to forget.
   */
  const unclosed = useMemo(() => {
    const today = todayKey();

    return [...state.days.values()]
      .filter(
        (day) =>
          day.date < today &&
          day.shifts.some((entry) => entry.worked) &&
          (day.tips ?? 0) === 0 &&
          day.sales.length === 0,
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.days]);

  const needsSetup =
    state.locations.filter((location) => !location.archived).length === 0 ||
    state.templates.filter((template) => !template.archived).length === 0;

  return (
    <div ref={revealHost} className="flex flex-col gap-3">
      {state.error !== null && <Alert onDismiss={calendarActions.clearError}>{state.error}</Alert>}

      {settings.remindUnclosed && unclosed.length > 0 && !reminderDismissed && (
        <Alert kind="info" onDismiss={() => setReminderDismissed(true)}>
          <span className="flex flex-wrap items-center gap-2">
            <Icon name="clock" size={14} />
            {unclosed.length} {t('worked days have no tips or sales recorded')}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => calendarActions.select(unclosed[unclosed.length - 1].date)}
            >
              {t('Open the oldest')}
            </button>
          </span>
        </Alert>
      )}

      {needsSetup && <Onboarding />}

      {!needsSetup && <TileStrip />}
      {!needsSetup && <InsightsPanel />}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <Sidebar />
        <div className="order-1 min-w-0 flex-1 lg:order-none">
          <MonthGrid onSearch={() => setSearchOpen(true)} onSettings={() => setSettingsOpen(true)} />
        </div>
        <div className="order-2 w-full flex-none lg:order-none lg:w-72 xl:w-80">
          <DayPanel />
        </div>
      </div>

      {/* Undo, floating over the calendar where the change happened. */}
      {state.undo !== null && (
        <div className="fixed bottom-16 left-1/2 z-50 -translate-x-1/2 md:bottom-6">
          <div className="card flex items-center gap-3 px-4 py-2.5 shadow-(--shadow-lg)">
            <Icon name="repeat" size={15} className="text-muted" />
            <span className="text-[0.88rem]">{t(state.undo.label)}</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void undo()}>
              {t('Undo')}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" aria-label={t('Dismiss')} onClick={calendarActions.dismissUndo}>
              <Icon name="close" size={13} />
            </button>
          </div>
        </div>
      )}

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** The checklist a brand new account sees instead of an empty calendar. */
function Onboarding() {
  const { t } = useI18n();
  const state = useCalendar();

  const steps = [
    {
      done: state.locations.some((location) => !location.archived),
      title: t('Add where you work'),
      hint: t('Pay period, overtime, tip-out and meals live on the place.'),
    },
    {
      done: state.templates.some((template) => !template.archived),
      title: t('Create a shift'),
      hint: t('Times and rate once; after that it is one tap per day.'),
    },
    {
      done: state.days.size > 0,
      title: t('Paint it onto the calendar'),
      hint: t('Pick the shift, then drag across the days you work.'),
    },
  ];

  return (
    <section className="card rise p-4">
      <h2 className="mb-1 text-[1.05rem] font-bold">👋 {t('Let us set this up')}</h2>
      <p className="field-hint mb-3">{t('Three steps, and the calendar starts counting for you.')}</p>
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={index}
            className={`flex gap-2.5 rounded-(--radius) border p-2.5 ${step.done ? 'border-good/40 bg-(--good-soft)' : 'border-border'}`}
          >
            <span
              className={`grid h-6 w-6 flex-none place-items-center rounded-full text-[0.8rem] font-bold ${
                step.done ? 'bg-good text-white' : 'bg-surface-2'
              }`}
            >
              {step.done ? <Icon name="check" size={13} /> : index + 1}
            </span>
            <span className="min-w-0">
              <strong className="block text-[0.88rem]">{step.title}</strong>
              <span className="field-hint">{step.hint}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
