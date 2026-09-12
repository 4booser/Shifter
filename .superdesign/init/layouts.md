# Layouts — the shell every page wears

## `web/src/components/layout/shell.tsx` — the signed-in shell

Top bar: logo, 9 nav pills, live-shift ticker, search, «мк» key badge,
eye (hide amounts), avatar menu. Wraps every page but the public ones.

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { authApi } from '@/lib/api/auth';
import { onSessionChange, readSession } from '@/lib/api/http';
import { useEscape } from '@/lib/a11y';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/lib/settings/store';
import { flushOffline, loadCatalogues, useCalendar } from '@/lib/store/calendar';
import { PointerFx, PressRipple, RevealObserver } from '@/lib/fx';
import { Toasts } from '@/lib/toast';
import { useUnlockCheck } from '@/components/achievements/badges';
import { CommandPalette, PALETTE_OPEN_EVENT } from '@/components/command/palette';
import { LiveBar } from '@/components/live/live-bar';
import { ShiftDoneOverlay } from '@/components/live/shift-done';
import { FeatureTour } from '@/components/tour/tour';
import { Icon } from '@/components/ui/icon';
import { Avatar } from '@/components/ui/avatar';
import { Profile, accountApi } from '@/lib/api/auth';
import { LiveTitle } from '@/components/layout/live-title';

const NAV: { href: string; label: string; icon: string }[] = [
  { href: '/dashboard', label: 'Calendar', icon: 'calendar' },
  { href: '/schedule', label: 'Schedule', icon: 'users' },
  { href: '/gigs', label: 'Gigs', icon: 'spark' },
  { href: '/payouts', label: 'Payouts', icon: 'wallet' },
  { href: '/bank', label: 'Bank', icon: 'coins' },
  { href: '/stats', label: 'Statistics', icon: 'chart' },
  { href: '/assistant', label: 'Assistant', icon: 'note' },
  { href: '/wrapped', label: 'Your year', icon: 'trophy' },
  { href: '/cv', label: 'Your record', icon: 'user' },
];

