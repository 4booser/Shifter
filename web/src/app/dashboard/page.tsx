'use client';

import { useEffect, useMemo, useState } from 'react';

import { monthLabel, todayKey } from '@/lib/calendar/calendar-date';
import { ShiftTemplate } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { distanceMetres } from '@/lib/calendar/geo';
import { startLiveShift, useLive } from '@/lib/live/live-shift';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import {
  calendarActions,
  loadCatalogues,
  redo,
  reload,
  undo,
  useCalendar,
} from '@/lib/store/calendar';
import { Shell } from '@/components/layout/shell';
import { FirstRun } from '@/components/dashboard/first-run';
import { ConflictModal } from '@/components/dashboard/modals/conflict-modal';
import { DayPanel } from '@/components/dashboard/day-panel';
import { DraftWeek } from '@/components/dashboard/draft-week';
import { MonthGrid } from '@/components/dashboard/month-grid';
import { Sidebar } from '@/components/dashboard/sidebar';
import { InsightsPanel } from '@/components/dashboard/insights-panel';
import { TileStrip } from '@/components/dashboard/tiles';
import { TipsTicker } from '@/components/dashboard/tips-ticker';
import { DailyBrief } from '@/components/dashboard/daily-brief';
import { BriefChart } from '@/components/dashboard/brief-chart';
import { PALETTE_EVENT } from '@/components/command/palette';
import { useReveal } from '@/lib/fx';
import { SearchModal } from '@/components/dashboard/modals/search-modal';
import { SettingsModal } from '@/components/dashboard/modals/settings-modal';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { useTitle } from '@/lib/use-title';

export default function DashboardPage() {
  return (
    <Shell>
      <Dashboard />
    </Shell>
  );
}

