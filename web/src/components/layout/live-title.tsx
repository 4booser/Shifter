'use client';

import { useEffect } from 'react';

import { formatElapsed, useLive, workedMs } from '@/lib/live/live-shift';
import { setLiveTitle } from '@/lib/use-title';

/**
 * The running shift, visible from any tab in the strip: the browser title
 * carries the dot and the elapsed time while somebody is on the floor, the
 * pause mark while they are on a break, and hands the tab back to its page
 * the moment the shift ends.
 */
export function LiveTitle() {
  const live = useLive((state) => state.live);

  useEffect(() => {
    if (live === null) {
      setLiveTitle(null);

      return;
    }

    // The clock stops on a break, so the dot has to stop with it: a title
    // that keeps its running mark over a frozen number reads as a hung page.
    const say = () =>
      setLiveTitle(
        `${live.pausedAt === null ? '●' : '⏸'} ${formatElapsed(workedMs(live, Date.now()))} — Shifter`,
      );

    say();

    const handle = setInterval(say, 1_000);

    return () => {
      clearInterval(handle);
      setLiveTitle(null);
    };
  }, [live]);

  return null;
}
