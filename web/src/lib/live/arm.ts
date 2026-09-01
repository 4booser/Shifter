import { useEffect, useRef, useState } from 'react';

/**
 * A control that has to be pressed twice.
 *
 * Discarding a running shift throws away hours nobody wrote down anywhere
 * else, and the button that does it sits a thumb's width from the one that
 * banks them. So the first press only arms it: the label changes, the colour
 * changes, and the second press within a few seconds does the deed. Walk
 * away and it disarms itself, because a control left cocked is a trap for
 * whoever picks the phone up next.
 */
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