function Dashboard() {
  const { t, n } = useI18n();

  useTitle('Calendar');
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

  // Cmd+Z / Shift+Cmd+Z work anywhere on the page except inside a field —
  // a text box owns its own undo and must keep it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if (typing) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();

        if (event.shiftKey) void redo();
        else void undo();
      }

      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        calendarActions.previous();
      }

      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        calendarActions.next();
      }
    };

    addEventListener('keydown', onKey);

    return () => removeEventListener('keydown', onKey);
  }, []);

  // The tab is a status line: which month, and what it has brought so far.
  useEffect(() => {
    const month = monthLabel(state.month, useSettings.getState().settings.language);
    const earned = state.summary.total_earned;

    document.title =
      earned > 0
        ? `${month} · ${formatMoney(useSettings.getState().settings, earned)} — Shifter`
        : `${month} — Shifter`;

    return () => {
      document.title = 'Shifter';
    };
  }, [state.month, state.summary.total_earned]);

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

  // The installed app's icon carries the number of days still open.
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    if (unclosed.length > 0) void nav.setAppBadge?.(unclosed.length);
    else void nav.clearAppBadge?.();

    // The browser-tab fallback: a dot burned onto the favicon.
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? (() => {
      const created = document.createElement('link');

      created.rel = 'icon';
      document.head.appendChild(created);

      return created;
    })();

    if (unclosed.length === 0) {
      link.href = '/favicon.ico';

      return;
    }

    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');

      canvas.width = 32;
      canvas.height = 32;

      const context = canvas.getContext('2d');

      if (context === null) return;

      context.drawImage(image, 0, 0, 32, 32);
      context.fillStyle = '#e0655f';
      context.beginPath();
      context.arc(25, 7, 6.5, 0, Math.PI * 2);
      context.fill();
      link.href = canvas.toDataURL('image/png');
    };
    image.src = '/icons/icon-192.png';
  }, [unclosed.length]);

  // The home-screen shortcut "start a shift" lands here with ?action=start.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('action') !== 'start') return;

    history.replaceState(null, '', '/dashboard');
    setTimeout(() => dispatchEvent(new CustomEvent('shifter:palette')), 600);
  }, []);

  // The at-the-door nudge: today has a planned shift at a pinned place, the
  // browser has already granted location (never prompt from here), and the
  // phone stands within 300 metres — offer to start. Once per day.
  const [nearby, setNearby] = useState<{ template: ShiftTemplate; place: string } | null>(null);

  useEffect(() => {
    const today = todayKey();
    const stampKey = 'shifter.geoNudge';

    if (localStorage.getItem(stampKey) === today) return;
    if (useLive.getState().live !== null) return;

    const day = state.days.get(today);
    const planned = day?.shifts.find((entry) => !entry.worked);

    if (planned === undefined) return;

    const template = state.templates.find((item) => item.id === planned.shift_id);
    const place = state.locations.find((item) => item.id === template?.location_id);

    if (template === undefined || place === undefined || place.latitude === null || place.longitude === null)
      return;

    let cancelled = false;

    void navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled || status.state !== 'granted') return;

        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (cancelled) return;

            const metres = distanceMetres(
              position.coords.latitude,
              position.coords.longitude,
              place.latitude as number,
              place.longitude as number,
            );

            if (metres <= 300) {
              localStorage.setItem(stampKey, today);
              setNearby({ template, place: place.name });
            }
          },
          () => undefined,
          { timeout: 8000, maximumAge: 120_000 },
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [state.days, state.templates, state.locations]);

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
            {n(unclosed.length, 'days')} {t('worked have no tips or sales recorded')}
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

      {nearby !== null && (
        <Alert kind="info" onDismiss={() => setNearby(null)}>
          <span className="flex flex-wrap items-center gap-2">
            📍 {t('Looks like you are at')} <strong>{nearby.place}</strong>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                startLiveShift(nearby.template);
                setNearby(null);
              }}
            >
              {t('Start shift')}: {nearby.template.name}
            </button>
          </span>
        </Alert>
      )}

      {needsSetup && <FirstRun />}

      {!needsSetup && <TileStrip />}
      {!needsSetup && <TipsTicker />}
      {!needsSetup && <InsightsPanel />}

      {/*
        Three columns of cards, each ending where its content does. The day
        panel used to be one tall card pinned to the top with its own
        scrollbar; two scroll areas on one page is a fight nobody wins with a
        wheel, and it unpinned halfway down anyway.
      */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {/* The two side columns wear the same cap and scroll inside it, so
            they are the same height by construction — one line with the
            calendar between them. */}
        <div className="contents lg:block lg:max-h-[calc(100dvh-5.5rem)] lg:flex-none lg:self-start lg:overflow-y-auto lg:pr-0.5 lg:sticky lg:top-[4.25rem]">
        <Sidebar />
        </div>
        <div className="order-1 flex min-w-0 flex-1 flex-col gap-3 lg:order-none">
          <MonthGrid onSearch={() => setSearchOpen(true)} onSettings={() => setSettingsOpen(true)} />
          {/* The page used to trail off under the grid; the day in words
              belongs exactly there. */}
          {!needsSetup && <DailyBrief />}
          {!needsSetup && <BriefChart />}
          {!needsSetup && <DraftWeek />}
        </div>
        <div
          className="order-2 w-full flex-none lg:order-none lg:sticky lg:top-[4.25rem] lg:max-h-[calc(100dvh-5.5rem)] lg:w-72 lg:overflow-y-auto lg:pr-0.5 xl:w-80"
          data-tour="daypanel"
        >
          <DayPanel />
          <ConflictModal />
        </div>
      </div>

      {/* Undo, floating over the calendar where the change happened. */}
      {state.undoVisible && (state.undoStack.length > 0 || state.redoStack.length > 0) && (
        <div className="fixed bottom-16 left-1/2 z-50 -translate-x-1/2 md:bottom-6">
          <div className="card flex items-center gap-3 px-4 py-2.5 shadow-(--shadow-lg)">
            <Icon name="repeat" size={15} className="text-muted" />
            <span className="text-[0.88rem]">
              {t(state.undoStack.at(-1)?.label ?? state.redoStack.at(-1)?.label ?? '')}
              {state.undoStack.length > 1 && (
                <span className="text-faint tabular"> · {state.undoStack.length}</span>
              )}
            </span>
            {state.undoStack.length > 0 && (
              <button type="button" className="btn btn-primary btn-sm" title="⌘Z" onClick={() => void undo()}>
                {t('Undo')}
              </button>
            )}
            {state.redoStack.length > 0 && (
              <button type="button" className="btn btn-sm" title="⇧⌘Z" onClick={() => void redo()}>
                {t('Redo')}
              </button>
            )}
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

