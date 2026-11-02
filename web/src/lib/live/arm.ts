import { useEffect, useRef, useState } from 'react';

import { useI18n } from '@/lib/i18n';
import { pushToast } from '@/lib/toast';
import { cancelLiveShift } from './live-shift';

/** A control that has to be pressed twice. */
export function useArmed(act: () => void, within = 4000): {
  armed: boolean;
  press: () => void;
  disarm: () => void;
} {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const disarm = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  };

  const press = (): void => {
    if (armed) {
      disarm();
      act();
      return;
    }

    setArmed(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setArmed(false);
    }, within);
  };

  return { armed, press, disarm };
}

/** Discard, pressed twice. A clock that had to stay says why, or the press would look like it did nothing. */
export function useDiscard(then?: () => void): ReturnType<typeof useArmed> {
  const { t } = useI18n();

  return useArmed(() => {
    then?.();

    void cancelLiveShift().then((stopped) => {
      if (stopped) return;

      pushToast({
        icon: '⏰',
        title: t('The clock is still running'),
        text: t('The discard needs the server, or the shift would still close as worked. Try again when you are online.'),
      });
    });
  });
}