/**
 * The signed-in frame: one sticky top bar on wide screens, a tab bar on
 * narrow ones, and the client-side guard that sends anonymous visitors to the
 * login page. Pages render inside it.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const pendingOffline = useCalendar((state) => state.pendingOffline);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEscape(menuOpen, () => setMenuOpen(false));
  const [face, setFace] = useState<Profile | null>(null);

  /**
   * One integer, so decisions about what to build next stop being guesses.
   *
   * The screen's name off the path and nothing else — no identifier of any
   * kind reaches this, by design and by test. Failing is silent: a counter
   * that can interrupt somebody's evening has its priorities backwards.
   */
  useEffect(() => {
    const screen = pathname.split('/')[1] || 'calendar';

    void fetch('/shifter/v1/status/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screen }),
    }).catch(() => undefined);
  }, [pathname]);

  useEffect(() => {
    void accountApi.get().then(setFace).catch(() => undefined);
  }, []);

  // The guard: no session, no page. Client-side, because the export is static.
  useEffect(() => {
    const check = () => {
      if (readSession() === null) {
        router.replace(`/login?returnUrl=${encodeURIComponent(pathname)}`);
      } else {
        setReady(true);
      }
    };

    check();

    return onSessionChange(check);
  }, [router, pathname]);

  useUnlockCheck(t);

  // Shift templates power the palette and the live bar on every page.
  useEffect(() => {
    if (ready) void loadCatalogues();
  }, [ready]);

  // Whatever the offline queue holds goes out as soon as a connection returns.
  useEffect(() => {
    void flushOffline();

    const flush = () => void flushOffline();

    addEventListener('online', flush);

    return () => removeEventListener('online', flush);
  }, []);

  // Said out loud, in the outbox's own words: the basement has no bars, the
  // app keeps working, and nothing typed is lost.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);

    const down = () => setOffline(true);
    const up = () => setOffline(false);

    addEventListener('offline', down);
    addEventListener('online', up);

    return () => {
      removeEventListener('offline', down);
      removeEventListener('online', up);
    };
  }, []);

  if (!ready) return null;

  const logout = () => {
    authApi.logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-dvh">
      <LiveTitle />
      <header className="app-chrome sticky top-0 z-40 border-b border-border bg-(--surface)/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-1 px-3 sm:px-5">
          <Link href="/dashboard" className="mr-2 flex items-center gap-2 font-bold tracking-tight">
            <span
              className="grid h-7 w-7 place-items-center rounded-lg text-[0.95rem]"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              S
            </span>
            <span className="hidden text-[1.05rem] sm:inline">Shifter</span>
          </Link>

          <DesktopNav pathname={pathname} />

          <div className="ml-auto flex items-center gap-1">
            <LiveBar />
            {/* Losing the network and getting it back changes nothing a
                screen reader would notice: no focus moves, no page loads. */}
            <span className="sr-only" role="status">
              {offline ? t('offline') : ''}
            </span>
            {offline && (
              <span className="chip chip-warn" title={t('Changes will be sent when the network returns')}>
                {t('offline')}
              </span>
            )}
            {pendingOffline > 0 && (
              <button
                type="button"
                className="chip chip-warn"
                onClick={() => void flushOffline()}
                title={t('days waiting to sync')}
              >
                <Icon name="repeat" size={12} />
                {pendingOffline}
              </button>
            )}

            <button
              type="button"
              className="btn btn-quiet btn-sm"
              aria-label={t('Command palette')}
              data-tour="palette"
              title="⌘K"
              onClick={() => dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT))}
            >
              <Icon name="search" size={16} />
              <kbd className="hidden rounded border border-border px-1 text-[0.62rem] text-muted lg:inline">⌘K</kbd>
            </button>

            <button
              type="button"
              className="btn btn-quiet btn-sm"
              aria-label={t('Hide amounts')}
              onClick={() => update('hideAmounts', !settings.hideAmounts)}
            >
              <Icon name={settings.hideAmounts ? 'eye-off' : 'eye'} size={16} />
            </button>

            <div className="relative">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-label={t('Account')}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {face !== null && face.avatar_kind !== null ? (
                  <Avatar kind={face.avatar_kind} data={face.avatar_data} name={face.first_name} size={22} />
                ) : (
                  <Icon name="user" size={16} />
                )}
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="card absolute right-0 z-50 mt-1.5 w-52 overflow-hidden py-1 shadow-(--shadow-lg)">
                    {[
                      { href: '/account', label: 'Account', icon: 'user' },
                      { href: '/webhooks', label: 'Webhooks', icon: 'swap' },
                      { href: '/whats-new', label: 'What’s new', icon: 'spark' },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-[0.88rem] hover:bg-surface-2"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Icon name={item.icon} size={15} className="text-muted" />
                        {t(item.label)}
                      </Link>
                    ))}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[0.88rem] text-danger-read hover:bg-surface-2"
                      onClick={logout}
                    >
                      <Icon name="logout" size={15} />
                      {t('Sign out')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-3 pb-24 pt-4 sm:px-5 md:pb-8">{children}</main>

      <CommandPalette />
      <ShiftDoneOverlay />
      <FeatureTour />
      <Toasts />
      <PointerFx />
      <PressRipple />
      <RevealObserver />

      {/* Narrow screens: the five destinations as a thumb-height tab bar. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-(--surface)/92 backdrop-blur-md md:hidden">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.62rem] font-medium ${
                active ? 'text-(--accent-read)' : 'text-muted'
              }`}
            >
              <Icon name={item.icon} size={19} />
              {t(item.label)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}


/**
 * The desktop nav with a pill that slides between items instead of teleporting
 * — measured with getBoundingClientRect on every route change and window
 * resize, then moved with a transform the CSS springs.
 */
function DesktopNav({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const host = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const place = () => {
      const nav = host.current;
      const marker = pill.current;

      if (nav === null || marker === null) return;

      const active = nav.querySelector<HTMLElement>('[data-active="true"]');

      if (active === null) {
        marker.style.opacity = '0';

        return;
      }

      const navBox = nav.getBoundingClientRect();
      const box = active.getBoundingClientRect();

      marker.style.opacity = '1';
      marker.style.width = `${box.width}px`;
      marker.style.transform = `translateX(${box.left - navBox.left}px)`;
    };

    place();
    addEventListener('resize', place);

    // Fonts settling shifts widths a few pixels; re-measure once they load.
    void document.fonts?.ready.then(place);

    return () => removeEventListener('resize', place);
  }, [pathname]);

  return (
    <nav ref={host} className="relative hidden items-center gap-0.5 md:flex">
      <span ref={pill} className="nav-pill" style={{ opacity: 0 }} aria-hidden="true" />
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            data-active={active}
            className={`relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.85rem] font-medium transition-colors ${
              active ? 'text-(--accent-ink)' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon name={item.icon} size={15} />
            {t(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}
```

## `mobile/src/components/tab-bar.tsx` — the phone's tab bar

Six tabs with a spring-animated pill behind the active one.

```tsx
import { Ionicons } from '@expo/vector-icons';
// Through expo-router rather than from @react-navigation directly: the router
// re-exports the navigator it actually mounts, and the two can be different
// copies with incompatible types.
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/theme';
import { buzz } from '@/lib/haptics';

const PILL_HEIGHT = 30;

/**
 * The bar that is on screen the whole time.
 *
 * The default one is five grey icons that turn blue, and it is the single
 * most-looked-at piece of the app. A pill that travels to the tab you picked
 * says where you are with a shape rather than with a colour, which survives
 * being glanced at, and it answers the thumb: a tab that taps back is a tab
 * people trust they hit.
 */
export function TabBar({
  state,
  descriptors,
  navigation,
  palette,
  icons,
}: BottomTabBarProps & {
  palette: Palette;
  /** Route name to icon, so the bar owns no knowledge of the screens. */
  icons: Record<string, keyof typeof Ionicons.glyphMap>;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = makeStyles(palette);

  const count = state.routes.length;
  const slot = width / count;
  const pillWidth = Math.min(slot - 18, 62);
  const at = useSharedValue(state.index);

  useEffect(() => {
    at.value = withSpring(state.index, { damping: 18, stiffness: 210, mass: 0.6 });
  }, [state.index, at]);

  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: at.value * slot + (slot - pillWidth) / 2 }],
  }));

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom || 8 }]}>
      <Animated.View
        style={[styles.pill, { width: pillWidth, height: PILL_HEIGHT }, pill]}
        pointerEvents="none"
      />

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.title === 'string' ? options.title : route.name;
        const active = state.index === index;

        return (
          <Pressable
            key={route.key}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={active ? { selected: true } : {}}
            accessibilityLabel={label}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (active || event.defaultPrevented) return;

              buzz.choose();
              navigation.navigate(route.name);
            }}
          >
            <Ionicons
              // The filled variant for the tab you are on: the difference
              // reads at a glance where a colour change alone does not.
              name={active ? icons[route.name] : (`${icons[route.name]}-outline` as never)}
              size={21}
              color={active ? palette.accent : palette.textSecondary}
            />
            <Text
              style={[styles.label, active && styles.labelOn]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: palette.backgroundElement,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      paddingTop: 8,
    },
    pill: {
      position: 'absolute',
      top: 4,
      left: 0,
      borderRadius: 12,
      backgroundColor: palette.accentSoft,
    },
    tab: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
    label: { color: palette.textSecondary, fontSize: 10, fontWeight: '600' },
    labelOn: { color: palette.accent, fontWeight: '800' },
  });
```
