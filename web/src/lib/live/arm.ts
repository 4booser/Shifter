import { useEffect, useRef, useState } from 'react';

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
