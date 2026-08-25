'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { authApi } from '@/lib/api/auth';
import { stagger } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
import { startLiveShift, useLive } from '@/lib/live/live-shift';
import { THEME_PRESETS } from '@/lib/settings/settings';
import { useSettings } from '@/lib/settings/store';
import { todayKey } from '@/lib/calendar/calendar-date';
import { calendarActions, useCalendar } from '@/lib/store/calendar';
import { Icon } from '@/components/ui/icon';

/**
 * Cmd+K from anywhere: navigation, day search, appearance, the live shift —
 * one text box away. Fuzzy subsequence matching, ranked by how tight the
 * match is, so "wbh" still lands on Webhooks.
 */

interface Command {
  id: string;
  icon: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** Dashboard-only actions announce themselves over this event. */
export const PALETTE_EVENT = 'shifter:cmd';

/** Anything can open the palette by firing this — the header button does. */
export const PALETTE_OPEN_EVENT = 'shifter:palette';

function score(query: string, label: string): number | null {
  const hay = label.toLowerCase();
  const needle = query.toLowerCase();

  if (needle.length === 0) return 0;

  let at = -1;
  let gaps = 0;

  for (const char of needle) {
    const next = hay.indexOf(char, at + 1);

    if (next === -1) return null;

    if (at !== -1) gaps += next - at - 1;
    at = next;
  }

  // Earlier and tighter matches beat scattered ones.
  return gaps * 2 + hay.indexOf(needle[0]);
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const update = useSettings((state) => state.update);
  const settings = useSettings((state) => state.settings);
  const templates = useCalendar((state) => state.templates);
  const live = useLive((state) => state.live);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hot, setHot] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((state) => !state);
        setQuery('');
        setHot(0);
      }

      if (event.key === 'Escape') setOpen(false);
    };

    const onOpen = () => {
      setOpen(true);
      setQuery('');
      setHot(0);
    };

    addEventListener('keydown', onKey);
    addEventListener(PALETTE_OPEN_EVENT, onOpen);

    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener(PALETTE_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };

    const emit = (detail: string) => () => {
      setOpen(false);

      if (pathname !== '/dashboard') router.push('/dashboard');

      // Give the dashboard a tick to mount its listeners after navigation.
      setTimeout(() => dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail })), 60);
    };

    const list: Command[] = [
      { id: 'nav-dashboard', icon: 'calendar', label: t('Calendar'), run: go('/dashboard') },
      { id: 'nav-schedule', icon: 'users', label: t('Schedule'), run: go('/schedule') },
      { id: 'nav-payouts', icon: 'wallet', label: t('Payouts'), run: go('/payouts') },
      { id: 'nav-stats', icon: 'chart', label: t('Statistics'), run: go('/stats') },
      { id: 'nav-wrapped', icon: 'trophy', label: t('Your year'), run: go('/wrapped') },
      { id: 'nav-report', icon: 'note', label: t('Monthly report'), run: go('/report') },
      { id: 'nav-account', icon: 'user', label: t('Account'), run: go('/account') },
      { id: 'nav-webhooks', icon: 'swap', label: t('Webhooks'), run: go('/webhooks') },
      { id: 'today', icon: 'spark', label: t('Go to today'), run: emit('today') },
      { id: 'search', icon: 'search', label: t('Search days'), hint: '⌘F', run: emit('search') },
      { id: 'settings', icon: 'sliders', label: t('Appearance'), run: emit('settings') },
      {
        id: 'hide',
        icon: settings.hideAmounts ? 'eye' : 'eye-off',
        label: settings.hideAmounts ? t('Show amounts') : t('Hide amounts'),
        run: () => {
          update('hideAmounts', !settings.hideAmounts);
          setOpen(false);
        },
      },
      {
        id: 'logout',
        icon: 'logout',
        label: t('Sign out'),
        run: () => {
          authApi.logout();
          router.replace('/login');
        },
      },
    ];

    // Clock in, straight from the keyboard — but only while nothing is live.
    if (live === null) {
      for (const template of templates.filter((item) => !item.archived).slice(0, 6)) {
        list.push({
          id: `start-${template.id}`,
          icon: 'clock',
          label: `${t('Start shift')}: ${template.name}`,
          hint: `${template.start_time}–${template.end_time}`,
          run: () => {
            startLiveShift(template);
            calendarActions.select(todayKey());
            setOpen(false);
          },
        });
      }
    }

    const accents: { label: string; value: string }[] = [
      { label: 'Indigo', value: '#4F46E5' },
      { label: 'Ocean', value: '#0284C7' },
      { label: 'Teal', value: '#0D9488' },
      { label: 'Emerald', value: '#16A34A' },
      { label: 'Violet', value: '#7C3AED' },
      { label: 'Coral', value: '#E11D48' },
      { label: 'Amber', value: '#D97706' },
      { label: 'Rose', value: '#DB2777' },
    ];

    for (const accent of accents) {
      list.push({
        id: `accent-${accent.value}`,
        icon: 'brush',
        label: `${t('Accent')}: ${t(accent.label)}`,
        run: () => {
          update('accent', accent.value);
          setOpen(false);
        },
      });
    }

    for (const theme of THEME_PRESETS) {
      list.push({
        id: `theme-${theme.value}`,
        icon: theme.dark ? 'moon' : 'sun',
        label: `${t('Theme')}: ${t(theme.label)}`,
        run: () => {
          update('theme', theme.value);
          setOpen(false);
        },
      });
    }

    return list;
  }, [t, router, pathname, settings.hideAmounts, update, templates, live]);

  const matches = useMemo(() => {
    return commands
      .map((command) => ({ command, rank: score(query, command.label) }))
      .filter((entry): entry is { command: Command; rank: number } => entry.rank !== null)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 9)
      .map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => setHot(0), [query]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHot((current) => Math.min(matches.length - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHot((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter') {
      matches[hot]?.run();
    }
  };

  return (
    <>
      <div className="palette-backdrop" onClick={() => setOpen(false)} />
      <div className="palette" role="dialog" aria-label={t('Command palette')}>
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Icon name="search" size={16} className="text-muted" />
          <input
            ref={input}
            className="w-full bg-transparent text-[0.95rem] outline-none"
            placeholder={t('Type a command or page…')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[0.65rem] text-muted">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1.5" key={query}>
          {matches.length === 0 && (
            <p className="px-4 py-6 text-center text-[0.88rem] text-muted">{t('Nothing matches')}</p>
          )}
          {matches.map((command, index) => (
            <button
              key={command.id}
              type="button"
              className="palette-row"
              style={stagger(index)}
              data-hot={index === hot}
              onMouseEnter={() => setHot(index)}
              onClick={command.run}
            >
              <Icon name={command.icon} size={15} className="text-muted" />
              <span className="flex-1 truncate">{command.label}</span>
              {command.hint !== undefined && <span className="text-[0.72rem] text-muted">{command.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
