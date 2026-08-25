'use client';

import { useEffect, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import {
  ACHIEVEMENTS,
  AchievementStats,
  achievementStats,
  claimNewUnlocks,
} from '@/lib/calendar/achievements';
import { fireConfetti, stagger } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { pushToast } from '@/lib/toast';
import { ALL_TIME } from '@/lib/store/calendar';

/** One all-time sweep per session is plenty; badges move slowly. */
let checkedThisSession = false;
let cachedStats: AchievementStats | null = null;

/** The latest translator, so a timer set early still speaks the right language. */
let latestTranslate: (key: string) => string = (key) => key;

async function allTimeStats(): Promise<AchievementStats> {
  if (cachedStats !== null) return cachedStats;

  const response = await calendarApi.days(ALL_TIME.from, ALL_TIME.to);

  cachedStats = achievementStats(response.days);

  return cachedStats;
}

/**
 * The quiet background check: any badge earned since the last visit gets a
 * toast and confetti, from whichever page the app opened on.
 */
export function useUnlockCheck(translate: (key: string) => string): void {
  latestTranslate = translate;

  // Module-level scheduling, deliberately without a cleanup: the shell
  // remounts on every route change, and a timer that dies with it would
  // never survive the 2.5 seconds it needs.
  useEffect(() => {
    if (checkedThisSession) return;

    checkedThisSession = true;

    setTimeout(() => {
      void allTimeStats()
        .then((stats) => {
          const fresh = claimNewUnlocks(stats);

          fresh.forEach((def, index) => {
            setTimeout(() => {
              pushToast({
                icon: def.icon,
                title: latestTranslate('Badge unlocked'),
                text: latestTranslate(def.name),
              });

              if (index === 0) fireConfetti({ y: 0.75, count: 110 });
            }, index * 900);
          });
        })
        .catch(() => {
          // Next visit tries again; a missed celebration keeps.
          checkedThisSession = false;
          cachedStats = null;
        });
    }, 2500);
  }, []);
}

/** Every badge, earned and not, with honest progress on the locked ones. */
export function BadgeWall() {
  const { t } = useI18n();
  const { format } = useMoney();
  const [stats, setStats] = useState<AchievementStats | null>(null);

  useEffect(() => {
    void allTimeStats().then(setStats).catch(() => undefined);
  }, []);

  if (stats === null) return null;

  const done = ACHIEVEMENTS.filter((def) => def.progressOf(stats) >= def.target).length;

  return (
    <section className="card reveal p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[1.05rem] font-bold">🎖️ {t('Badges')}</h2>
        <span className="field-hint tabular">
          {done} / {ACHIEVEMENTS.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
        {ACHIEVEMENTS.map((def, index) => {
          const progress = def.progressOf(stats);
          const unlocked = progress >= def.target;
          const share = Math.min(1, progress / def.target);

          return (
            <div key={def.id} className="badge-card reveal" data-locked={!unlocked} style={stagger(index % 10)}>
              <span className="badge-icon">{def.icon}</span>
              <strong className="text-[0.78rem] leading-tight">{t(def.name)}</strong>
              <span className="field-hint !text-[0.68rem] leading-tight">
                {def.money === true
                  ? t(def.hint).replace(/\d[\d  ]*\d/, format(def.target))
                  : t(def.hint)}
              </span>
              {!unlocked && (
                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-(--accent) transition-[width] duration-700"
                    style={{ width: `${share * 100}%` }}
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
